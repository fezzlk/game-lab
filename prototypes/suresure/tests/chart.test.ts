import { describe, it, expect } from 'vitest';
import { buildChart } from '../src/song/chart';
import { VIEW_H } from '../src/params';
import { SONGS } from '../src/song/songs';
import { stepShip } from '../src/physics';

describe('譜面', () => {
  for (const song of SONGS) {
    it(`${song.title}: 壁（理想の軌道±曲の隙間）が画面内に収まる`, () => {
      const c = buildChart(song);
      let min = Infinity, max = -Infinity;
      for (const y of c.pathY) { min = Math.min(min, y); max = Math.max(max, y); }
      expect(min - song.halfGap).toBeGreaterThanOrEqual(0);
      expect(max + song.halfGap).toBeLessThanOrEqual(VIEW_H);
    });

    it(`${song.title}: 同じ曲は毎回同じ譜面`, () => {
      expect(buildChart(song).barPatterns).toEqual(buildChart(song).barPatterns);
    });

    it(`${song.title}: 譜面どおりに押すと理想の軌道をそのままなぞる`, () => {
      const c = buildChart(song);
      const s = { y: c.pathY[0], vy: 0, holdFrames: 0 };
      for (let f = 0; f < c.held.length; f++) {
        stepShip(s, c.held[f] === 1);
        expect(s.y).toBeCloseTo(c.pathY[f + 1], 3);
      }
    });

    it(`${song.title}: 長さは1分強〜2分`, () => {
      const c = buildChart(song);
      const sec = c.totalFrames / 60;
      expect(sec).toBeGreaterThan(60);
      expect(sec).toBeLessThan(120);
      expect(c.notes.length).toBeGreaterThan(50);
    });
  }

  it('候補を使い分けている（同じパターンばかりにならない）', () => {
    const c = buildChart(SONGS[1]);
    expect(new Set(c.barPatterns).size).toBeGreaterThan(4);
  });
});
