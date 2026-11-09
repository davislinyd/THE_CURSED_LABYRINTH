import type { Sample } from '../engine/Assets';

/** Playback settings per instrument (manifest key `inst/<id>`). */
export interface InstrumentSpec {
  gain: number;
  /** Seconds to fade out after note-off. */
  release: number;
  /** Sustained sound: loop the middle of the sample for long notes. */
  loop?: boolean;
  /** Let the sample ring after note-off (plucked / struck). */
  ring?: number;
}

/** Mix trims on top of the automatic level matching in Instrument.create. */
export const INSTRUMENTS: Record<string, InstrumentSpec> = {
  vln_sus: { gain: 1, release: 0.45, loop: true },
  vla_sus: { gain: 1, release: 0.45, loop: true },
  vc_sus: { gain: 1, release: 0.45, loop: true },
  cb_sus: { gain: 1, release: 0.4, loop: true },
  vln_trem: { gain: 0.9, release: 0.35, loop: true },
  vc_trem: { gain: 0.9, release: 0.35, loop: true },
  vln_spic: { gain: 1, release: 0.08 },
  vc_spic: { gain: 1, release: 0.08 },
  vln_pizz: { gain: 1, release: 0.2, ring: 0.6 },
  vc_pizz: { gain: 1, release: 0.25, ring: 0.8 },
  hn_sus: { gain: 1, release: 0.35, loop: true },
  hn_stac: { gain: 1, release: 0.1 },
  tbn_sus: { gain: 1, release: 0.3, loop: true },
  tuba_sus: { gain: 1, release: 0.3, loop: true },
  fl_sus: { gain: 1, release: 0.3, loop: true },
  harp: { gain: 1, release: 0.5, ring: 2.5 },
  koto: { gain: 1, release: 0.4, ring: 2.0 },
  chimes: { gain: 1, release: 1.5, ring: 5 },
  glass: { gain: 1, release: 1.0, loop: true },
  psaltery: { gain: 1, release: 0.6, loop: true },
};

/** A decoded sample, its attack position and an optional crossfaded loop. */
interface Zone extends Sample {
  buffer: AudioBuffer;
  start: number;
  loopStart: number;
  loopEnd: number;
}

export interface NoteOptions {
  /** Vibrato depth in cents, fading in after the attack. */
  vibrato?: number;
  /** Start this many cents flat and slide up (a shakuhachi-like scoop). */
  scoop?: number;
  /** Fine tuning in cents. */
  detune?: number;
}

/** Seconds of near-silence before the attack (AAC priming, room noise). */
function attackOffset(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  const scan = Math.min(d.length, Math.floor(buf.sampleRate * 0.25));
  let peak = 0;
  for (let i = 0; i < scan; i++) peak = Math.max(peak, Math.abs(d[i]));
  const limit = peak * 0.02;
  for (let i = 0; i < scan; i++) if (Math.abs(d[i]) > limit) return Math.max(0, i / buf.sampleRate - 0.002);
  return 0;
}

/** Blend the end of the loop into its start so the jump back is seamless. */
function crossfadeLoop(buf: AudioBuffer, ls: number, le: number): void {
  const sr = buf.sampleRate;
  const a = Math.floor(ls * sr), b = Math.floor(le * sr);
  const n = Math.min(Math.floor(0.25 * sr), Math.floor((b - a) / 3));
  if (n < 64) return;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      // end of the loop fades into the material just before the loop start
      d[b - n + i] = d[b - n + i] * Math.cos((k * Math.PI) / 2) + d[a - n + i] * Math.sin((k * Math.PI) / 2);
    }
  }
}

/** RMS of the first second after the attack. */
function loudness(z: Zone): number {
  const d = z.buffer.getChannelData(0);
  const a = Math.floor(z.start * z.buffer.sampleRate), n = Math.min(d.length - a, z.buffer.sampleRate);
  let sum = 0;
  for (let i = a; i < a + n; i++) sum += d[i] * d[i];
  return Math.sqrt(sum / Math.max(1, n));
}

export class Instrument {
  private rr = 0;
  constructor(readonly spec: InstrumentSpec, private readonly zones: Zone[], private readonly norm: number) {}

  static create(spec: InstrumentSpec, samples: Sample[], buffers: AudioBuffer[]): Instrument {
    const zones = samples.map((s, i) => {
      const buffer = buffers[i];
      const start = attackOffset(buffer);
      let loopStart = 0, loopEnd = 0;
      if (spec.loop && buffer.duration > 1.2) {
        loopStart = start + (buffer.duration - start) * 0.4;
        loopEnd = buffer.duration * 0.86;
        crossfadeLoop(buffer, loopStart, loopEnd);
      }
      return { ...s, buffer, start, loopStart, loopEnd };
    });
    // recordings differ by up to 30 dB: bring every instrument's loudest layer to a common level
    const top = zones.filter((z) => z.v === 1);
    const rms = top.reduce((sum, z) => sum + loudness(z), 0) / top.length;
    const target = spec.loop ? 0.08 : 0.05;
    return new Instrument(spec, zones, rms > 0 ? target / rms : 1);
  }

  /** Nearest sample in pitch, then in velocity layer; round robins alternate. */
  private pick(midi: number, vel: number): Zone {
    let best = Infinity;
    for (const z of this.zones) best = Math.min(best, Math.abs(z.n - midi) + (z.n < midi ? 0.1 : 0));
    const near = this.zones.filter((z) => Math.abs(z.n - midi) + (z.n < midi ? 0.1 : 0) === best);
    let bv = Infinity;
    for (const z of near) bv = Math.min(bv, Math.abs(z.v - vel));
    const layer = near.filter((z) => Math.abs(z.v - vel) === bv);
    return layer[this.rr++ % layer.length];
  }

  /**
   * Schedule a note. `vel` is 0..1; `dur` is the time until note-off.
   * Returns the source so the caller can stop it early.
   */
  play(ctx: BaseAudioContext, out: AudioNode, midi: number, vel: number, time: number, dur: number, opt: NoteOptions = {}): AudioBufferSourceNode {
    const z = this.pick(midi, vel);
    const src = ctx.createBufferSource();
    src.buffer = z.buffer;
    src.playbackRate.value = Math.pow(2, (midi - z.n) / 12);
    if (z.loopEnd > 0 && dur > z.loopEnd - z.start) {
      src.loop = true;
      src.loopStart = z.loopStart;
      src.loopEnd = z.loopEnd;
    }
    if (opt.detune) src.detune.value = opt.detune;
    if (opt.scoop) {
      src.detune.setValueAtTime(-opt.scoop + (opt.detune ?? 0), time);
      src.detune.linearRampToValueAtTime(opt.detune ?? 0, time + 0.14);
    }
    const g = ctx.createGain();
    const level = this.spec.gain * this.norm * (0.18 + 0.82 * Math.pow(vel, 1.5));
    g.gain.setValueAtTime(level, time);
    const off = time + dur;
    const release = this.spec.ring ?? this.spec.release;
    g.gain.setTargetAtTime(0, off, release / 4);
    src.connect(g).connect(out);
    if (opt.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.2;
      depth.gain.setValueAtTime(0, time);
      depth.gain.linearRampToValueAtTime(opt.vibrato, time + Math.min(0.6, dur * 0.6));
      lfo.connect(depth).connect(src.detune);
      lfo.start(time);
      lfo.stop(off + release * 1.5);
    }
    src.start(time, z.start);
    src.stop(off + release * 1.5);
    return src;
  }
}
