import { describe, it, expect } from 'vitest';
import { buildChart, guideAt } from '../src/song/chart';
import { SONGS } from '../src/song/songs';
import { stepShip } from '../src/physics';

describe('気流（理想の軌道へ引き戻す力）', () => {
  for (const song of SONGS) {
    it(`${song.title}: 譜面どおりに押すと、気流があっても理想の軌道と一致する`, () => {
      const c = buildChart(song);
      const s = { y: c.pathY[0], vy: 0, holdFrames: 0 };
      let maxErr = 0;
      for (let f = 0; f < c.totalFrames; f++) {
        stepShip(s, c.held[f] === 1, guideAt(c, f));
        maxErr = Math.max(maxErr, Math.abs(s.y - c.pathY[f + 1]));
      }
      expect(maxErr).toBeLessThan(0.01);
    });

    it(`${song.title}: 途中でタイミングをずらしても、その後正確に押せば中央に戻る`, () => {
      const c = buildChart(song);
      const s = { y: c.pathY[0], vy: 0, holdFrames: 0 };
      const fpb = c.framesPerStep * 4;
      const errStart = Math.round(fpb * 16); // 4小節目あたりで
      let peak = 0;
      let after2s = Infinity;
      for (let f = 0; f < errStart + 240; f++) {
        // 1拍のあいだ、押す・離すを 6 フレーム遅らせる
        const late = f >= errStart && f < errStart + fpb;
        const held = late ? c.held[Math.max(0, f - 6)] === 1 : c.held[f] === 1;
        stepShip(s, held, guideAt(c, f));
        const err = Math.abs(s.y - c.pathY[f + 1]);
        if (f >= errStart && f < errStart + 60) peak = Math.max(peak, err);
        if (f === errStart + Math.round(fpb) + 120) after2s = err;
      }
      expect(peak).toBeGreaterThan(3); // ずれは実際に起きている
      expect(after2s).toBeLessThan(2); // ずれた拍の約2秒後には中央付近に戻っている
    });

    it(`${song.title}: 気流がないと、ずれは残り続ける（解きたかった矛盾の確認）`, () => {
      const c = buildChart(song);
      const s = { y: c.pathY[0], vy: 0, holdFrames: 0 };
      const fpb = c.framesPerStep * 4;
      const errStart = Math.round(fpb * 16);
      let after2s = 0;
      for (let f = 0; f < errStart + 240; f++) {
        const late = f >= errStart && f < errStart + fpb;
        stepShip(s, late ? c.held[Math.max(0, f - 6)] === 1 : c.held[f] === 1);
        if (f === errStart + Math.round(fpb) + 120) after2s = Math.abs(s.y - c.pathY[f + 1]);
      }
      expect(after2s).toBeGreaterThan(2);
    });
  }
});
