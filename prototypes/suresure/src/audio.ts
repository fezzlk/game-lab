/**
 * 効果音は WebAudio で合成（素材ファイルなし）。
 * 優先度：ミス(爆発) ＞ 被弾 ＞ 倍率アップ ＞ コンボ切れ（#032 重要度で効果音バランスを取る）。BGM は music.ts
 */
export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  noise!: AudioBuffer;
  muted = localStorage.getItem('suresure.muted') === '1';

  /** ユーザー操作の中で呼ぶ（自動再生制限のため） */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  /** 音が実際に聞こえるまでの遅れ（秒） */
  latency(): number {
    const c = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    return c ? (c.outputLatency ?? 0) + (c.baseLatency ?? 0) : 0;
  }

  /** 被弾（ミスより軽い） */
  hit(): void {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.3);
    this.tone(220, 0, 0.15, 'square', 0.15);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    localStorage.setItem('suresure.muted', this.muted ? '1' : '0');
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  levelUp(level: number): void {
    if (!this.ctx) return;
    const base = 440 * Math.pow(2, (level - 1) / 12 * 2);
    [0, 4, 7, 12].forEach((semi, i) => this.tone(base * Math.pow(2, semi / 12), i * 0.045, 0.12, 'square', 0.12));
  }

  /** コンボ切れ */
  levelDown(): void {
    if (!this.ctx) return;
    this.tone(330, 0, 0.12, 'triangle', 0.12);
    this.tone(220, 0.08, 0.16, 'triangle', 0.12);
  }

  /** アタック強め・残響ほどほど（#165） */
  crash(): void {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6000, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.8);
    // 低音のドン
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.35);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.8, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(og).connect(this.master);
    o.start(t); o.stop(t + 0.45);
  }

  start(): void {
    if (!this.ctx) return;
    this.tone(660, 0, 0.06, 'square', 0.08);
    this.tone(990, 0.05, 0.1, 'square', 0.08);
  }

  private tone(freq: number, delay: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
}
