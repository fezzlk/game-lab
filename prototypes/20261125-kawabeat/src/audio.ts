import { P } from './params';
import { suitOf, numOf } from './tiles';

/**
 * 音はすべて WebAudio の合成（素材ファイルなし）。
 * 萬＝ドラム、筒＝ベース、索＝メロディ。面子が増えるほど（levels）その色の音が厚くなる。
 */
export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  noise!: AudioBuffer;
  muted = localStorage.getItem('kawabeat.muted') === '1';

  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : P.volume;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    localStorage.setItem('kawabeat.muted', this.muted ? '1' : '0');
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : P.volume, this.ctx.currentTime, 0.02);
  }

  /** 拍の刻み（河が空でもテンポが分かるように）。ループの頭は低く */
  tick(slot: number, countIn: boolean): void {
    if (!this.ctx) return;
    if (slot === 0) { this.tone(countIn ? 1320 : 180, 0, 0.08, countIn ? 'square' : 'sine', 0.12); }
    else this.noiseHit(8000, 0.03, 0.05, 'highpass');
  }

  /** 河の牌を鳴らす */
  slot(tile: number, levels: [number, number, number]): void {
    if (!this.ctx) return;
    const s = suitOf(tile), n = numOf(tile);
    const lv = levels[s];
    const gain = 0.5 + P.layerGain * lv;
    const voices = 1 + Math.floor(lv);
    const pent = [0, 2, 4, 7, 9];
    const semi = pent[(n - 1) % 5] + 12 * Math.floor((n - 1) / 5);
    if (s === 0) {
      // ドラム：1-3 キック、4-6 スネア、7-9 ハット/タム
      if (n <= 3) this.kick(110 - n * 12, 0.5 * gain);
      else if (n <= 6) this.noiseHit(1800 + n * 200, 0.18, 0.4 * gain, 'bandpass');
      else this.noiseHit(7000 + n * 100, 0.07, 0.3 * gain, 'highpass');
      if (voices >= 2) this.kick(70, 0.25 * gain);
      if (voices >= 3) this.noiseHit(3000, 0.12, 0.2 * gain, 'bandpass');
      return;
    }
    const base = s === 1 ? 55 : 440;
    const f = base * Math.pow(2, semi / 12);
    const type: OscillatorType = s === 1 ? 'sawtooth' : 'square';
    const dur = s === 1 ? 0.28 : 0.2;
    const vol = (s === 1 ? 0.16 : 0.09) * gain;
    this.tone(f, 0, dur, type, vol);
    if (voices >= 2) this.tone(f * 2, 0, dur, 'triangle', vol * 0.8);
    if (voices >= 3) this.tone(f * 1.5, 0, dur, 'triangle', vol * 0.6);
    if (voices >= 4) this.tone(f * 1.25, 0, dur * 1.3, 'sine', vol * 0.6);
    if (voices >= 5) this.tone(f * 4, 0, dur * 1.3, 'sine', vol * 0.5);
  }

  /** 牌を切った手応え（ジャストは高く） */
  click(just: boolean): void {
    if (!this.ctx) return;
    this.noiseHit(just ? 5000 : 2500, 0.04, 0.25, 'bandpass');
    this.tone(just ? 1568 : 988, 0, 0.06, 'triangle', 0.1);
  }

  miss(): void {
    if (!this.ctx) return;
    this.tone(150, 0, 0.18, 'triangle', 0.18);
  }

  ron(): void {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.noiseHit(500, 0.7, 0.9, 'lowpass');
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.5);
  }

  /** あがりのフルコーラス：han が大きいほど長く派手 */
  win(han: number): void {
    if (!this.ctx) return;
    const notes = [0, 4, 7, 12, 16, 19, 24, 28];
    const count = Math.min(notes.length, 3 + han);
    for (let i = 0; i < count; i++) {
      this.tone(523 * Math.pow(2, notes[i] / 12), i * 0.07, 0.3, 'square', 0.1);
      this.tone(261 * Math.pow(2, notes[i] / 12), i * 0.07, 0.4, 'triangle', 0.08);
    }
    this.kick(100, 0.6);
  }

  start(): void {
    if (!this.ctx) return;
    this.tone(660, 0, 0.06, 'square', 0.08);
    this.tone(990, 0.05, 0.1, 'square', 0.08);
  }

  private kick(f: number, vol: number): void {
    const ctx = this.ctx!, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 2, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f * 0.4), t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.25);
  }

  private noiseHit(freq: number, dur: number, vol: number, type: BiquadFilterType): void {
    const ctx = this.ctx!, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
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
