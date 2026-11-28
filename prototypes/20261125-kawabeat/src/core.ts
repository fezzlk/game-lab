/**
 * 1局の進行（DOM なし）。60fps 固定ステップで update() を呼ぶ。
 * 1拍＝1ツモ。拍の間に1枚切る。切った牌は次の拍の位置に「河」として入り、4拍ごとにループ再生される。
 * 拍までに切らないとツモ切り（その位置は無音＝抜け）。
 */
import { P } from './params';
import { makeRng } from './rng';
import { KINDS, shanten, isComplete, bestDiscards, yakuOf, totalHan, layerLevels, type Yaku } from './tiles';

export const LOOP = 4;
export type Phase = 'countin' | 'play' | 'won' | 'ron' | 'exhaust';
export type DangerLevel = 'red' | 'orange';

export interface DiscardResult {
  tile: number;
  /** 向聴数を最小に保つ牌効率の良い切りか */
  efficient: boolean;
  just: boolean;
  forced: boolean;
  ron: boolean;
  shantenAfter: number;
  points: number;
  slot: number;
}

export type RoundEvent =
  | { type: 'beat'; beat: number; slot: number; tile: number | null; levels: [number, number, number] }
  | { type: 'draw'; tile: number }
  | { type: 'miss'; tile: number }
  | { type: 'danger' }
  | { type: 'end'; phase: Phase };

export interface Deal { hand: number[]; wall: number[] }

/** 配牌。向聴数が [dealMinShanten, dealMaxShanten] に収まるまで引き直す（何もしなくても和了れないように） */
export function deal(seed: number): Deal {
  for (let salt = 0; ; salt++) {
    const rng = makeRng(seed * 7919 + salt);
    const wall: number[] = [];
    for (let i = 0; i < KINDS; i++) for (let k = 0; k < 4; k++) wall.push(i);
    for (let i = wall.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [wall[i], wall[j]] = [wall[j], wall[i]];
    }
    const hand = wall.splice(0, 13).sort((a, b) => a - b);
    const s = shanten(hand);
    if ((s >= P.dealMinShanten && s <= P.dealMaxShanten) || salt > 500) return { hand, wall };
  }
}

export class Round {
  /** 現在の時刻（フレーム）。カウントイン中は負 */
  t: number;
  phase: Phase = 'countin';
  /** 手牌13枚（並べ替え済み）。切る前は drawn も加えて14枚 */
  hand: number[];
  drawn: number | null = null;
  wall: number[];
  /** 河のループ（4拍分）。null は無音 */
  slots: (number | null)[] = [null, null, null, null];
  riverLog: number[] = [];
  danger = new Map<number, DangerLevel>();
  draws = 0;
  combo = 0;
  maxCombo = 0;
  misses = 0;
  score = 0;
  yaku: Yaku[] = [];
  han = 0;
  last: DiscardResult | null = null;
  private lastG: number;
  private discardedThisWindow = false;
  private rng: () => number;
  readonly beatFrames: number;

  constructor(public seed: number) {
    const d = deal(seed);
    this.hand = d.hand;
    this.wall = d.wall;
    this.rng = makeRng(seed ^ 0x9e3779b9);
    this.beatFrames = 3600 / P.bpm;
    this.t = -P.countInBeats * this.beatFrames;
    this.lastG = Math.floor(this.t / this.beatFrames + 1e-9) - 1;
    if (P.countInBeats === 0) this.phase = 'play';
  }

  /** いまの拍番号（カウントイン中は負） */
  get beat(): number { return Math.floor(this.t / this.beatFrames + 1e-9); }
  /** 拍の中の進み具合 0..1 */
  get beatPhase(): number { return this.t / this.beatFrames - this.beat; }
  get tiles14(): number[] { return this.drawn === null ? this.hand : [...this.hand, this.drawn]; }
  get ended(): boolean { return this.phase === 'won' || this.phase === 'ron' || this.phase === 'exhaust'; }
  /** 切る牌を選べる状態か */
  get canDiscard(): boolean { return this.phase === 'play' && this.drawn !== null && !this.discardedThisWindow; }

  update(): RoundEvent[] {
    const ev: RoundEvent[] = [];
    if (this.ended) return ev;
    this.t += 1;
    const g = this.beat;
    while (this.lastG < g && !this.ended) {
      this.lastG++;
      this.boundary(this.lastG, ev);
    }
    return ev;
  }

  private levels(): [number, number, number] { return layerLevels(this.hand); }

  private boundary(g: number, ev: RoundEvent[]): void {
    if (g > 0 && this.phase === 'play') {
      // 前の拍で切れなかった → ツモ切り（無音）
      if (this.drawn !== null && !this.discardedThisWindow) {
        const tile = this.drawn;
        this.misses++;
        this.combo = 0;
        ev.push({ type: 'miss', tile });
        this.finishDiscard(tile, this.slotFor(g - 1), true, false, true, ev);
      }
    }
    const slot = ((g % LOOP) + LOOP) % LOOP;
    if (this.phase === 'countin' || this.phase === 'play') {
      ev.push({ type: 'beat', beat: g, slot, tile: g >= 0 ? this.slots[slot] : null, levels: this.levels() });
    }
    if (this.ended) { ev.push({ type: 'end', phase: this.phase }); return; }
    if (g < 0) return;
    this.phase = 'play';
    if (g >= P.maxDraws) { this.phase = 'exhaust'; ev.push({ type: 'end', phase: this.phase }); return; }
    // ツモ
    this.drawn = this.wall.shift()!;
    this.draws++;
    this.discardedThisWindow = false;
    ev.push({ type: 'draw', tile: this.drawn });
    if (g % P.dangerEvery === 0) { this.rollDanger(); ev.push({ type: 'danger' }); }
    if (isComplete(this.tiles14)) {
      this.yaku = yakuOf(this.tiles14);
      this.han = totalHan(this.yaku);
      this.score += this.han * P.hanPoints + this.maxCombo * 100;
      this.phase = 'won';
      ev.push({ type: 'end', phase: 'won' });
    }
  }

  /** いまの窓で切ったときに入る河の位置（次の拍） */
  private slotFor(g: number): number { return (((g + 1) % LOOP) + LOOP) % LOOP; }

  private rollDanger(): void {
    this.danger.clear();
    const kinds = [...new Set(this.tiles14)];
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    if (kinds[0] !== undefined) this.danger.set(kinds[0], 'red');
    for (const k of kinds.slice(1, 3)) this.danger.set(k, 'orange');
  }

  /** 放銃率（0〜1） */
  ronRate(tile: number): number {
    const d = this.danger.get(tile);
    return d === 'red' ? P.ronRed : d === 'orange' ? P.ronOrange : 0;
  }

  /** 手牌 index（0..12 が手牌、13 が今引いた牌）を切る。受け付けなければ null */
  discard(index: number): DiscardResult | null {
    if (!this.canDiscard) return null;
    const all = this.tiles14;
    if (index < 0 || index >= all.length) return null;
    const tile = all[index];
    const g = this.beat;
    const remainFrames = (g + 1) * this.beatFrames - this.t;
    const just = remainFrames <= (P.justMs / 1000) * 60;
    // 切る前に、向聴数を最小にできる牌かを調べる
    const { best, byTile } = bestDiscards(all);
    const efficient = byTile.get(tile) === best;
    if (efficient) this.combo++; else this.combo = 0;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    return this.finishDiscard(tile, this.slotFor(g), false, just, false, undefined, efficient, index);
  }

  private finishDiscard(
    tile: number, slot: number, forced: boolean, just: boolean, silent: boolean,
    ev?: RoundEvent[], efficientIn = false, index = -1,
  ): DiscardResult {
    const all = this.tiles14;
    const at = index >= 0 ? index : all.lastIndexOf(tile);
    const rest = all.slice();
    rest.splice(at, 1);
    this.hand = rest.sort((a, b) => a - b);
    this.drawn = null;
    this.discardedThisWindow = true;
    this.riverLog.push(tile);
    this.slots[slot] = silent ? null : tile;
    const ron = this.rng() < this.ronRate(tile);
    const mul = Math.min(P.comboMaxMul, 1 + Math.floor(this.combo / P.comboStep));
    const points = silent ? 0 : (P.discardPoints + (just ? P.justBonus : 0)) * mul;
    this.score += points;
    const result: DiscardResult = {
      tile, efficient: efficientIn, just, forced, ron,
      shantenAfter: shanten(this.hand), points, slot,
    };
    this.last = result;
    if (ron) {
      this.phase = 'ron';
      this.score -= P.ronPenalty;
      this.combo = 0;
      ev?.push({ type: 'end', phase: 'ron' });
    }
    return result;
  }
}
