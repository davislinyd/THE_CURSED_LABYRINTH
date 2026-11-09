import type { Instrument } from './Sampler';

/** Recorded effects (manifest `sfx/<name>` or `sfx/<name>_<n>` variants). */
export type SampleSfx =
  | 'cursor' | 'confirm' | 'cancel' | 'pause' | 'locked' | 'text' | 'soul'
  | 'slice' | 'hit' | 'hit_heavy' | 'guard' | 'parry' | 'bone' | 'armor' | 'dodge' | 'draw' | 'sheathe'
  | 'step_stone' | 'step_grass' | 'step_wood' | 'step_dirt'
  | 'door_open' | 'door_close' | 'creak' | 'lever' | 'unlock' | 'coin' | 'pickup' | 'drop' | 'page'
  | 'break_wood' | 'break_heavy' | 'stone' | 'shatter' | 'trap' | 'bell';

/** Effects built from noise, oscillators and the orchestra samples. */
export type SynthSfx = 'swing' | 'swing_heavy' | 'heal' | 'warp' | 'roar' | 'explode' | 'fire';

export type SfxName = SampleSfx | SynthSfx;

export interface SfxOptions {
  vol?: number;
  /** Playback-rate multiplier. */
  pitch?: number;
  pan?: number;
}

export interface SfxKit {
  ctx: AudioContext;
  noise: AudioBuffer;
  instrument(id: string): Instrument | undefined;
  percussion(name: string): AudioBuffer | undefined;
}

function noiseBurst(k: SfxKit, out: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number): void {
  const { ctx } = k;
  const src = ctx.createBufferSource();
  src.buffer = k.noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * (k.noise.duration - dur - 0.05));
  src.stop(t + dur + 0.02);
}

function oneShot(k: SfxKit, out: AudioNode, name: string, t: number, vol: number, rate = 1): void {
  const buf = k.percussion(name);
  if (!buf) return;
  const src = k.ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = k.ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(out);
  src.start(t);
}

function notes(k: SfxKit, out: AudioNode, inst: string, midi: number[], t: number, step: number, vel: number, dur: number): void {
  const i = k.instrument(inst);
  if (!i) return;
  midi.forEach((m, n) => i.play(k.ctx, out, m, vel, t + n * step, dur));
}

export const SYNTH_SFX: Record<SynthSfx, (k: SfxKit, out: AudioNode, t: number) => void> = {
  swing: (k, out, t) => noiseBurst(k, out, t, 0.2, 'bandpass', 520 + Math.random() * 120, 2600, 1.4, 0.9),
  swing_heavy: (k, out, t) => {
    noiseBurst(k, out, t, 0.32, 'bandpass', 320, 1500, 1.1, 1.0);
    noiseBurst(k, out, t + 0.04, 0.26, 'lowpass', 900, 260, 0.7, 0.5);
  },
  heal: (k, out, t) => {
    notes(k, out, 'harp', [62, 66, 69, 74, 78, 81], t, 0.055, 0.6, 0.6);
    notes(k, out, 'glass', [81], t + 0.1, 0, 0.5, 0.7);
  },
  warp: (k, out, t) => {
    notes(k, out, 'chimes', [72, 79, 84], t, 0.09, 0.4, 1.2);
    noiseBurst(k, out, t, 0.9, 'bandpass', 300, 4200, 3, 0.25);
  },
  roar: (k, out, t) => {
    const { ctx } = k;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(96, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 1.1);
    const shape = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 4);
    shape.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    osc.connect(shape).connect(lp).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 1.35);
    noiseBurst(k, out, t, 1.2, 'lowpass', 1200, 200, 0.8, 0.7);
    oneShot(k, out, 'taiko_ff', t, 0.8, 0.8);
  },
  explode: (k, out, t) => {
    oneShot(k, out, 'bdrum_ff', t, 1, 0.9);
    noiseBurst(k, out, t, 0.9, 'lowpass', 3000, 120, 0.6, 1.0);
  },
  fire: (k, out, t) => noiseBurst(k, out, t, 0.6, 'lowpass', 2400, 600, 0.5, 0.6),
};
