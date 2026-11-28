/**
 * 調整値はすべてここに集める（桜井氏の動画 #046「調整をしやすくする仕組み」）。
 * `?debug` を付けて開くと、ここの値をスライダーで実行中に変えられる。
 * 論理解像度は 960×540。時間は 60fps 固定ステップのフレーム基準。
 */
export const VIEW_W = 960;
export const VIEW_H = 540;

export const P = {
  /** 【テンポ】BPM。1拍＝牌を1枚切る制限時間 */
  bpm: 72,
  /** 【カウントイン拍数】 */
  countInBeats: 4,
  /** 【1局のツモ回数】尽きたら流局 */
  maxDraws: 30,
  /** 【局数】 */
  rounds: 3,
  /** 【ジャストの猶予ms】拍の直前これだけの間に切るとジャスト */
  justMs: 160,
  /** 【赤い危険牌の放銃率】 */
  ronRed: 0.7,
  /** 【橙の危険牌の放銃率】 */
  ronOrange: 0.25,
  /** 【危険牌の入れ替わり拍数】 */
  dangerEvery: 8,
  /** 【放銃の失点】 */
  ronPenalty: 1500,
  /** 【1翻の点】 */
  hanPoints: 1000,
  /** 【1打の点】 */
  discardPoints: 10,
  /** 【ジャストの加点】 */
  justBonus: 10,
  /** 【コンボ倍率の段】何コンボごとに倍率が1上がるか */
  comboStep: 4,
  /** 【コンボ倍率の上限】 */
  comboMaxMul: 4,
  /** 【配牌の向聴数の下限】 */
  dealMinShanten: 2,
  /** 【配牌の向聴数の上限】 */
  dealMaxShanten: 3,
  /** 【音量】 */
  volume: 0.5,
  /** 【ハンドの音の厚み】面子1つあたりの音量の増え方 */
  layerGain: 0.35,
};

export type ParamKey = keyof typeof P;

/** デバッグパネルのスライダー範囲 [min, max, step] */
export const PARAM_RANGE: Partial<Record<ParamKey, [number, number, number]>> = {
  bpm: [40, 140, 1],
  countInBeats: [0, 8, 1],
  maxDraws: [8, 40, 1],
  rounds: [1, 6, 1],
  justMs: [40, 400, 10],
  ronRed: [0, 1, 0.05],
  ronOrange: [0, 1, 0.05],
  dangerEvery: [2, 16, 1],
  ronPenalty: [0, 5000, 100],
  hanPoints: [100, 3000, 100],
  discardPoints: [0, 100, 5],
  justBonus: [0, 100, 5],
  comboStep: [1, 10, 1],
  comboMaxMul: [1, 10, 1],
  volume: [0, 1, 0.05],
  layerGain: [0, 1, 0.05],
};
