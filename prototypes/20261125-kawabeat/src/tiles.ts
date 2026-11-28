/**
 * 牌と手牌の純粋ロジック（DOM なし）。牌は 0..26 の番号：
 * 0-8 萬子 / 9-17 筒子 / 18-26 索子（字牌は使わない。気軽に遊べるように）
 */
export const KINDS = 27;
export const suitOf = (id: number): number => Math.floor(id / 9);
export const numOf = (id: number): number => (id % 9) + 1;
export const SUIT_NAME = ['萬', '筒', '索'];

export function counts(tiles: readonly number[]): number[] {
  const c = new Array<number>(KINDS).fill(0);
  for (const t of tiles) c[t]++;
  return c;
}

/** 通常形の向聴数（-1 = あがり） */
function regularShanten(c: number[]): number {
  let best = 0; // 2*面子 + 搭子 の最大
  const scan = (i: number, m: number, t: number): void => {
    while (i < KINDS && c[i] === 0) i++;
    if (i >= KINDS) {
      const v = 2 * m + Math.min(t, 4 - m);
      if (v > best) best = v;
      return;
    }
    const n = i % 9;
    if (c[i] >= 3) { c[i] -= 3; scan(i, m + 1, t); c[i] += 3; }
    if (n <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--; scan(i, m + 1, t); c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) { c[i] -= 2; scan(i, m, t + 1); c[i] += 2; }
    if (n <= 7 && c[i + 1] > 0) { c[i]--; c[i + 1]--; scan(i, m, t + 1); c[i]++; c[i + 1]++; }
    if (n <= 6 && c[i + 2] > 0) { c[i]--; c[i + 2]--; scan(i, m, t + 1); c[i]++; c[i + 2]++; }
    c[i]--; scan(i, m, t); c[i]++;
  };
  scan(0, 0, 0);
  let result = 8 - best; // 雀頭なし
  for (let i = 0; i < KINDS; i++) {
    if (c[i] >= 2) {
      c[i] -= 2;
      best = 0;
      scan(0, 0, 0);
      result = Math.min(result, 8 - best - 1);
      c[i] += 2;
    }
  }
  return result;
}

function chiitoiShanten(c: number[]): number {
  let pairs = 0, kinds = 0;
  for (const n of c) { if (n >= 2) pairs++; if (n >= 1) kinds++; }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

/** 向聴数。13枚ならテンパイ=0、14枚ならあがり=-1 */
export function shanten(tiles: readonly number[]): number {
  const c = counts(tiles);
  return Math.min(regularShanten(c), chiitoiShanten(c));
}

export const isComplete = (tiles: readonly number[]): boolean => tiles.length === 14 && shanten(tiles) === -1;

/** 14枚から1枚切った後の向聴数が最小になる牌（番号）の集合 */
export function bestDiscards(tiles: readonly number[]): { best: number; byTile: Map<number, number> } {
  const byTile = new Map<number, number>();
  let best = 99;
  for (const t of new Set(tiles)) {
    const rest = tiles.slice();
    rest.splice(rest.indexOf(t), 1);
    const s = shanten(rest);
    byTile.set(t, s);
    if (s < best) best = s;
  }
  return { best, byTile };
}

// ---------- 面子と役 ----------

export interface Decomp { melds: { kind: 'run' | 'tri'; i: number }[]; pair: number }

/** 14枚（通常形）の分解をすべて返す */
export function decompose(tiles: readonly number[]): Decomp[] {
  const c = counts(tiles);
  const out: Decomp[] = [];
  for (let p = 0; p < KINDS; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const melds: Decomp['melds'] = [];
    const rec = (i: number): void => {
      while (i < KINDS && c[i] === 0) i++;
      if (i >= KINDS) { out.push({ melds: melds.slice(), pair: p }); return; }
      if (c[i] >= 3) { c[i] -= 3; melds.push({ kind: 'tri', i }); rec(i); melds.pop(); c[i] += 3; }
      if (i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--; c[i + 1]--; c[i + 2]--; melds.push({ kind: 'run', i }); rec(i); melds.pop();
        c[i]++; c[i + 1]++; c[i + 2]++;
      }
    };
    rec(0);
    c[p] += 2;
  }
  return out;
}

export interface Yaku { name: string; han: number }

/** あがった14枚の役。ツモ(1翻)は常に付く */
export function yakuOf(tiles: readonly number[]): Yaku[] {
  const base: Yaku[] = [{ name: 'ツモ', han: 1 }];
  const common: Yaku[] = [];
  if (tiles.every((t) => numOf(t) >= 2 && numOf(t) <= 8)) common.push({ name: 'タンヤオ', han: 1 });
  if (new Set(tiles.map(suitOf)).size === 1) common.push({ name: '清一色', han: 6 });
  const c = counts(tiles);
  let best: Yaku[] | null = null;
  const sum = (y: Yaku[]) => y.reduce((a, b) => a + b.han, 0);
  for (const d of decompose(tiles)) {
    const y: Yaku[] = [];
    const runs = d.melds.filter((m) => m.kind === 'run');
    if (d.melds.every((m) => m.kind === 'tri')) y.push({ name: 'トイトイ', han: 2 });
    for (let s = 0; s < 3; s++) {
      if ([0, 3, 6].every((n) => runs.some((r) => r.i === s * 9 + n))) y.push({ name: '一気通貫', han: 2 });
    }
    for (let n = 0; n < 7; n++) {
      if ([0, 1, 2].every((s) => runs.some((r) => r.i === s * 9 + n))) y.push({ name: '三色同順', han: 2 });
    }
    if (runs.some((r, a) => runs.some((q, b) => a < b && q.i === r.i))) y.push({ name: 'イーペーコー', han: 1 });
    const all = [...common, ...y];
    if (!best || sum(all) > sum(best)) best = all;
  }
  if (c.every((n) => n === 0 || n === 2)) {
    const y = [...common, { name: 'チートイツ', han: 2 }];
    if (!best || sum(y) > sum(best)) best = y;
  }
  return [...base, ...(best ?? common)];
}

export const totalHan = (y: Yaku[]): number => y.reduce((a, b) => a + b.han, 0);

// ---------- 音の厚み ----------

/** 色（萬/筒/索）ごとの面子数＋雀頭の半分。手が育つほど音が厚くなる */
export function layerLevels(tiles: readonly number[]): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (let s = 0; s < 3; s++) {
    const c = counts(tiles.filter((t) => suitOf(t) === s));
    let bestM = 0;
    const scan = (i: number, m: number): void => {
      while (i < KINDS && c[i] === 0) i++;
      if (i >= KINDS) { bestM = Math.max(bestM, m); return; }
      if (c[i] >= 3) { c[i] -= 3; scan(i, m + 1); c[i] += 3; }
      if (i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--; c[i + 1]--; c[i + 2]--; scan(i, m + 1); c[i]++; c[i + 1]++; c[i + 2]++;
      }
      c[i]--; scan(i, m); c[i]++;
    };
    scan(s * 9, 0);
    const total = c.reduce((a, b) => a + b, 0);
    out[s] = bestM + (total - 3 * bestM >= 2 ? 0.5 : 0);
  }
  return out;
}
