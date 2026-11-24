import { P, VIEW_W, VIEW_H, SHIP_SCREEN_X } from './params';
import { Terrain } from './terrain';
import { Accuracy } from './accuracy';
import { Fx } from './fx';
import { Sfx } from './audio';
import { Music } from './music';
import { Input } from './input';
import { stepShip, type ShipState } from './physics';
import { buildChart, guideAt, sectionAtFrame, START_Y, type Chart } from './song/chart';
import { SONGS, SECTION_LABEL, type SongDef } from './song/songs';

type State = 'select' | 'play' | 'dead' | 'clear';

const WHITE = { name: 'ホワイト', color: '#f4f7ff' };
const LEVEL_COLORS = ['#9fb3ff', '#7cf0ff', '#6dff9e', '#d4ff4a', '#ffd23e', '#ff9a3c', '#ff5a5a', '#ff4fd8'];
/** 区間ごとの壁の塗り（曲の展開で景色を変える） */
const SECTION_FILL: Record<string, string> = {
  intro: '#2a2550', a: '#1f3a4f', b: '#3d2347', sabi: '#4a3220', outro: '#22304f',
};

interface Save { best: Record<string, number>; cleared: Record<string, boolean>; color: number }

interface Button { label: string; x: number; y: number; w: number; h: number; action: () => void }

/** 時計：本番は音の時刻、`?autotest` では 1 update = 1 フレーム（自動操縦の確認用） */
const MANUAL_CLOCK = new URLSearchParams(location.search).has('autotest');

export class Game {
  state: State = 'select';
  paused = false;
  selected = 0;
  chart: Chart | null = null;
  terrain: Terrain | null = null;
  acc = new Accuracy(30);
  fx = new Fx();
  /** 画面座標の演出（紙吹雪） */
  private uiFx = new Fx();
  ship: ShipState = { y: START_Y, vy: 0, holdFrames: 0 };
  /** 曲の頭からのフレーム。カウントイン中は負 */
  songFrame = 0;
  hp = P.hp;
  private invincible = 0;
  private songStart = 0;
  private frame = 0;
  private resultFrames = 0;
  private trail: { x: number; y: number }[] = [];
  private save: Save;
  private newBest = false;
  private newColor: string | null = null;
  private sectionIndex = -1;
  private crashY = 0;
  private exploded = false;
  private shipFlash = 0;
  /** 最後まで飛んだがゲージ不足 */
  private gaugeFailed = false;
  private buttons: Button[] = [];
  private music: Music;
  private stars = Array.from({ length: 70 }, () => ({
    x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, z: 0.15 + Math.random() * 0.5,
  }));

  constructor(private input: Input, private sfx: Sfx) {
    this.music = new Music(sfx);
    const raw = JSON.parse(localStorage.getItem('suresure.save') ?? 'null');
    // 旧版（エンドレス）のセーブは形が違うので作り直す
    this.save = raw && typeof raw.best === 'object' ? raw : { best: {}, cleared: {}, color: 0 };
    input.onKey = (code) => this.onKey(code);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') this.setPaused(true);
    });
  }

  get worldX(): number { return Math.max(0, this.songFrame) * (this.chart?.speed ?? 0); }
  private get camX(): number { return this.worldX - SHIP_SCREEN_X; }
  private get colors() { return [WHITE, ...SONGS.filter((s) => this.save.cleared[s.id]).map((s) => s.unlockColor)]; }
  private get shipColor(): string { return (this.colors[this.save.color] ?? WHITE).color; }
  private get song(): SongDef { return SONGS[this.selected]; }

  private onKey(code: string): void {
    if (code === 'KeyM') this.sfx.toggleMute();
    if (this.state === 'select') {
      if (code === 'ArrowLeft') this.selected = (this.selected + SONGS.length - 1) % SONGS.length;
      if (code === 'ArrowRight') this.selected = (this.selected + 1) % SONGS.length;
      if (code === 'KeyC') this.cycleColor();
      return;
    }
    if (code === 'KeyP' || code === 'Escape') {
      if (this.state === 'play') this.setPaused(!this.paused);
      else if (code === 'Escape') this.toSelect();
    }
  }

  private setPaused(p: boolean): void {
    this.paused = p;
    if (!this.sfx.ctx || MANUAL_CLOCK) return;
    if (p) void this.sfx.ctx.suspend(); else void this.sfx.ctx.resume();
  }

  private cycleColor(): void {
    this.save.color = (this.save.color + 1) % this.colors.length;
    this.persist();
  }

  private persist(): void {
    localStorage.setItem('suresure.save', JSON.stringify(this.save));
  }

  private toSelect(): void {
    this.music.stop();
    this.state = 'select';
    this.paused = false;
  }

  startSong(index: number): void {
    this.selected = index;
    // 物理の値を ?debug で変えた場合に備え、毎回譜面を作り直す（数ms）
    this.chart = buildChart(this.song);
    this.terrain = new Terrain(this.chart);
    this.acc = new Accuracy(this.chart.framesPerStep * 4);
    this.ship = { y: START_Y, vy: 0, holdFrames: 0 };
    this.hp = P.hp;
    this.invincible = 0;
    this.trail = [];
    this.newBest = false;
    this.newColor = null;
    this.gaugeFailed = false;
    this.sectionIndex = -1;
    this.shipFlash = 0;
    this.paused = false;
    this.state = 'play';
    const barFrames = this.chart.framesPerStep * 16;
    this.songFrame = -Math.round(barFrames); // 1小節のカウントイン
    if (this.sfx.ctx) {
      void this.sfx.ctx.resume();
      const barSec = (60 / this.chart.song.bpm) * 4;
      this.songStart = this.sfx.ctx.currentTime + 0.1 + barSec;
      this.music.start(this.chart, this.songStart);
    }
  }

  /** 音の時刻から、今いるべきフレーム */
  private targetFrame(): number {
    if (MANUAL_CLOCK || !this.sfx.ctx) return this.songFrame + 1;
    const t = this.sfx.ctx.currentTime - this.songStart - this.sfx.latency() - P.audioOffsetMs / 1000;
    return Math.floor(t * 60);
  }

  // ------------------------------------------------------------ 更新

  update(): void {
    this.frame++;
    const inp = this.input;
    if (inp.pressed) {
      this.sfx.unlock();
      if (this.handlePress(inp.pressPos)) inp.consume();
    }
    this.fx.update();
    this.uiFx.update();
    if (this.paused) return;
    if (this.shipFlash > 0) this.shipFlash--;

    if (this.state === 'play') {
      if (this.fx.hitstop > 0) { this.fx.hitstop--; return; }
      const target = this.targetFrame();
      // 遅れていたら追いつく（被弾のヒットストップ明けなど）。一度に進めすぎない
      let n = 0;
      while (this.songFrame < target && n < 12 && this.state === 'play') {
        this.stepSong();
        n++;
        if (this.fx.hitstop > 0) break;
      }
    } else if (this.state === 'dead') {
      if (this.fx.hitstop > 0) { this.fx.hitstop--; return; }
      if (!this.exploded) {
        this.exploded = true;
        this.fx.explode(this.worldX, this.crashY);
        this.fx.shake('big');
      }
      this.resultFrames++;
    } else if (this.state === 'clear') {
      this.resultFrames++;
    }
  }

  /** 押下の処理。ボタン等で消費したら true */
  private handlePress(pos: { x: number; y: number } | null): boolean {
    if (pos && pos.y < 60 && pos.x > VIEW_W - 118) {
      if (pos.x > VIEW_W - 60) { if (this.state === 'play') this.setPaused(!this.paused); }
      else this.sfx.toggleMute();
      return true;
    }
    if (this.paused) { this.setPaused(false); return true; }
    if (this.state === 'select') {
      if (pos) {
        const i = this.cardRects().findIndex((r) => inRect(pos, r));
        if (i >= 0) { this.startSong(i); return true; }
        const sw = this.swatchRect();
        if (sw && inRect(pos, sw)) { this.cycleColor(); return true; }
        return true;
      }
      this.startSong(this.selected);
      return true;
    }
    if (this.state === 'dead' || this.state === 'clear') {
      if (this.resultFrames < P.retryLock) return true;
      const b = pos && this.buttons.find((bt) => inRect(pos, bt));
      if (b) b.action();
      // 左のボタンと同じ：ミス・ゲージ不足はもう一回（リトライは迅速に #116）、クリアは曲選択へ
      else if (this.state === 'dead' || this.gaugeFailed) this.startSong(this.selected);
      else this.toSelect();
      return true;
    }
    return false;
  }

  private stepSong(): void {
    const chart = this.chart!, terrain = this.terrain!;
    if (this.songFrame < 0) { this.songFrame++; return; } // カウントイン：自機は止めておく
    const f = this.songFrame;
    // 気流：理想の軌道からずれた分だけ引き戻す（正確なら力はゼロ）
    stepShip(this.ship, this.input.held, guideAt(chart, f));
    this.songFrame++;
    const x = this.worldX;
    if (this.invincible > 0) this.invincible--;

    const near = terrain.nearest(x, this.ship.y);
    if ((near.inside || near.dist - P.shipRadius <= 0) && this.invincible <= 0) {
      this.hit(near.px, near.py);
      if (this.state !== 'play') return;
    }

    // 採点：押している・離しているが譜面と合っているか（音価と離すタイミング）。高さは見ない
    const ev = this.acc.step(this.input.held, chart.held[f] === 1, chart.edgeDist[f]);
    if (ev === 'levelUp') {
      this.fx.shake('small');
      const lc = LEVEL_COLORS[this.acc.level - 1];
      this.fx.popup(`×${this.acc.level}  ${this.acc.combo} COMBO`, SHIP_SCREEN_X + 60, this.ship.y - 34, lc);
      this.sfx.levelUp(this.acc.level);
    } else if (ev === 'comboBreak') {
      this.fx.popup('COMBO 切れ', SHIP_SCREEN_X + 50, this.ship.y - 30, '#8899aa', 22);
      this.sfx.levelDown();
    }

    const sec = sectionAtFrame(chart, f + 60);
    if (sec.index !== this.sectionIndex) {
      if (this.sectionIndex >= 0) this.fx.popup(SECTION_LABEL[sec.kind], VIEW_W / 2 + 140, 130, sec.kind === 'sabi' ? '#ffe23e' : '#c8d0ff', 30);
      this.sectionIndex = sec.index;
    }

    this.trail.push({ x, y: this.ship.y });
    if (this.trail.length > 24) this.trail.shift();

    if (this.songFrame >= chart.totalFrames) this.finish(true);
  }

  private hit(px: number, py: number): void {
    this.hp--;
    this.fx.impact(px, py);
    if (this.hp <= 0) { this.finish(false); return; }
    // 体力制：コンボと倍率を戻し、ゲージも減らす。少しの間無敵
    this.acc.hit();
    this.invincible = P.invincibleFrames;
    this.fx.stop(P.hitstopHit);
    this.fx.shake('mid');
    this.fx.flash(4);
    this.sfx.hit();
    this.fx.popup(`のこり ${this.hp}`, SHIP_SCREEN_X + 40, this.ship.y - 34, '#ff7a7a', 26);
  }

  private finish(reachedEnd: boolean): void {
    const id = this.song.id;
    this.resultFrames = 0;
    // 最後まで飛んでも、正確さのゲージがクリアラインに届かなければ FAILED
    const cleared = reachedEnd && this.acc.cleared;
    this.gaugeFailed = reachedEnd && !cleared;
    if (reachedEnd) {
      this.state = 'clear';
    }
    if (cleared) {
      if (!this.save.cleared[id]) {
        this.save.cleared[id] = true;
        this.newColor = this.song.unlockColor.name;
        this.save.color = this.colors.findIndex((c) => c.name === this.newColor);
      }
      this.uiFx.confetti(this.newColor ? 140 : 70);
    } else if (!reachedEnd) {
      this.state = 'dead';
      this.music.stop();
      this.crashY = this.ship.y;
      this.exploded = false;
      this.fx.stop(P.hitstopCrash);
      this.fx.shake('mid');
      this.fx.flash(6);
      this.sfx.crash();
    }
    const score = Math.floor(this.acc.score);
    if (score > (this.save.best[id] ?? 0)) {
      this.save.best[id] = score;
      this.newBest = true;
      if (!cleared) this.uiFx.confetti(30);
    }
    this.persist();
  }

  // ------------------------------------------------------------ 描画

  draw(g: CanvasRenderingContext2D): void {
    const shake = this.fx.shakeOffset();
    g.save();
    g.translate(shake.x, shake.y);
    this.drawBackground(g);
    if (this.state !== 'select' && this.chart) {
      this.drawWalls(g);
      this.drawNotes(g);
      this.drawShip(g);
      this.fx.draw(g, this.camX);
    }
    g.restore();
    this.fx.drawPopups(g, 0);
    const fl = this.fx.flashOverlay();
    if (fl) {
      g.globalAlpha = fl.alpha;
      g.fillStyle = fl.color;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.globalAlpha = 1;
    }
    this.buttons = [];
    if (this.state === 'select') this.drawSelect(g);
    else this.drawHud(g);
    if (this.state === 'dead' || this.state === 'clear') this.drawResult(g);
    this.uiFx.draw(g, 0);
    this.drawCornerButtons(g);
    if (this.paused) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      text(g, '一時停止', VIEW_W / 2, VIEW_H / 2, 48, '#fff', 'center');
      text(g, '押して 再開', VIEW_W / 2, VIEW_H / 2 + 44, 22, '#c8d0ff', 'center');
    }
  }

  private drawBackground(g: CanvasRenderingContext2D): void {
    const bg = g.createLinearGradient(0, 0, 0, VIEW_H);
    bg.addColorStop(0, '#0b1030');
    bg.addColorStop(1, '#1a0f2e');
    g.fillStyle = bg;
    g.fillRect(-40, -40, VIEW_W + 80, VIEW_H + 80);
    g.fillStyle = '#ffffff';
    const cam = this.state === 'select' ? this.frame * 1.5 : this.camX;
    for (const s of this.stars) {
      const x = ((s.x - cam * s.z) % VIEW_W + VIEW_W) % VIEW_W;
      g.globalAlpha = s.z;
      g.fillRect(x, s.y, 2, 2);
    }
    g.globalAlpha = 1;
  }

  private drawWalls(g: CanvasRenderingContext2D): void {
    const t = this.terrain!, chart = this.chart!, cam = this.camX;
    const sp = t.speed;
    // 曲の前（負の列）も最初の高さで平らに描く（centerAt / halfAt が端で止まる）
    const i0 = Math.floor((cam - 20) / sp);
    const i1 = Math.min(t.columns - 1, Math.ceil((cam + VIEW_W + 20) / sp));
    const step = 2;
    const edge = '#9fb3ff';
    const path = (sign: -1 | 0 | 1) => {
      g.beginPath();
      for (let i = i0; i <= i1; i += step) {
        const y = t.centerAt(i) + sign * t.halfAt(i);
        if (i === i0) g.moveTo(i * sp - cam, y); else g.lineTo(i * sp - cam, y);
      }
    };
    // 壁の塗り（区間ごとの色）
    for (let i = i0; i < i1; i += step) {
      const j = Math.min(i1, i + step);
      g.fillStyle = SECTION_FILL[sectionAtFrame(chart, i).kind];
      const ax = i * sp - cam - 0.5, bx = j * sp - cam + 0.5;
      g.beginPath();
      g.moveTo(ax, -40); g.lineTo(ax, t.centerAt(i) - t.halfAt(i)); g.lineTo(bx, t.centerAt(j) - t.halfAt(j)); g.lineTo(bx, -40);
      g.fill();
      g.beginPath();
      g.moveTo(ax, VIEW_H + 40); g.lineTo(ax, t.centerAt(i) + t.halfAt(i)); g.lineTo(bx, t.centerAt(j) + t.halfAt(j)); g.lineTo(bx, VIEW_H + 40);
      g.fill();
    }
    // 拍の線（小節線は濃く）。壁の間だけに描く
    const fpb = chart.framesPerStep * 4;
    const b0 = Math.ceil(i0 / fpb), b1 = Math.floor(i1 / fpb);
    for (let b = b0; b <= b1; b++) {
      const i = Math.round(b * fpb);
      const x = i * sp - cam;
      g.strokeStyle = b % 4 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
      g.lineWidth = b % 4 === 0 ? 3 : 2;
      g.beginPath(); g.moveTo(x, t.centerAt(i) - t.halfAt(i)); g.lineTo(x, t.centerAt(i) + t.halfAt(i)); g.stroke();
    }
    // 中央（理想の軌道）を細い線で常に見せる。正確に押すほどここを飛ぶ
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 2;
    g.setLineDash([6, 8]);
    path(0); g.stroke();
    g.setLineDash([]);
    // 壁の縁（判定のある物を強調）
    g.lineWidth = 3;
    g.strokeStyle = edge;
    g.shadowColor = edge;
    g.shadowBlur = 6;
    path(-1); g.stroke();
    path(1); g.stroke();
    g.shadowBlur = 0;
  }

  /** 押す点（●）と離す点（○）、押している区間の軌道 */
  private drawNotes(g: CanvasRenderingContext2D): void {
    const chart = this.chart!, cam = this.camX, sp = chart.speed;
    const lo = cam - 40, hi = cam + VIEW_W + 40;
    const shipX = this.worldX;
    for (const n of chart.notes) {
      const xOn = n.on * sp, xOff = n.off * sp;
      if (xOff < lo) continue;
      if (xOn > hi) break;
      const passed = xOff < shipX;
      g.globalAlpha = passed ? 0.25 : 0.9;
      // 押している区間：軌道を太くなぞる
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 4;
      g.beginPath();
      for (let i = n.on; i <= n.off; i += 2) {
        const x = i * sp - cam, y = chart.pathY[i];
        if (i === n.on) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      // ● 押す
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#000';
      g.lineWidth = 3;
      g.beginPath(); g.arc(xOn - cam, chart.pathY[n.on], 6, 0, Math.PI * 2); g.stroke(); g.fill();
      // ○ 離す
      g.strokeStyle = '#000'; g.lineWidth = 5;
      g.beginPath(); g.arc(xOff - cam, chart.pathY[n.off], 5, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 2;
      g.beginPath(); g.arc(xOff - cam, chart.pathY[n.off], 5, 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
  }

  private drawShip(g: CanvasRenderingContext2D): void {
    const crashing = this.state === 'dead' && !this.exploded;
    if (this.state === 'dead' && !crashing) return;
    if (this.invincible > 0 && this.frame % 6 < 3) return; // 無敵中は点滅
    const cam = this.camX;
    const col = crashing ? (this.frame % 4 < 2 ? '#ffffff' : '#ff3030') : this.shipFlash > 0 ? '#ffffff' : this.shipColor;
    this.trail.forEach((t, i) => {
      g.globalAlpha = (i / this.trail.length) * 0.35;
      g.fillStyle = accColor(this.acc.recent);
      g.beginPath(); g.arc(t.x - cam, t.y, P.shipRadius * (i / this.trail.length), 0, Math.PI * 2); g.fill();
    });
    g.globalAlpha = 1;
    const x = SHIP_SCREEN_X, y = crashing ? this.crashY : this.ship.y;
    // 上下速度で機首を傾ける。回転軸は中心より後ろにずらす（勢いが出る）
    const ang = Math.max(-0.6, Math.min(0.6, this.ship.vy * 0.09));
    g.save();
    g.translate(x - 4, y);
    g.rotate(ang);
    g.translate(4, 0);
    const s = P.shipRadius;
    g.beginPath();
    g.moveTo(s * 2.4, 0);
    g.lineTo(-s * 1.6, -s * 1.4);
    g.lineTo(-s * 0.9, 0);
    g.lineTo(-s * 1.6, s * 1.4);
    g.closePath();
    g.lineWidth = 3; g.strokeStyle = '#000'; g.stroke();
    g.fillStyle = col; g.fill();
    if (this.input.held && this.state === 'play' && this.songFrame >= 0) {
      g.fillStyle = '#ffb020';
      g.beginPath();
      g.moveTo(-s * 1.1, -s * 0.5);
      g.lineTo(-s * (2 + Math.random() * 1.5), 0);
      g.lineTo(-s * 1.1, s * 0.5);
      g.fill();
    }
    g.restore();
    // コンボ中は輪を出す
    if (this.state === 'play' && this.songFrame >= 0 && this.acc.combo > 0) {
      g.strokeStyle = LEVEL_COLORS[this.acc.level - 1];
      g.globalAlpha = 0.7;
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 20 + Math.sin(this.frame / 5) * 2, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
    // 当たり判定の中心
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill(); g.stroke();
  }

  private cardRects() {
    const w = 260, h = 150, gap = 24, y = 250;
    const x0 = VIEW_W / 2 - (w * SONGS.length + gap * (SONGS.length - 1)) / 2;
    return SONGS.map((_, i) => ({ x: x0 + i * (w + gap), y, w, h }));
  }

  private swatchRect() {
    const n = this.colors.length;
    if (n <= 1) return null;
    return { x: VIEW_W / 2 - n * 13 - 6, y: 452, w: n * 26 + 12, h: 34 };
  }

  private drawSelect(g: CanvasRenderingContext2D): void {
    text(g, 'スレスレ', VIEW_W / 2, 130, 80, '#fff', 'center');
    text(g, '音の長さに合わせて押し続け、拍で離す', VIEW_W / 2, 176, 22, '#c8d0ff', 'center');
    text(g, '● で押して ○ で離す。押している長さが譜面と合っているほど点とゲージが伸びる', VIEW_W / 2, 210, 17, '#9fe8ff', 'center');
    this.cardRects().forEach((r, i) => {
      const s = SONGS[i];
      const sel = i === this.selected;
      g.fillStyle = sel ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = sel ? '#ffe23e' : 'rgba(255,255,255,0.3)';
      g.lineWidth = sel ? 4 : 2;
      g.strokeRect(r.x, r.y, r.w, r.h);
      text(g, s.level, r.x + r.w / 2, r.y + 34, 20, ['#6dff9e', '#ffe23e', '#ff5a5a'][i] ?? '#fff', 'center');
      text(g, s.title, r.x + r.w / 2, r.y + 72, 26, '#fff', 'center');
      text(g, `BPM ${s.bpm}`, r.x + r.w / 2, r.y + 100, 18, '#c8d0ff', 'center');
      const best = this.save.best[s.id];
      text(g, best ? `ベスト ${best.toLocaleString()}` : 'まだ遊んでいない', r.x + r.w / 2, r.y + 128, 18, '#fff', 'center');
      if (this.save.cleared[s.id]) text(g, 'CLEAR', r.x + r.w - 12, r.y + 24, 16, s.unlockColor.color, 'right');
    });
    if (this.frame % 60 < 42) text(g, '曲をタップ（← → で選んでスペース）', VIEW_W / 2, 436, 22, '#ffe23e', 'center');
    const next = SONGS.find((s) => !this.save.cleared[s.id]);
    if (next) text(g, `「${next.title}」をクリアで機体カラー「${next.unlockColor.name}」解放`, VIEW_W / 2, 512, 18, '#9fe8ff', 'center');
    const sw = this.swatchRect();
    if (sw) {
      this.colors.forEach((c, i) => {
        const x = sw.x + 6 + i * 26 + 13;
        g.fillStyle = c.color;
        g.fillRect(x - 8, sw.y + 9, 16, 16);
        if (i === this.save.color) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(x - 11, sw.y + 6, 22, 22); }
      });
    }
  }

  private drawHud(g: CanvasRenderingContext2D): void {
    const chart = this.chart!;
    const lv = this.acc.level;
    text(g, Math.floor(this.acc.score).toLocaleString(), 20, 40, 30, '#fff');
    // 体力
    for (let i = 0; i < P.hp; i++) text(g, '♥', 22 + i * 26, 72, 24, i < this.hp ? '#ff5a7a' : 'rgba(255,255,255,0.2)');
    // 正確さのゲージ（白い縦線がクリアライン）
    const gw = 200, gx = 20, gy = 86;
    const ok = this.acc.cleared;
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(gx, gy, gw, 10);
    g.fillStyle = ok ? '#6dff9e' : '#ffb020';
    g.fillRect(gx, gy, gw * this.acc.gauge, 10);
    g.fillStyle = '#ffffff';
    g.fillRect(gx + gw * P.clearLine - 1, gy - 3, 3, 16);
    text(g, ok ? 'CLEAR ライン到達' : 'ゲージ', gx + gw + 8, gy + 10, 13, ok ? '#6dff9e' : '#c8d0ff');
    const cx = VIEW_W / 2;
    text(g, `×${lv}`, cx, 46, 40, LEVEL_COLORS[lv - 1], 'center');
    const combo = this.acc.combo;
    if (combo > 0) text(g, `${combo} COMBO`, cx, 74, 20, '#fff', 'center');
    // 次の倍率までの進み
    if (lv < P.maxLevel) {
      const into = (combo % P.beatsPerLevel) / P.beatsPerLevel;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(cx - 80, 82, 160, 5);
      g.fillStyle = LEVEL_COLORS[lv - 1];
      g.fillRect(cx - 80, 82, 160 * into, 5);
    }
    // 曲の進み具合
    const prog = Math.max(0, Math.min(1, this.songFrame / chart.totalFrames));
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(0, VIEW_H - 5, VIEW_W, 5);
    g.fillStyle = '#ffffff';
    g.fillRect(0, VIEW_H - 5, VIEW_W * prog, 5);
    text(g, `${chart.song.title}（${chart.song.level}）`, VIEW_W - 130, 36, 16, '#c8d0ff', 'right');

    if (this.state === 'play' && this.songFrame < 0) {
      // カウントイン 3・2・1・GO
      const beat = Math.floor((this.songFrame + chart.framesPerStep * 16) / (chart.framesPerStep * 4));
      const label = ['3', '2', '1', 'GO!'][Math.max(0, Math.min(3, beat))];
      text(g, label, VIEW_W / 2, VIEW_H / 2 + 20, 80, '#ffe23e', 'center');
      text(g, '● で押して ○ で離す', VIEW_W / 2, VIEW_H / 2 + 70, 24, '#fff', 'center');
    }
  }

  private drawResult(g: CanvasRenderingContext2D): void {
    if (this.state === 'dead' && !this.exploded) return;
    const cleared = this.state === 'clear' && !this.gaugeFailed;
    const score = Math.floor(this.acc.score);
    // スコアはカウントアップで見せる
    const shown = Math.floor(score * Math.min(1, this.resultFrames / 40));
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 96, VIEW_W, 380);
    const title = cleared ? 'CLEAR!' : this.gaugeFailed ? 'FAILED（ゲージ不足）' : 'MISS…';
    text(g, title, VIEW_W / 2, 150, 44, cleared ? '#6dff9e' : '#ff7a7a', 'center');
    text(g, shown.toLocaleString(), VIEW_W / 2, 220, 60, '#fff', 'center');
    if (this.newBest && this.resultFrames > 40) text(g, 'ベスト更新!', VIEW_W / 2, 252, 24, '#ffe23e', 'center');
    const stats = [
      `一致率 ${(this.acc.matchRate * 100).toFixed(1)}%`,
      `最大 ${this.acc.maxCombo} COMBO`,
      `最高倍率 ×${this.acc.maxLevel}`,
    ];
    stats.forEach((s, i) => text(g, s, VIEW_W / 2 - 220 + i * 220, 292, 18, '#c8d0ff', 'center'));
    const sub = this.state === 'clear'
      ? `ゲージ ${Math.round(this.acc.gauge * 100)}%（クリアライン ${Math.round(P.clearLine * 100)}%）`
      : `曲の ${Math.round((Math.max(0, this.songFrame) / this.chart!.totalFrames) * 100)}% まで到達`;
    text(g, sub, VIEW_W / 2, 324, 18, cleared ? '#6dff9e' : '#ffb020', 'center');
    if (this.newColor) text(g, `機体カラー「${this.newColor}」解放!`, VIEW_W / 2, 358, 22, '#7cf0ff', 'center');
    if (this.resultFrames >= P.retryLock) {
      const primary = cleared ? '曲選択へ' : 'もう一回';
      const secondary = cleared ? 'もう一回' : '曲選択へ';
      const act = (label: string) => (label === 'もう一回' ? () => this.startSong(this.selected) : () => this.toSelect());
      this.buttons = [
        { label: primary, x: VIEW_W / 2 - 230, y: 380, w: 220, h: 60, action: act(primary) },
        { label: secondary, x: VIEW_W / 2 + 10, y: 380, w: 220, h: 60, action: act(secondary) },
      ];
      this.buttons.forEach((b, i) => {
        g.fillStyle = i === 0 ? 'rgba(255,226,62,0.25)' : 'rgba(255,255,255,0.12)';
        g.fillRect(b.x, b.y, b.w, b.h);
        g.strokeStyle = i === 0 ? '#ffe23e' : 'rgba(255,255,255,0.4)';
        g.lineWidth = 2;
        g.strokeRect(b.x, b.y, b.w, b.h);
        text(g, b.label, b.x + b.w / 2, b.y + 40, 24, '#fff', 'center');
      });
      text(g, 'スペース：左のボタン　Esc：曲選択', VIEW_W / 2, 466, 15, '#9aa3c8', 'center');
    }
  }

  private drawCornerButtons(g: CanvasRenderingContext2D): void {
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(VIEW_W - 58, 6, 52, 48);
    g.fillRect(VIEW_W - 116, 6, 52, 48);
    text(g, this.paused ? '▶' : 'II', VIEW_W - 32, 40, 22, '#fff', 'center');
    text(g, this.sfx.muted ? '×' : '♪', VIEW_W - 90, 40, 22, '#fff', 'center');
  }
}

function inRect(p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left'): void {
  g.font = `900 ${size}px system-ui, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.lineWidth = 5;
  g.strokeStyle = '#000';
  g.strokeText(s, x, y);
  g.fillStyle = color;
  g.fillText(s, x, y);
}

/** 精度で色分け（高いほど緑、低いほど赤） */
function accColor(a: number): string {
  if (a > 0.85) return '#6dff9e';
  if (a > 0.6) return '#d4ff4a';
  if (a > 0.35) return '#ffd23e';
  return '#ff5a5a';
}
