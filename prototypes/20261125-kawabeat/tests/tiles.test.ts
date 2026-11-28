import { describe, it, expect } from 'vitest';
import { shanten, isComplete, yakuOf, totalHan, layerLevels, decompose } from '../src/tiles';

/** "123m456p789s11m" 形式 → 牌番号 */
const H = (s: string): number[] => {
  const out: number[] = [];
  let digits = '';
  for (const ch of s) {
    if (/\d/.test(ch)) digits += ch;
    else { const base = { m: 0, p: 9, s: 18 }[ch as 'm']; for (const d of digits) out.push(base + Number(d) - 1); digits = ''; }
  }
  return out;
};

describe('向聴数', () => {
  it('あがり形は -1', () => {
    expect(shanten(H('123m456m789m123p11s'))).toBe(-1);
    expect(isComplete(H('123m456m789m123p11s'))).toBe(true);
  });
  it('テンパイは 0', () => {
    expect(shanten(H('123m456m789m123p1s'))).toBe(0); // 13枚: 単騎待ち
    expect(shanten(H('123m456m789m12p11s'))).toBe(0);
  });
  it('チートイツ', () => {
    expect(shanten(H('1122m3344p5566s7s'))).toBe(0);
    expect(isComplete(H('1122m3344p5566s77s'))).toBe(true);
  });
  it('バラバラな手は遠い', () => {
    expect(shanten(H('147m258p369s14s7p3m'))).toBeGreaterThanOrEqual(4);
  });
  it('1枚切ると向聴数は増えるか同じ', () => {
    const h = H('123m456p78s1135m99p');
    expect(shanten(h)).toBeLessThanOrEqual(shanten(h.slice(1)));
  });
});

describe('役', () => {
  it('タンヤオ＋ツモ', () => {
    const y = yakuOf(H('234m345p567s234p22s'));
    expect(y.map((x) => x.name)).toContain('タンヤオ');
    expect(totalHan(y)).toBeGreaterThanOrEqual(2);
  });
  it('清一色は大きい', () => {
    expect(totalHan(yakuOf(H('123456789m1155m99m'.replace('99m', '') + '11m')))).toBeGreaterThanOrEqual(6);
  });
  it('一気通貫・三色', () => {
    expect(yakuOf(H('123456789m234p55s')).map((x) => x.name)).toContain('一気通貫');
    expect(yakuOf(H('234m234p234s567m99p')).map((x) => x.name)).toContain('三色同順');
  });
  it('分解は雀頭を含む', () => {
    expect(decompose(H('123m456m789m123p11s')).length).toBeGreaterThan(0);
  });
});

describe('音の厚み', () => {
  it('面子が増えるほど厚い', () => {
    const thin = layerLevels(H('1m5m9m1p5p9p1s5s9s'));
    const thick = layerLevels(H('123456m111p22s'));
    expect(thick[0]).toBeGreaterThan(thin[0]);
    expect(thick[1]).toBe(1);
    expect(thick[2]).toBe(0.5);
  });
});
