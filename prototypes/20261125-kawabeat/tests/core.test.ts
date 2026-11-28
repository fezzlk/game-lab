import { describe, it, expect } from 'vitest';
import { Round, deal } from '../src/core';
import { P } from '../src/params';
import { shanten, bestDiscards } from '../src/tiles';

/** 1局を最後まで回す。policy は拍の途中（指定フレーム）に呼ばれる */
function run(seed: number, policy: (r: Round) => void, atFrac = 0.9): Round {
  const r = new Round(seed);
  let guard = 0;
  while (!r.ended && guard++ < 100000) {
    r.update();
    if (r.canDiscard && r.beatPhase >= atFrac) policy(r);
  }
  return r;
}

const greedy = (avoidDanger: boolean) => (r: Round): void => {
  const all = r.tiles14;
  const { byTile } = bestDiscards(all);
  let pick = 0, pickKey = Infinity;
  all.forEach((t, i) => {
    const key = byTile.get(t)! * 10 + (avoidDanger ? r.ronRate(t) * 100 : 0);
    if (key < pickKey) { pickKey = key; pick = i; }
  });
  r.discard(pick);
};

describe('配牌', () => {
  it('向聴数が範囲内（何もしなくてはあがれない）', () => {
    for (let s = 1; s <= 300; s++) {
      const sh = shanten(deal(s).hand);
      expect(sh).toBeGreaterThanOrEqual(P.dealMinShanten);
      expect(sh).toBeLessThanOrEqual(P.dealMaxShanten);
    }
  });
});

describe('ずるい遊び方', () => {
  it('何もしない（ツモ切りだけ）ではあがれない', () => {
    for (let s = 1; s <= 200; s++) {
      const r = run(s, () => {});
      expect(r.phase).not.toBe('won');
    }
  });
  it('連打しても1拍に1枚しか切れない', () => {
    const r = new Round(3);
    while (!r.canDiscard) r.update();
    expect(r.discard(13)).not.toBeNull();
    expect(r.discard(0)).toBeNull();
    expect(r.discard(5)).toBeNull();
    expect(r.hand.length).toBe(13);
  });
  it('切らずに放置すると抜け（無音）になりコンボが切れる', () => {
    const r = new Round(5);
    let misses = 0;
    for (let i = 0; i < 3000 && !r.ended; i++) {
      for (const e of r.update()) if (e.type === 'miss') misses++;
    }
    expect(misses).toBeGreaterThan(0);
    expect(r.combo).toBe(0);
    expect(r.slots.every((s) => s === null)).toBe(true);
  });
  it('カウントイン中は切れない', () => {
    const r = new Round(4);
    r.update();
    expect(r.canDiscard).toBe(false);
    expect(r.discard(0)).toBeNull();
  });
});

describe('ゲームとして成り立つ', () => {
  const N = 150;
  const rate = (policy: (r: Round) => void): number => {
    let w = 0;
    for (let s = 1; s <= N; s++) if (run(s, policy).phase === 'won') w++;
    return w / N;
  };
  it('牌効率と危険牌を見て打てば、そこそこあがれる', () => {
    expect(rate(greedy(true))).toBeGreaterThan(0.25);
  });
  it('危険牌を無視すると放銃する（リスクが効いている）', () => {
    let ron = 0;
    for (let s = 1; s <= N; s++) if (run(s, greedy(false)).phase === 'ron') ron++;
    expect(ron / N).toBeGreaterThan(0.1);
  });
  it('でたらめに切るより、牌効率で切るほうが強い', () => {
    const random = (r: Round): void => { r.discard(Math.floor(((r.t * 7919) % 14 + 14) % 14)); };
    expect(rate(greedy(true))).toBeGreaterThan(rate(random) + 0.1);
  });
  it('ジャストで切ると加点が大きい', () => {
    const early = run(9, (r) => r.discard(13), 0.05).score;
    const just = run(9, (r) => r.discard(13), 0.97).score;
    expect(just).toBeGreaterThanOrEqual(early);
  });
});
