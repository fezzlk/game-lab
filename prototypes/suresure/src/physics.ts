import { P } from './params';

/** 自機の上下の状態。譜面の理想の軌道とゲームで同じ関数を使い、結果を一致させる */
export interface ShipState {
  y: number;
  vy: number;
  holdFrames: number;
}

/** 理想の軌道（このフレームを進める前の高さと速度） */
export interface Guide {
  y: number;
  vy: number;
}

/**
 * 1フレーム進める。guide を渡すと、理想の軌道からのずれに比例して引き戻す力（気流）がかかる。
 * 軌道どおりならずれはゼロなので力もゼロ。過去のずれは約1秒で消え、その後正確に押せば中央に戻る。
 */
export function stepShip(s: ShipState, held: boolean, guide?: Guide): void {
  // 気流は、このフレームを進める前の状態どうしで比べる（軌道どおりなら力はちょうどゼロ）
  if (guide) s.vy -= P.guideStrength * (s.y - guide.y) + P.guideDamping * (s.vy - guide.vy);
  if (held) {
    s.holdFrames++;
    // 押し始めの数フレームだけ強く上げる隠し味（specs.md ジャンプ）
    const kick = s.holdFrames <= P.thrustKickFrames ? P.thrustKickMul : 1;
    s.vy -= P.thrust * kick;
  } else {
    s.holdFrames = 0;
  }
  s.vy += P.gravity;
  s.vy *= 1 - P.drag;
  s.vy = Math.max(-P.maxVy, Math.min(P.maxVy, s.vy));
  s.y += s.vy;
}
