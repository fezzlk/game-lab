import { describe, it, expect } from 'vitest';
import { buildChart, guideAt, type Chart } from '../src/song/chart';
import { SONGS } from '../src/song/songs';
import { stepShip } from '../src/physics';
import { Terrain } from '../src/terrain';
import { Accuracy } from '../src/accuracy';
import { P } from '../src/params';

/** ゲームと同じ規則で1曲流す（体力・無敵・ゲージ・採点） */
function playThrough(c: Chart, press: (f: number, y: number) => boolean) {
  const t = new Terrain(c);
  const a = new Accuracy(c.framesPerStep * 4);
  const s = { y: c.pathY[0], vy: 0, holdFrames: 0 };
  let hp = P.hp, inv = 0;
  for (let f = 0; f < c.totalFrames; f++) {
    const h = press(f, s.y);
    stepShip(s, h, guideAt(c, f));
    if (inv > 0) inv--;
    const n = t.nearest((f + 1) * c.speed, s.y);
    if ((n.inside || n.dist < P.shipRadius) && inv === 0) {
      hp--; inv = P.invincibleFrames; a.hit();
      if (hp <= 0) return { result: 'MISS', a };
    }
    a.step(h, c.held[f] === 1, c.edgeDist[f]);
  }
  return { result: a.cleared ? 'CLEAR' : 'FAILED', a };
}

describe('押し方ごとの結果（リズムを無視してクリアできないこと）', () => {
  for (const song of SONGS) {
    const c = buildChart(song);
    const fps = c.framesPerStep;

    it(`${song.title}: 譜面どおり → CLEAR、一致率100%、全コンボ`, () => {
      const r = playThrough(c, (f) => c.held[f] === 1);
      expect(r.result).toBe('CLEAR');
      expect(r.a.matchRate).toBe(1);
      expect(r.a.maxCombo).toBeGreaterThanOrEqual(Math.floor(c.totalFrames / (fps * 4)) - 1);
    });

    it(`${song.title}: 全体を3フレーム遅らせる → 猶予内なので CLEAR・全コンボ`, () => {
      const r = playThrough(c, (f) => c.held[Math.max(0, f - 3)] === 1);
      expect(r.result).toBe('CLEAR');
      expect(r.a.matchRate).toBe(1);
      expect(r.a.maxCombo).toBeGreaterThanOrEqual(Math.floor(c.totalFrames / (fps * 4)) - 1);
    });

    it(`${song.title}: 洞窟の真ん中を目で追う（リズム無視） → CLEAR できない`, () => {
      const r = playThrough(c, (f, y) => y > c.pathY[f]);
      expect(r.result).not.toBe('CLEAR');
    });

    it(`${song.title}: 4分で一定に押す → CLEAR できない`, () => {
      const r = playThrough(c, (f) => f % (fps * 4) < fps * 2);
      expect(r.result).not.toBe('CLEAR');
    });

    it(`${song.title}: ずっと長押し → CLEAR できない`, () => {
      const r = playThrough(c, () => true);
      expect(r.result).not.toBe('CLEAR');
    });
  }
});
