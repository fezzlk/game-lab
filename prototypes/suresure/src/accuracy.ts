import { P } from './params';

export type AccuracyEvent = 'levelUp' | 'comboBreak' | null;

/**
 * 採点：押している・離しているが譜面と合っているかをフレームごとに見る（描画・音を持たない純粋ロジック）。
 * 音価（押している長さ）と離すタイミングがそのまま点になる。高さは見ないので、
 * 細かいリズムを無視して洞窟を目で追っても点にならない。
 * 押す・離すの境目の近く（edgeGrace 未満）の食い違いは、点が入らないだけで減点しない。
 */
export class Accuracy {
  score = 0;
  level = 1;
  maxLevel = 1;
  gauge = P.gaugeStart;
  /** 直近の一致具合 0〜1（残像の色に使う） */
  recent = 1;
  private comboFrames = 0;
  private maxComboFrames = 0;
  private matched = 0;
  private counted = 0;

  constructor(private framesPerBeat: number) {}

  /** コンボ（拍の数） */
  get combo(): number { return Math.floor(this.comboFrames / this.framesPerBeat); }
  get maxCombo(): number { return Math.floor(this.maxComboFrames / this.framesPerBeat); }
  /** 一致率 0〜1（猶予で見逃したフレームは数えない） */
  get matchRate(): number { return this.counted ? this.matched / this.counted : 0; }
  /** 曲の終わりにこれが true ならクリア */
  get cleared(): boolean { return this.gauge >= P.clearLine; }

  step(held: boolean, chartHeld: boolean, edgeDist: number): AccuracyEvent {
    if (held === chartHeld) {
      this.matched++;
      this.counted++;
      this.recent += (1 - this.recent) * 0.2;
      this.score += P.pointsPerFrame * this.level;
      this.gauge = Math.min(1, this.gauge + P.gaugeGain);
      this.comboFrames++;
      this.maxComboFrames = Math.max(this.maxComboFrames, this.comboFrames);
      const lv = Math.min(P.maxLevel, 1 + Math.floor(this.combo / P.beatsPerLevel));
      if (lv > this.level) {
        this.level = lv;
        this.maxLevel = Math.max(this.maxLevel, lv);
        return 'levelUp';
      }
      return null;
    }
    if (edgeDist < P.edgeGrace) {
      // 境目の猶予：点は入らないが、コンボは続けて伸ばす（人の手のわずかなずれで切らない）
      this.comboFrames++;
      this.maxComboFrames = Math.max(this.maxComboFrames, this.comboFrames);
      return null;
    }
    this.counted++;
    this.recent += (0 - this.recent) * 0.2;
    this.gauge = Math.max(0, this.gauge - P.gaugeLoss);
    if (this.comboFrames > 0) {
      const had = this.combo;
      this.breakCombo();
      return had > 0 ? 'comboBreak' : null;
    }
    return null;
  }

  /** 壁に当たった */
  hit(): void {
    this.gauge = Math.max(0, this.gauge - P.gaugeHitLoss);
    this.breakCombo();
  }

  breakCombo(): void {
    this.comboFrames = 0;
    this.level = 1;
  }
}
