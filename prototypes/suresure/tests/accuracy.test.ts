import { describe, it, expect } from 'vitest';
import { Accuracy } from '../src/accuracy';
import { buildEdgeDist } from '../src/song/chart';
import { P } from '../src/params';

const FPB = 30; // 120BPM の 1拍
const FAR = 255; // 境目から遠い

describe('Accuracy（押す状態の一致）', () => {
  it('押す状態が譜面と合っていれば点とゲージが増え、外せば減る', () => {
    const a = new Accuracy(FPB);
    a.step(true, true, FAR);
    expect(a.score).toBe(P.pointsPerFrame);
    expect(a.gauge).toBeCloseTo(P.gaugeStart + P.gaugeGain);
    const b = new Accuracy(FPB);
    b.step(true, false, FAR);
    expect(b.score).toBe(0);
    expect(b.gauge).toBeCloseTo(P.gaugeStart - P.gaugeLoss);
  });

  it('境目の猶予内の食い違いは減点せず、コンボも切れない', () => {
    const a = new Accuracy(FPB);
    for (let i = 0; i < FPB * 2; i++) a.step(true, true, FAR);
    const g = a.gauge;
    for (let d = 0; d < P.edgeGrace; d++) expect(a.step(false, true, d)).toBeNull();
    expect(a.gauge).toBeCloseTo(g);
    expect(a.combo).toBe(2);
    expect(a.matchRate).toBe(1);
  });

  it('猶予の外で外すとコンボと倍率が切れる', () => {
    const a = new Accuracy(FPB);
    for (let i = 0; i < FPB * P.beatsPerLevel; i++) a.step(false, false, FAR);
    expect(a.level).toBe(2);
    expect(a.step(true, false, P.edgeGrace)).toBe('comboBreak');
    expect(a.combo).toBe(0);
    expect(a.level).toBe(1);
    expect(a.maxLevel).toBe(2);
  });

  it('コンボの拍数で倍率が上がり、上限で止まる', () => {
    const a = new Accuracy(FPB);
    let ups = 0;
    for (let i = 0; i < FPB * P.beatsPerLevel * (P.maxLevel + 3); i++) if (a.step(true, true, FAR) === 'levelUp') ups++;
    expect(ups).toBe(P.maxLevel - 1);
  });

  it('一致率とクリア判定', () => {
    const a = new Accuracy(FPB);
    for (let i = 0; i < 300; i++) a.step(true, true, FAR);
    for (let i = 0; i < 100; i++) a.step(false, true, FAR);
    expect(a.matchRate).toBeCloseTo(0.75);
    const full = new Accuracy(FPB);
    for (let i = 0; i < 2000; i++) full.step(true, true, FAR);
    expect(full.cleared).toBe(true);
    const bad = new Accuracy(FPB);
    for (let i = 0; i < 2000; i++) bad.step(i % 2 === 0, true, FAR);
    expect(bad.cleared).toBe(false);
  });

  it('壁に当たるとゲージが減りコンボが切れる', () => {
    const a = new Accuracy(FPB);
    for (let i = 0; i < FPB * 3; i++) a.step(true, true, FAR);
    const g = a.gauge;
    a.hit();
    expect(a.gauge).toBeCloseTo(g - P.gaugeHitLoss);
    expect(a.combo).toBe(0);
  });
});

describe('境目までの距離', () => {
  it('境目をはさむ2フレームが0で、離れるほど増える', () => {
    const held = Uint8Array.from([0, 0, 0, 1, 1, 1, 1, 0, 0]);
    expect(Array.from(buildEdgeDist(held))).toEqual([2, 1, 0, 0, 1, 1, 0, 0, 1]);
  });
});
