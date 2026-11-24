/** 画面の手応え：ヒットストップ・画面振動・フラッシュ・パーティクル・褒め表示 */

type ShakeSize = 'small' | 'mid' | 'big';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  size: number; grow: number;
  kind: 'spark' | 'flash' | 'fire' | 'smoke' | 'ring' | 'confetti';
  color: string;
}

interface Popup {
  text: string; x: number; y: number; life: number; max: number; color: string; size: number;
}

export class Fx {
  hitstop = 0;
  private shakeT = 0;
  private shakeMax = 1;
  private shakeAmp = 0;
  private shakeSize: ShakeSize = 'small';
  /** フラッシュ：明暗を交互に出す（白一色だとコントラストが落ちる） */
  private flashT = 0;
  particles: Particle[] = [];
  popups: Popup[] = [];

  stop(frames: number): void {
    this.hitstop = Math.max(this.hitstop, frames);
  }

  /** 大中小で揺れ方のパターン自体を変える（#103 画面振動） */
  shake(size: ShakeSize): void {
    const cfg = { small: [4, 10], mid: [8, 16], big: [18, 34] }[size];
    if (cfg[0] < this.shakeAmp * (this.shakeT / this.shakeMax)) return;
    this.shakeSize = size;
    this.shakeAmp = cfg[0];
    this.shakeT = this.shakeMax = cfg[1];
  }

  flash(frames: number): void {
    this.flashT = Math.max(this.flashT, frames);
  }

  shakeOffset(): { x: number; y: number } {
    if (this.shakeT <= 0) return { x: 0, y: 0 };
    const k = this.shakeT / this.shakeMax; // 最初に強く、徐々に収束
    const a = this.shakeAmp * k * k;
    const flip = this.shakeT % 2 === 0 ? 1 : -1;
    const jitter = () => 0.6 + Math.random() * 0.4;
    switch (this.shakeSize) {
      case 'small': return { x: 0, y: a * flip * jitter() };
      case 'mid': return { x: a * 0.6 * -flip * jitter(), y: a * flip * jitter() };
      default: return { x: a * (Math.random() * 2 - 1), y: a * (Math.random() * 2 - 1) };
    }
  }

  /** 白い面の加算 or 黒い面。偶数フレーム白、奇数フレーム暗 */
  flashOverlay(): { color: string; alpha: number } | null {
    if (this.flashT <= 0) return null;
    return this.flashT % 4 < 2
      ? { color: '#ffffff', alpha: Math.min(0.85, this.flashT * 0.12) }
      : { color: '#000000', alpha: Math.min(0.5, this.flashT * 0.06) };
  }

  sparks(x: number, y: number, dirX: number, dirY: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      const ang = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 1.6;
      const sp = 2 + Math.random() * 5;
      this.particles.push({
        x, y, vx: Math.cos(ang) * sp - 2, vy: Math.sin(ang) * sp,
        life: 0, max: 10 + Math.random() * 10, size: 2 + Math.random() * 2, grow: 0, kind: 'spark', color,
      });
    }
  }

  /** 爆発は 閃光 → 爆炎 → 黒煙 → 収束（#056 閃光､爆発､残煙） */
  explode(x: number, y: number): void {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0, max: 8, size: 30, grow: 14, kind: 'flash', color: '#fff' });
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0, max: 22, size: 10, grow: 9, kind: 'ring', color: '#ffe066' });
    for (let i = 0; i < 18; i++) {
      const ang = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4.5;
      this.particles.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: -Math.random() * 3, max: 18 + Math.random() * 14, size: 10 + Math.random() * 12, grow: 0.6,
        kind: 'fire', color: Math.random() < 0.5 ? '#ffb020' : '#ff5a1f',
      });
    }
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 2;
      this.particles.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.6,
        life: -8 - Math.random() * 10, max: 45 + Math.random() * 25, size: 12 + Math.random() * 10, grow: 0.5,
        kind: 'smoke', color: '#1a1a22',
      });
    }
    this.sparks(x, y, 1, 0, 24, '#fff7c2');
  }

  /** ベスト更新・クリアの紙吹雪（画面座標で描くので camX=0 の層に出す） */
  confetti(n = 80): void {
    const colors = ['#ffe23e', '#3ee8ff', '#ff4fd8', '#6dff9e', '#ff8a2a', '#ffffff'];
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: 480 + (Math.random() - 0.5) * 300, y: 300, vx: (Math.random() - 0.5) * 16, vy: -6 - Math.random() * 10,
        life: -Math.random() * 20, max: 120 + Math.random() * 60, size: 5 + Math.random() * 5, grow: 0,
        kind: 'confetti', color: colors[i % colors.length],
      });
    }
  }

  /** 接触点の衝撃マーク（暗い縁取り付きで明暗どちらでも見える） */
  impact(x: number, y: number): void {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0, max: 18, size: 6, grow: 3, kind: 'ring', color: '#ffffff' });
    this.sparks(x, y, -1, 0, 14, '#ffe066');
  }

  popup(text: string, x: number, y: number, color = '#fff', size = 28): void {
    this.popups.push({ text, x, y, life: 0, max: 50, color, size });
  }

  /** ヒットストップ中も動かし続ける */
  update(): void {
    if (this.shakeT > 0) this.shakeT--;
    if (this.flashT > 0) this.flashT--;
    for (const p of this.particles) {
      p.life++;
      if (p.life < 0) continue;
      p.x += p.vx; p.y += p.vy;
      if (p.kind === 'confetti') { p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.25; continue; }
      p.vx *= 0.92; p.vy *= 0.92;
      p.size += p.grow;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const q of this.popups) { q.life++; q.y -= 0.6; }
    this.popups = this.popups.filter((q) => q.life < q.max);
  }

  /** 世界座標で描く（camX を引く） */
  draw(g: CanvasRenderingContext2D, camX: number): void {
    for (const p of this.particles) {
      if (p.life < 0) continue;
      const t = p.life / p.max;
      const x = p.x - camX, y = p.y;
      switch (p.kind) {
        case 'spark':
          // 暗い縁取りで明るい背景でも見える
          g.strokeStyle = '#000'; g.lineWidth = p.size + 2;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - p.vx * 2, y - p.vy * 2); g.stroke();
          g.strokeStyle = p.color; g.lineWidth = p.size;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - p.vx * 2, y - p.vy * 2); g.stroke();
          break;
        case 'flash':
          g.globalAlpha = 1 - t;
          g.fillStyle = p.color;
          g.beginPath(); g.arc(x, y, p.size, 0, Math.PI * 2); g.fill();
          break;
        case 'ring':
          g.globalAlpha = 1 - t;
          g.strokeStyle = p.color; g.lineWidth = 6 * (1 - t) + 1;
          g.beginPath(); g.arc(x, y, p.size, 0, Math.PI * 2); g.stroke();
          break;
        case 'fire':
          g.globalAlpha = 1 - t * t;
          g.fillStyle = t < 0.3 ? '#fff3b0' : p.color;
          g.beginPath(); g.arc(x, y, p.size * (1 - t * 0.5), 0, Math.PI * 2); g.fill();
          break;
        case 'confetti':
          g.globalAlpha = Math.min(1, (1 - t) * 3);
          g.fillStyle = p.color;
          g.save(); g.translate(x, y); g.rotate(p.life * 0.2 + p.vx);
          g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          g.restore();
          break;
        case 'smoke':
          g.globalAlpha = 0.75 * (1 - t);
          g.fillStyle = p.color;
          g.beginPath(); g.arc(x, y, p.size, 0, Math.PI * 2); g.fill();
          break;
      }
      g.globalAlpha = 1;
    }
  }

  /** 画面座標で描く */
  drawPopups(g: CanvasRenderingContext2D, camX: number): void {
    for (const q of this.popups) {
      const t = q.life / q.max;
      // 出だしで大きく弾んでから落ち着く
      const s = t < 0.15 ? 1 + (0.15 - t) * 5 : 1;
      g.save();
      g.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      g.translate(q.x - camX, q.y);
      g.scale(s, s);
      g.font = `900 ${q.size}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 6; g.strokeStyle = '#000';
      g.strokeText(q.text, 0, 0);
      g.fillStyle = q.color;
      g.fillText(q.text, 0, 0);
      g.restore();
    }
  }
}
