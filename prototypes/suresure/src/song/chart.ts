import { P, VIEW_H } from '../params';
import { makeRng } from '../rng';
import { stepShip, type ShipState } from '../physics';
import type { SectionKind, SongDef, SectionDef } from './songs';

export interface Note {
  /** 押し始めのフレーム（曲の頭＝0） */
  on: number;
  /** 離すフレーム */
  off: number;
  /** 16分音符での位置 */
  step: number;
}

export interface ChartSection {
  kind: SectionKind;
  startFrame: number;
  /** 何番目の区間か */
  index: number;
  def: SectionDef;
  startBar: number;
}

/** フレーム f を進める前の理想の高さと速度（引き戻す力の基準） */
export function guideAt(chart: Chart, f: number): { y: number; vy: number } {
  const p = chart.pathY;
  const i = Math.max(0, Math.min(p.length - 1, f));
  return { y: p[i], vy: i > 0 ? p[i] - p[i - 1] : 0 };
}

export interface Chart {
  song: SongDef;
  /** 1フレームの横移動 px */
  speed: number;
  /** 16分音符1つのフレーム数（小数） */
  framesPerStep: number;
  totalFrames: number;
  totalBars: number;
  /** held[f]：フレーム f で押しているか */
  held: Uint8Array;
  /** edgeDist[f]：押す・離すの境目までのフレーム数（猶予の判定用。255 で頭打ち） */
  edgeDist: Uint8Array;
  /** pathY[f]：f フレーム進んだ後の理想の y（pathY[0] は開始位置） */
  pathY: Float32Array;
  notes: Note[];
  sections: ChartSection[];
  /** 選ばれたパターン（小節ごと）。テスト・確認用 */
  barPatterns: string[];
}

export const START_Y = VIEW_H / 2;
/** 曲が終わった後に流す余白（フレーム） */
const TAIL_FRAMES = 120;
/** 次の小節を試すときの、つなぎのパターン */
const PROBE = 'X-..X-..X-..X-..';

export function pathBounds(halfGap: number): [number, number] {
  const m = halfGap + P.chartMargin;
  return [m, VIEW_H - m];
}

/**
 * パターンの変形：押し始めの拍は変えず、離すタイミングだけ1マスずらした版を作る。
 * 長く押す版は上へ、短く押す版は下へ軌道を寄せられる（リズムの聞こえ方は変わらない）
 */
export function variants(pattern: string): string[] {
  const longer = pattern.replace(/([X-])\.(?=.)/g, (_m, a) => a + '-');
  const shorter = pattern.replace(/([X-])-(?=\.|X|$)/g, (_m, a) => a + '.');
  return [...new Set([pattern, longer, shorter])].filter((v) => v.length === 16);
}

/** パターン1小節分を held 配列に書き込む */
function writeBar(held: Uint8Array, startFrame: number, framesPerStep: number, pattern: string, prevHeldAtEnd: boolean): void {
  let prev = prevHeldAtEnd;
  for (let i = 0; i < 16; i++) {
    const ch = pattern[i] ?? '.';
    const f0 = startFrame + Math.round(i * framesPerStep);
    const f1 = startFrame + Math.round((i + 1) * framesPerStep);
    const on = ch === 'X' || ch === '-';
    if (ch === 'X' && prev) {
      // 押したままの次に押し直す：直前2フレームを離して押し直しにする
      for (let f = Math.max(0, f0 - 2); f < f0; f++) held[f] = 0;
    }
    for (let f = f0; f < f1 && f < held.length; f++) held[f] = on ? 1 : 0;
    prev = on;
  }
}

/** state から frames 分を held で進め、範囲外にはみ出した量を返す */
function simulate(state: ShipState, held: Uint8Array, from: number, to: number, ys: Float32Array | undefined, halfGap: number): number {
  const [lo, hi] = pathBounds(halfGap);
  let over = 0;
  for (let f = from; f < to; f++) {
    stepShip(state, held[f] === 1);
    if (ys) ys[f + 1] = state.y;
    if (state.y < lo) over += lo - state.y;
    if (state.y > hi) over += state.y - hi;
  }
  return over;
}

export function buildChart(song: SongDef): Chart {
  const framesPerStep = 3600 / song.bpm / 4;
  const barFrames = framesPerStep * 16;
  const totalBars = song.sections.reduce((a, s) => a + s.bars, 0);
  const songFrames = Math.round(totalBars * barFrames);
  const totalFrames = songFrames + TAIL_FRAMES;
  const held = new Uint8Array(totalFrames + Math.ceil(barFrames) * 2);
  const pathY = new Float32Array(totalFrames + 1);
  const rng = makeRng(song.seed);
  const state: ShipState = { y: START_Y, vy: 0, holdFrames: 0 };
  /** 小節の頭の2フレーム前の状態（押し直しでその2フレームが書き換わるため、そこから計算し直す） */
  let snap: ShipState = { ...state };
  const REWIND = 2;
  pathY[0] = START_Y;
  const sections: ChartSection[] = [];
  const barPatterns: string[] = [];

  let bar = 0;
  song.sections.forEach((def, index) => {
    sections.push({ kind: def.kind, startFrame: Math.round(bar * barFrames), index, def, startBar: bar });
    for (let b = 0; b < def.bars; b++, bar++) {
      const start = Math.round(bar * barFrames);
      const end = Math.round((bar + 1) * barFrames);
      const prevHeld = bar > 0 && held[start - 1] === 1;
      // 候補ごとに「この小節＋つなぎ1小節」を試し、はみ出しと中央からのずれ（平均の高さ）で評価する
      const candidates = def.patterns.flatMap((pat) => variants(pat).map((v, i) => ({ pat: v, original: i === 0 })));
      const probeEnd = Math.round((bar + 2) * barFrames);
      const scored = candidates.map(({ pat, original }) => {
        const tmp = new Uint8Array(probeEnd + 4);
        const from = Math.max(0, start - REWIND);
        for (let f = from; f < start; f++) tmp[f] = held[f];
        writeBar(tmp, start, framesPerStep, pat, prevHeld);
        writeBar(tmp, end, framesPerStep, PROBE, tmp[end - 1] === 1);
        const s = { ...snap };
        const [lo, hi] = pathBounds(song.halfGap);
        let over = 0, sum = 0;
        for (let f = from; f < probeEnd; f++) {
          stepShip(s, tmp[f] === 1);
          if (s.y < lo) over += lo - s.y;
          if (s.y > hi) over += s.y - hi;
          if (f >= start && f < end) sum += s.y;
        }
        const mean = sum / (end - start);
        // 変形していない元のパターンを少し優先する
        return { pat, cost: over * 100 + Math.abs(mean - START_Y) + (original ? 0 : 12) };
      });
      scored.sort((a, b) => a.cost - b.cost);
      const ok = scored.filter((c) => c.cost < scored[0].cost + 25);
      const pick = ok[Math.floor(rng() * ok.length)];
      writeBar(held, start, framesPerStep, pick.pat, prevHeld);
      barPatterns.push(pick.pat);
      // 押し直しで書き換わった2フレーム前から計算し直し、次の小節のために2フレーム前の状態を取っておく
      Object.assign(state, snap);
      const from = Math.max(0, start - REWIND);
      const stop = Math.min(end, totalFrames);
      simulate(state, held, from, stop - REWIND, pathY, song.halfGap);
      snap = { ...state };
      simulate(state, held, stop - REWIND, stop, pathY, song.halfGap);
    }
  });
  // 曲の後は離したまま…だと落ちるので、つなぎのパターンで流す
  for (let f = songFrames; f < totalFrames; f++) held[f] = 0;
  let b = 0;
  while (Math.round(songFrames + b * barFrames) < totalFrames) {
    const st = Math.round(songFrames + b * barFrames);
    writeBar(held, st, framesPerStep, PROBE, held[st - 1] === 1);
    b++;
  }
  // 押し直しの処理で前の小節の末尾が変わることがあるので、最後に通しで軌道を計算し直す
  simulate({ y: START_Y, vy: 0, holdFrames: 0 }, held, 0, totalFrames, pathY, song.halfGap);

  const notes: Note[] = [];
  for (let f = 0; f < songFrames; f++) {
    if (held[f] && (f === 0 || !held[f - 1])) {
      let off = f;
      while (off < songFrames && held[off]) off++;
      notes.push({ on: f, off, step: Math.round(f / framesPerStep) });
    }
  }

  const heldOut = held.subarray(0, totalFrames);
  return {
    song, speed: (P.beatPx * song.bpm) / 3600, framesPerStep, edgeDist: buildEdgeDist(heldOut),
    totalFrames: songFrames, totalBars,
    held: heldOut, pathY, notes, sections, barPatterns,
  };
}

/**
 * 境目（held[t] と held[t-1] が違う t）までの距離。境目をはさむ2フレームが 0。
 * 押すのが3フレーム遅れたときの食い違いは 0,1,2、早すぎたときは 2,1,0 になる
 */
export function buildEdgeDist(held: Uint8Array): Uint8Array {
  const n = held.length;
  const d = new Uint8Array(n).fill(255);
  let last = -1e9;
  for (let f = 0; f < n; f++) {
    if (f > 0 && held[f] !== held[f - 1]) last = f;
    d[f] = Math.min(255, f - last);
  }
  last = 1e9;
  for (let f = n - 1; f >= 0; f--) {
    if (f + 1 < n && held[f + 1] !== held[f]) last = f;
    d[f] = Math.min(d[f], 255, last - f);
  }
  return d;
}

export function sectionAtFrame(chart: Chart, frame: number): ChartSection {
  let cur = chart.sections[0];
  for (const s of chart.sections) if (s.startFrame <= frame) cur = s;
  return cur;
}
