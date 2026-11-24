import { describe, it, expect } from 'vitest';
import { Terrain } from '../src/terrain';
import { buildChart, guideAt } from '../src/song/chart';
import { SONGS } from '../src/song/songs';
import { P } from '../src/params';
import { stepShip } from '../src/physics';

describe('Terrain', () => {
  it('壁は理想の軌道の上下に、曲ごとに一定の距離で置かれる', () => {
    for (const song of SONGS) {
      const c = buildChart(song);
      const t = new Terrain(c);
      const w = t.wallAt(100 * c.speed);
      expect((w.top + w.bot) / 2).toBeCloseTo(c.pathY[100], 3);
      expect((w.bot - w.top) / 2).toBeCloseTo(song.halfGap);
    }
  });

  it('壁からの距離を正しく測る', () => {
    const c = buildChart(SONGS[0]);
    const t = new Terrain(c);
    const w = t.wallAt(0);
    expect(t.nearest(0, w.top - 1).inside).toBe(true);
    expect(t.nearest(0, w.bot + 1).inside).toBe(true);
    expect(t.nearest(0, w.top + 5).dist).toBeLessThanOrEqual(5.01);
  });

  for (const song of SONGS) {
    it(`${song.title}: 譜面どおりに押せば最後まで当たらない`, () => {
      const c = buildChart(song);
      const t = new Terrain(c);
      const s = { y: c.pathY[0], vy: 0, holdFrames: 0 };
      for (let f = 0; f < c.totalFrames; f++) {
        stepShip(s, c.held[f] === 1, guideAt(c, f));
        const n = t.nearest((f + 1) * c.speed, s.y);
        expect(n.inside).toBe(false);
        expect(n.dist - P.shipRadius).toBeGreaterThan(0);
      }
    });
  }
});
