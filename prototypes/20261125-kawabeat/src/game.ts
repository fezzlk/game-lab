import { VIEW_W, VIEW_H, P } from './params';
import { Input } from './input';
import { Sfx } from './audio';
import { Round, LOOP, type RoundEvent } from './core';
import { suitOf, numOf, SUIT_NAME, shanten, layerLevels } from './tiles';

type State = 'title' | 'play' | 'roundEnd' | 'final';

const SUIT_COL = ['#d9534f', '#4a90d9', '#4caf6a'];
const SUIT_INST = ['ドラム', 'ベース', 'メロディ'];
const TILE_W = 52, TILE_H = 72, GAP = 6;

interface Popup { text: string; x: number; y: number; life: number; max: number; color: string; size: number }

export class Game {
  state: State = 'title';
  round: Round | null = null;
  roundNo = 0;
  total = 0;
  roundScores: number[] = [];
  cursor = 13;
  popups: Popup[] = [];
  shake = 0;
  flash = 0;
  frame = 0;
  stateFrame = 0;
  /** 直前の牌効率の結果表示 */
  feedback: { ok: boolean; frames: number } | null = null;

  constructor(private input: Input, private sfx: Sfx, private seed: number) {}

  // ---- 操作（自動操縦からも呼べる） ----
  startRun(): void {
    this.sfx.unlock();
    this.sfx.start();
    this.roundNo = 0;
    this.total = 0;
    this.roundScores = [];
    this.startRound();
  }

  private startRound(): void {
    this.round = new Round(this.seed + this.roundNo * 101);
    this.state = 'play';
    this.stateFrame = 0;
    this.cursor = 13;
    this.popups = [];
  }

  /** 牌を切る（index: 0..12 手牌、13 引いた牌）。切れたら true */
  tryDiscard(index: number): boolean {
    const r = this.round;
    if (this.state !== 'play' || !r) return false;
    const res = r.discard(index);
    if (!res) return false;
    this.sfx.click(res.just);
    this.feedback = { ok: res.efficient, frames: 70 };
    const x = VIEW_W / 2, y = 172;
    this.pop(res.efficient ? '牌効率 ○' : '遠回り ×', x - 150, y, res.efficient ? '#9be59b' : '#ff9a8a', 22);
    if (res.just) this.pop('JUST!', x + 20, y, '#ffd75e', 26);
    if (res.points > 0) this.pop(`+${res.points}`, x + 160, y, '#fff', 20);
    if (res.ron) this.onRon();
    this.cursor = 13;
    return true;
  }

  private onRon(): void {
    this.sfx.ron();
    this.shake = 24;
    this.pop('放銃！', VIEW_W / 2, 300, '#ff5e5e', 54);
  }

  private pop(text: string, x: number, y: number, color: string, size: number): void {
    this.popups.push({ text, x, y, life: 60, max: 60, color, size });
  }

  update(): void {
    this.frame++;
    this.stateFrame++;
    if (this.shake > 0) this.shake--;
    if (this.flash > 0) this.flash--;
    if (this.feedback && --this.feedback.frames <= 0) this.feedback = null;
    for (const p of this.popups) { p.life--; p.y -= 0.6; }
    this.popups = this.popups.filter((p) => p.life > 0);

    for (const a of this.input.drain()) this.handle(a);

    if (this.state === 'play' && this.round) {
      const r = this.round;
      const wasEnded = r.ended;
      for (const e of r.update()) this.onEvent(e);
      if (r.ended && !wasEnded) this.onRoundEnd();
    }
  }

  private handle(a: ReturnType<Input['drain']>[number]): void {
    if (a.kind === 'key' && a.code === 'KeyM') { this.sfx.toggleMute(); return; }
    if (this.state === 'title') {
      if (a.kind === 'tap' || a.code === 'Space' || a.code === 'Enter') this.startRun();
      return;
    }
    if (this.state === 'roundEnd' || this.state === 'final') {
      if (this.stateFrame < 50) return;
      if (a.kind === 'key' && !['Space', 'Enter'].includes(a.code)) return;
      this.sfx.unlock();
      if (this.state === 'final') this.startRun();
      else this.nextRound();
      return;
    }
    const r = this.round;
    if (!r) return;
    const n = r.tiles14.length;
    if (a.kind === 'tap') {
      for (let i = 0; i < n; i++) {
        const rc = this.handRect(i, n);
        if (a.x >= rc.x - 3 && a.x <= rc.x + rc.w + 3 && a.y >= rc.y - 14 && a.y <= rc.y + rc.h + 40) {
          this.cursor = i;
          this.tryDiscard(i);
          return;
        }
      }
    } else if (a.code === 'ArrowLeft') this.cursor = (this.cursor + n - 1) % n;
    else if (a.code === 'ArrowRight') this.cursor = (this.cursor + 1) % n;
    else if (a.code === 'Space' || a.code === 'Enter' || a.code === 'ArrowDown') this.tryDiscard(Math.min(this.cursor, n - 1));
    else if (a.code === 'ArrowUp') this.tryDiscard(n - 1);
  }

  private onEvent(e: RoundEvent): void {
    if (e.type === 'beat') {
      this.sfx.tick(e.slot, e.beat < 0);
      if (e.tile !== null) this.sfx.slot(e.tile, e.levels);
    } else if (e.type === 'draw') {
      this.cursor = this.round!.tiles14.length - 1;
    } else if (e.type === 'miss') {
      this.sfx.miss();
      this.pop('抜け…', VIEW_W / 2, 172, '#aab', 24);
    } else if (e.type === 'end' && e.phase === 'ron') {
      this.onRon();
    }
  }

  private onRoundEnd(): void {
    const r = this.round!;
    if (r.phase === 'won') {
      this.sfx.win(r.han);
      this.flash = 20;
    }
    this.roundScores.push(r.score);
    this.total += r.score;
    this.state = 'roundEnd';
    this.stateFrame = 0;
  }

  private nextRound(): void {
    this.roundNo++;
    if (this.roundNo >= P.rounds) { this.state = 'final'; this.stateFrame = 0; return; }
    this.startRound();
  }

  // ---- 描画 ----
  handRect(i: number, n: number): { x: number; y: number; w: number; h: number } {
    const total = n * TILE_W + (n - 1) * GAP + (n === 14 ? 14 : 0);
    const x0 = (VIEW_W - total) / 2;
    const extra = n === 14 && i === 13 ? 14 : 0;
    return { x: x0 + i * (TILE_W + GAP) + extra, y: 408, w: TILE_W, h: TILE_H };
  }

  draw(g: CanvasRenderingContext2D): void {
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.5 : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.5 : 0;
    g.save();
    g.translate(sx, sy);
    this.drawBg(g);
    if (this.state === 'title') this.drawTitle(g);
    else this.drawPlay(g);
    g.restore();
    if (this.flash > 0) { g.fillStyle = `rgba(255,240,180,${this.flash / 30})`; g.fillRect(0, 0, VIEW_W, VIEW_H); }
    for (const p of this.state === 'play' ? this.popups : []) {
      g.globalAlpha = Math.min(1, p.life / 20);
      g.fillStyle = p.color; g.font = `800 ${p.size}px system-ui, sans-serif`; g.textAlign = 'center';
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 4; g.strokeText(p.text, p.x, p.y);
      g.fillText(p.text, p.x, p.y);
      g.globalAlpha = 1;
    }
    if (this.state === 'roundEnd') this.drawRoundEnd(g);
    if (this.state === 'final') this.drawFinal(g);
  }

  private drawBg(g: CanvasRenderingContext2D): void {
    const grd = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 80, VIEW_W / 2, VIEW_H / 2, 620);
    grd.addColorStop(0, '#1c3a2e'); grd.addColorStop(1, '#0b1612');
    g.fillStyle = grd; g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  private text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = '#fff', align: CanvasTextAlign = 'left', weight = 700): void {
    g.font = `${weight} ${size}px system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif`;
    g.textAlign = align; g.fillStyle = color; g.textBaseline = 'alphabetic';
    g.fillText(s, x, y);
  }

  private rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    g.beginPath(); g.roundRect(x, y, w, h, r);
  }

  drawTile(g: CanvasRenderingContext2D, id: number, x: number, y: number, w: number, h: number, opts: { danger?: number; dim?: boolean; hl?: boolean } = {}): void {
    const s = suitOf(id);
    g.save();
    if (opts.dim) g.globalAlpha = 0.45;
    g.fillStyle = 'rgba(0,0,0,0.35)'; this.rr(g, x + 2, y + 4, w, h, 6); g.fill();
    g.fillStyle = '#f4efe0'; this.rr(g, x, y, w, h, 6); g.fill();
    g.fillStyle = SUIT_COL[s]; g.fillRect(x + 4, y + h - 8, w - 8, 4);
    this.text(g, String(numOf(id)), x + w / 2, y + h * 0.58, h * 0.52, SUIT_COL[s], 'center', 800);
    this.text(g, SUIT_NAME[s], x + w / 2, y + h * 0.84, h * 0.22, '#444', 'center', 700);
    if (opts.danger) {
      g.strokeStyle = opts.danger >= P.ronRed ? '#ff3b3b' : '#ff9d2e';
      g.lineWidth = 4; this.rr(g, x, y, w, h, 6); g.stroke();
    }
    if (opts.hl) { g.strokeStyle = '#ffe27a'; g.lineWidth = 3; this.rr(g, x - 3, y - 3, w + 6, h + 6, 8); g.stroke(); }
    g.restore();
  }

  private drawTitle(g: CanvasRenderingContext2D): void {
    this.text(g, '河ビート', VIEW_W / 2, 150, 76, '#fff', 'center', 900);
    this.text(g, '一人麻雀を、リズムに乗って気軽に打つ', VIEW_W / 2, 200, 24, '#cfe', 'center');
    const lines = [
      '1拍ごとに牌が1枚くる。拍が来る前に1枚切ろう',
      '切った牌は「河」に入って、4拍ごとにループで鳴る（萬＝ドラム 筒＝ベース 索＝メロディ）',
      '手が育つほど音が厚くなる。あがれば派手なフィナーレ',
      '赤・橙の枠の牌は危険牌。切ると放銃（失点）することがある',
    ];
    lines.forEach((l, i) => this.text(g, l, VIEW_W / 2, 270 + i * 34, 20, '#e8f0e8', 'center', 500));
    const pulse = 0.6 + 0.4 * Math.sin(this.frame / 12);
    g.globalAlpha = pulse;
    this.text(g, 'タップ / Space で開始', VIEW_W / 2, 450, 30, '#ffe27a', 'center', 800);
    g.globalAlpha = 1;
    this.text(g, '← → で牌を選ぶ　Space で切る　↑ でツモ切り　M でミュート', VIEW_W / 2, 500, 16, '#9bb', 'center', 500);
  }

  private drawPlay(g: CanvasRenderingContext2D): void {
    const r = this.round;
    if (!r) return;
    const tiles = r.tiles14;
    const n = tiles.length;
    const sh = shanten(r.hand);

    // HUD
    this.text(g, `第${this.roundNo + 1}局 / ${P.rounds}`, 24, 38, 22, '#cfe');
    this.text(g, `${this.total + r.score} 点`, 24, 68, 28, '#fff', 'left', 800);
    const shText = sh <= -1 ? 'あがり！' : sh === 0 ? 'テンパイ！' : `${sh}向聴`;
    this.text(g, shText, VIEW_W / 2, 48, 34, sh <= 0 ? '#ffe27a' : '#e8f0e8', 'center', 800);
    const drawsLeft = Math.max(0, P.maxDraws - r.draws);
    this.text(g, `残りツモ ${drawsLeft}`, VIEW_W / 2, 72, 16, '#9bb', 'center', 500);
    const mul = Math.min(P.comboMaxMul, 1 + Math.floor(r.combo / P.comboStep));
    this.text(g, `${r.combo} コンボ  ×${mul}`, VIEW_W - 24, 46, 24, r.combo > 0 ? '#9be59b' : '#789', 'right', 800);
    this.text(g, '牌効率よく切り続けるとコンボ', VIEW_W - 24, 68, 14, '#789', 'right', 500);

    // 音の厚み（色ごとの面子数）
    const lv = r.slots.length ? this.levelsOf(r) : [0, 0, 0];
    for (let s = 0; s < 3; s++) {
      const y = 100 + s * 34;
      this.text(g, `${SUIT_NAME[s]} ${SUIT_INST[s]}`, 24, y + 14, 15, SUIT_COL[s], 'left', 800);
      g.fillStyle = 'rgba(255,255,255,0.12)'; this.rr(g, 130, y, 110, 16, 8); g.fill();
      g.fillStyle = SUIT_COL[s]; this.rr(g, 130, y, Math.max(8, 110 * Math.min(1, lv[s] / 4.5)), 16, 8); g.fill();
    }

    // 危険牌パネル
    this.text(g, '危険牌', VIEW_W - 240, 118, 15, '#ff9d2e', 'left', 800);
    const untilChange = P.dangerEvery - (Math.max(0, r.beat) % P.dangerEvery);
    this.text(g, `あと${untilChange}拍で入れ替わる`, VIEW_W - 24, 118, 13, '#9bb', 'right', 500);
    let k = 0;
    for (const [id, lvl] of r.danger) {
      const x = VIEW_W - 240 + k * 74, y = 126;
      this.drawTile(g, id, x, y, 38, 52, { danger: lvl === 'red' ? 1 : 0.3 });
      this.text(g, `${Math.round(r.ronRate(id) * 100)}%`, x + 19, y + 70, 15, lvl === 'red' ? '#ff6b6b' : '#ffb15e', 'center', 800);
      k++;
    }

    // 河（4拍ループ）
    const curSlot = ((r.beat % LOOP) + LOOP) % LOOP;
    const nextSlot = (curSlot + 1) % LOOP;
    const sw = 96, sGap = 24, sx0 = (VIEW_W - (4 * sw + 3 * sGap)) / 2, sy = 214;
    this.text(g, '河（4拍でループ）', sx0, sy - 12, 15, '#9bb', 'left', 600);
    for (let i = 0; i < LOOP; i++) {
      const x = sx0 + i * (sw + sGap);
      const playing = r.beat >= 0 && i === curSlot;
      const pulse = playing ? Math.max(0, 1 - r.beatPhase * 2.5) : 0;
      g.fillStyle = playing ? `rgba(255,226,122,${0.16 + 0.3 * pulse})` : 'rgba(255,255,255,0.06)';
      this.rr(g, x - 6, sy - 4, sw + 12, 118, 10); g.fill();
      const t = r.slots[i];
      if (t !== null) {
        const sc = 1 + 0.12 * pulse;
        this.drawTile(g, t, x + 8 - (sc - 1) * 40, sy + 4 - (sc - 1) * 50, (sw - 16) * sc, 100 * sc);
      } else {
        this.text(g, r.beat >= 0 && r.draws > 0 ? '無音' : '', x + sw / 2, sy + 62, 16, '#678', 'center', 600);
      }
      if (r.canDiscard && i === nextSlot) {
        g.strokeStyle = '#ffe27a'; g.setLineDash([6, 5]); g.lineWidth = 2;
        this.rr(g, x - 6, sy - 4, sw + 12, 118, 10); g.stroke(); g.setLineDash([]);
        this.text(g, 'ここに入る', x + sw / 2, sy + 134, 13, '#ffe27a', 'center', 700);
      }
      this.text(g, String(i + 1), x + 4, sy + 12, 12, '#789', 'left', 700);
    }

    // タイミングバー
    const bx = sx0, bw = 4 * sw + 3 * sGap, by = 362;
    g.fillStyle = 'rgba(255,255,255,0.12)'; this.rr(g, bx, by, bw, 12, 6); g.fill();
    const justFrac = (P.justMs / 1000) * 60 / r.beatFrames;
    g.fillStyle = '#d9a82a'; this.rr(g, bx + bw * (1 - justFrac), by, bw * justFrac, 12, 6); g.fill();
    if (r.phase === 'play') {
      const px = bx + bw * Math.min(1, Math.max(0, r.beatPhase));
      g.fillStyle = '#fff'; g.fillRect(px - 2, by - 5, 4, 22);
    }
    this.text(g, '拍', bx + bw + 14, by + 11, 14, '#ffe27a', 'left', 800);

    // カウントイン
    if (r.phase === 'countin') {
      const left = Math.ceil(-r.t / r.beatFrames);
      this.text(g, String(Math.min(left, 3)), VIEW_W / 2, 340, 90, 'rgba(255,255,255,0.85)', 'center', 900);
    }

    // 手牌
    for (let i = 0; i < n; i++) {
      const rc = this.handRect(i, n);
      const id = tiles[i];
      const rate = r.ronRate(id);
      const sel = this.state === 'play' && i === this.cursor && r.canDiscard;
      const lift = sel ? -12 : 0;
      this.drawTile(g, id, rc.x, rc.y + lift, rc.w, rc.h, { danger: rate, dim: !r.canDiscard && r.phase === 'play' && r.drawn === null, hl: sel });
      if (rate > 0) this.text(g, `${Math.round(rate * 100)}%`, rc.x + rc.w / 2, rc.y + lift - 6, 13, rate >= P.ronRed ? '#ff6b6b' : '#ffb15e', 'center', 800);
    }
    if (n === 14) this.text(g, 'ツモ', this.handRect(13, 14).x + TILE_W / 2, 500, 13, '#9bb', 'center', 600);
    this.text(g, '← → 選ぶ　Space 切る　↑ ツモ切り　（牌タップでも切れる）', VIEW_W / 2, 528, 14, '#789', 'center', 500);
  }

  private levelsOf(r: Round): [number, number, number] {
    return this.cachedLevels(r.hand);
  }
  private lvKey = '';
  private lvVal: [number, number, number] = [0, 0, 0];
  private cachedLevels(hand: number[]): [number, number, number] {
    const key = hand.join(',');
    if (key !== this.lvKey) { this.lvKey = key; this.lvVal = layerLevels(hand); }
    return this.lvVal;
  }

  private overlay(g: CanvasRenderingContext2D): void {
    g.fillStyle = 'rgba(6,12,10,0.88)'; g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  private drawRoundEnd(g: CanvasRenderingContext2D): void {
    const r = this.round!;
    this.overlay(g);
    const title = r.phase === 'won' ? 'あがり！' : r.phase === 'ron' ? '放銃…' : '流局';
    const col = r.phase === 'won' ? '#ffe27a' : r.phase === 'ron' ? '#ff6b6b' : '#cfe';
    this.text(g, title, VIEW_W / 2, 130, 64, col, 'center', 900);
    if (r.phase === 'won') {
      r.yaku.forEach((y, i) => this.text(g, `${y.name}　${y.han}翻`, VIEW_W / 2, 190 + i * 30, 22, '#fff', 'center', 700));
      const yb = 190 + r.yaku.length * 30;
      this.text(g, `合計 ${r.han}翻 ＝ ${r.han * P.hanPoints} 点`, VIEW_W / 2, yb + 14, 24, '#ffe27a', 'center', 800);
      const tiles = r.tiles14;
      const total = tiles.length * 40 + (tiles.length - 1) * 4;
      tiles.forEach((t, i) => this.drawTile(g, t, (VIEW_W - total) / 2 + i * 44, yb + 40, 40, 56));
    } else if (r.phase === 'ron') {
      this.text(g, `危険牌を切って ${P.ronPenalty} 点の失点`, VIEW_W / 2, 200, 24, '#fff', 'center', 700);
    } else {
      this.text(g, '最後まで切りきった', VIEW_W / 2, 200, 24, '#fff', 'center', 700);
    }
    this.text(g, `この局 ${r.score} 点　／　最大コンボ ${r.maxCombo}　抜け ${r.misses}`, VIEW_W / 2, 400, 20, '#cfe', 'center', 600);
    this.text(g, `合計 ${this.total} 点`, VIEW_W / 2, 440, 30, '#fff', 'center', 800);
    if (this.stateFrame >= 50) this.text(g, 'タップ / Space で次へ', VIEW_W / 2, 495, 22, '#ffe27a', 'center', 800);
  }

  private drawFinal(g: CanvasRenderingContext2D): void {
    this.overlay(g);
    this.text(g, '全局終了', VIEW_W / 2, 120, 56, '#fff', 'center', 900);
    this.text(g, `${this.total} 点`, VIEW_W / 2, 220, 80, '#ffe27a', 'center', 900);
    this.roundScores.forEach((s, i) => this.text(g, `第${i + 1}局　${s} 点`, VIEW_W / 2, 280 + i * 30, 22, '#cfe', 'center', 600));
    if (this.stateFrame >= 50) this.text(g, 'タップ / Space でもう一度', VIEW_W / 2, 470, 24, '#ffe27a', 'center', 800);
  }
}
