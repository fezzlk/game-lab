import type { Chart } from './song/chart';

export interface Nearest {
  /** 自機中心から最も近い地形までの距離（中に入っていれば 0） */
  dist: number;
  px: number;
  py: number;
  inside: boolean;
}

/**
 * 地形＝理想の軌道の上下に、曲ごとに一定の距離（halfGap）離して置いた壁。
 * 列は 1フレームに1本（x = フレーム × 速度）。
 */
export class Terrain {
  readonly speed: number;
  readonly half: number;

  constructor(readonly chart: Chart) {
    this.speed = chart.speed;
    this.half = chart.song.halfGap;
  }

  get columns(): number { return this.chart.pathY.length; }

  /** 列 i の中心（理想の軌道）。範囲外は端の値 */
  centerAt(i: number): number {
    const p = this.chart.pathY;
    return p[Math.max(0, Math.min(p.length - 1, i))];
  }

  halfAt(_i: number): number {
    return this.half;
  }

  /** x における中心（理想の軌道の高さ） */
  centerAtX(x: number): number {
    const fi = x / this.speed;
    const i = Math.floor(fi);
    return this.centerAt(i) + (this.centerAt(i + 1) - this.centerAt(i)) * (fi - i);
  }

  /** x における天井と床の y（線形補間） */
  wallAt(x: number): { top: number; bot: number } {
    const c = this.centerAtX(x);
    return { top: c - this.half, bot: c + this.half };
  }

  /** 点 (x, y) から最も近い壁 */
  nearest(x: number, y: number, reach = 60): Nearest {
    const w = this.wallAt(x);
    if (y <= w.top || y >= w.bot) {
      return { dist: 0, px: x, py: y <= w.top ? w.top : w.bot, inside: true };
    }
    let best: Nearest = { dist: Infinity, px: x, py: y, inside: false };
    // 数フレームおきの折れ線で十分（列は約5px間隔）
    const stepCols = 2;
    const i0 = Math.max(0, Math.floor((x - reach) / this.speed));
    const i1 = Math.min(this.columns - 1, Math.ceil((x + reach) / this.speed));
    for (let i = i0; i < i1; i += stepCols) {
      const j = Math.min(i1, i + stepCols);
      const ax = i * this.speed, bx = j * this.speed;
      const ac = this.centerAt(i), bc = this.centerAt(j);
      const ah = this.halfAt(i), bh = this.halfAt(j);
      best = closer(best, segDist(x, y, ax, ac - ah, bx, bc - bh));
      best = closer(best, segDist(x, y, ax, ac + ah, bx, bc + bh));
    }
    return best;
  }
}

function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): Nearest {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  const px = ax + dx * t, py = ay + dy * t;
  return { dist: Math.hypot(x - px, y - py), px, py, inside: false };
}

function closer(a: Nearest, b: Nearest): Nearest {
  return b.dist < a.dist ? b : a;
}
