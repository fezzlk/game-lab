import type { Sfx } from './audio';
import type { Chart } from './song/chart';
import { pathBounds } from './song/chart';
import type { DrumStyle } from './song/songs';

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'Am' → { root: 9, minor: true } */
export function parseChord(name: string): { root: number; minor: boolean } {
  let root = NOTE[name[0]];
  let i = 1;
  if (name[i] === '#') { root++; i++; } else if (name[i] === 'b') { root--; i++; }
  return { root: (root + 12) % 12, minor: name.slice(i).startsWith('m') };
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * 曲の再生。WebAudio の時刻で先読み予約する（画面のフレームとは独立に正確な拍で鳴る）。
 * リードは譜面の押し始めで鳴り、音の高さは理想の軌道の高さに合わせてコードの音に寄せる。
 */
export class Music {
  private timer: number | null = null;
  private bus: GainNode | null = null;
  private nextStep = 0;
  private leadAt = new Map<number, { len: number; y: number }>();
  private stepSec = 0;
  private startAt = 0;
  private chart: Chart | null = null;

  constructor(private sfx: Sfx) {}

  /** startAt：曲の頭（拍0）の AudioContext 時刻。その1小節前にカウントインを鳴らす */
  start(chart: Chart, startAt: number): void {
    this.stop();
    const ctx = this.sfx.ctx;
    if (!ctx) return;
    this.chart = chart;
    this.startAt = startAt;
    this.stepSec = 60 / chart.song.bpm / 4;
    this.nextStep = 0;
    this.leadAt.clear();
    for (const n of chart.notes) {
      this.leadAt.set(n.step, { len: Math.max(1, Math.round((n.off - n.on) / chart.framesPerStep)), y: chart.pathY[n.on] });
    }
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.sfx.master);
    // カウントイン（4拍）
    for (let k = 0; k < 4; k++) this.click(startAt - (4 - k) * this.stepSec * 4, k === 0);
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const ctx = this.sfx.ctx;
    if (this.bus && ctx) {
      const bus = this.bus;
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      setTimeout(() => bus.disconnect(), 400);
    }
    this.bus = null;
  }

  private schedule(): void {
    const ctx = this.sfx.ctx, chart = this.chart;
    if (!ctx || !chart || !this.bus) return;
    const total = chart.totalBars * 16;
    const horizon = ctx.currentTime + 0.15;
    while (this.nextStep < total) {
      const t = this.startAt + this.nextStep * this.stepSec;
      if (t > horizon) break;
      if (t >= ctx.currentTime - 0.02) this.playStep(this.nextStep, t);
      this.nextStep++;
    }
    if (this.nextStep >= total && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private playStep(step: number, t: number): void {
    const chart = this.chart!;
    const bar = Math.floor(step / 16), s = step % 16;
    let sec = chart.sections[0];
    for (const x of chart.sections) if (x.startBar <= bar) sec = x;
    const chordName = sec.def.chords[(bar - sec.startBar) % sec.def.chords.length];
    const chord = parseChord(chordName);
    const root = chord.root + chart.song.transpose;
    this.drums(sec.def.drums, s, t);
    // ベース：8分
    if (s % 2 === 0) {
      const oct = sec.def.drums === 'drive' && s % 4 === 2 ? 12 : 0;
      this.note(midiHz(36 + root + oct), t, this.stepSec * 1.8, 'sawtooth', 0.09, 600);
    }
    // コード：小節の頭で伸ばす
    if (s === 0) {
      for (const iv of [0, chord.minor ? 3 : 4, 7]) this.note(midiHz(60 + root + iv), t, this.stepSec * 15, 'triangle', 0.025, 2000);
    }
    // リード：押す拍で鳴る
    const lead = this.leadAt.get(step);
    if (lead) {
      const tones: number[] = [];
      for (let m = 64; m <= 88; m++) {
        const pc = ((m - root) % 12 + 12) % 12;
        if (pc === 0 || pc === (chord.minor ? 3 : 4) || pc === 7) tones.push(m);
      }
      const [lo, hi] = pathBounds(chart.song.halfGap);
      const r = 1 - Math.max(0, Math.min(1, (lead.y - lo) / (hi - lo)));
      const m = tones[Math.round(r * (tones.length - 1))];
      this.note(midiHz(m), t, Math.min(0.45, lead.len * this.stepSec * 0.95), 'square', 0.07, 3500);
    }
  }

  private drums(style: DrumStyle, s: number, t: number): void {
    if (style === 'sparse') {
      if (s === 0) this.kick(t);
      if (s % 4 === 0) this.hat(t, 0.04);
      return;
    }
    if (style === 'beat') {
      if (s === 0 || s === 8 || s === 10) this.kick(t);
      if (s === 4 || s === 12) this.snare(t);
      if (s % 2 === 0) this.hat(t, s % 4 === 0 ? 0.06 : 0.035);
      return;
    }
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    this.hat(t, s % 2 === 0 ? 0.06 : 0.03, s === 14 ? 0.12 : 0.03);
  }

  private click(t: number, accent: boolean): void {
    this.note(accent ? 1760 : 1320, t, 0.05, 'square', 0.08, 8000);
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, vol: number, lp: number): void {
    const ctx = this.sfx.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.bus!);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private kick(t: number): void {
    const ctx = this.sfx.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.bus!);
    o.start(t); o.stop(t + 0.2);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, vol: number, dur: number): void {
    const ctx = this.sfx.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.sfx.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.bus!);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  private snare(t: number): void {
    this.noiseHit(t, 'bandpass', 1800, 0.25, 0.14);
    this.note(190, t, 0.08, 'triangle', 0.12, 2000);
  }

  private hat(t: number, vol: number, dur = 0.03): void {
    this.noiseHit(t, 'highpass', 7000, vol, dur);
  }
}
