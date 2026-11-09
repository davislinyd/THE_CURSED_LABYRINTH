/**
 * 2A03-flavoured voices built on Web Audio: two pulse channels with the four
 * hardware duty cycles, the 32-step quantised triangle, and LFSR noise with the
 * 16 hardware periods in long (hiss) and short (metallic) modes.
 */
const HARMONICS = 48;
const NOISE_PERIODS = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
const CPU_HZ = 1789773;

export type Voice = 'pulse' | 'tri' | 'noise';

export interface Tone {
  time: number;
  dur: number;
  freq: number;
  vol: number; // 0..15
  duty?: number;
  decay?: number; // frames per volume step
  vib?: number; // cents
  /** Optional stepped pitch sweep target (reached at end of note). */
  sweepTo?: number;
  /** Music voices: decay stops at this floor (0..15) and the note fades over `release` s. */
  sustain?: number;
  release?: number;
  /** Cents of a detuned twin oscillator for a thicker voice (0 = single). */
  chorus?: number;
}

export interface NoiseHit {
  time: number;
  dur: number;
  period: number; // 0..15
  short?: boolean;
  vol: number;
  decay?: number;
  /** Optional per-frame period walk (e.g. +1 for a falling "whoosh"). */
  periodStep?: number;
}

function waveFromSamples(ctx: BaseAudioContext, samples: number[]): PeriodicWave {
  const n = samples.length;
  const real = new Float32Array(HARMONICS + 1);
  const imag = new Float32Array(HARMONICS + 1);
  for (let k = 1; k <= HARMONICS; k++) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const ph = (2 * Math.PI * k * i) / n;
      re += samples[i] * Math.cos(ph);
      im += samples[i] * Math.sin(ph);
    }
    real[k] = (2 * re) / n;
    imag[k] = (2 * im) / n;
  }
  return ctx.createPeriodicWave(real, imag);
}

export class ChiptuneSynth {
  readonly pulse: PeriodicWave[];
  readonly tri: PeriodicWave;
  private noiseCache = new Map<string, AudioBuffer>();
  /** Live nodes per owner tag, so music can be cut on pause/stop. */
  private live = new Map<string, Set<AudioScheduledSourceNode>>();

  constructor(readonly ctx: AudioContext) {
    this.pulse = [0.125, 0.25, 0.5, 0.75].map((d) => {
      const smp: number[] = [];
      for (let i = 0; i < 64; i++) smp.push(i / 64 < d ? 1 : -1);
      return waveFromSamples(ctx, smp);
    });
    const tri: number[] = [];
    for (let i = 0; i < 32; i++) {
      const step = i < 16 ? 15 - i : i - 16;
      tri.push(step / 7.5 - 1);
    }
    this.tri = waveFromSamples(ctx, tri);
  }

  private track(tag: string, node: AudioScheduledSourceNode): void {
    let set = this.live.get(tag);
    if (!set) this.live.set(tag, (set = new Set()));
    set.add(node);
    node.onended = () => set!.delete(node);
  }

  cut(tag: string): void {
    const set = this.live.get(tag);
    if (!set) return;
    for (const n of set) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    set.clear();
  }

  private envelope(g: GainNode, t: number, dur: number, vol: number, decay: number, scale: number, sustain = 0, release = 0): void {
    const p = g.gain;
    if (release > 0) {
      // Smooth music envelope: fast attack, linear decay to the sustain floor, soft release.
      const peak = (vol / 15) * scale, floor = (Math.min(sustain, vol) / 15) * scale;
      p.setValueAtTime(0, t);
      p.linearRampToValueAtTime(peak, t + 0.004);
      let end = peak;
      if (decay > 0 && floor < peak) {
        const tEnd = t + ((vol - Math.min(sustain, vol)) * decay) / 60;
        if (tEnd <= t + dur) {
          p.linearRampToValueAtTime(floor, tEnd);
          end = floor;
        } else {
          end = peak + (floor - peak) * (dur / (tEnd - t));
          p.linearRampToValueAtTime(end, t + dur);
        }
      }
      p.setValueAtTime(end, t + dur);
      p.linearRampToValueAtTime(0, t + dur + release);
      return;
    }
    p.setValueAtTime((vol / 15) * scale, t);
    if (decay > 0) {
      const step = decay / 60;
      for (let v = vol - 1, tt = t + step; v >= 0 && tt < t + dur; v--, tt += step) p.setValueAtTime((v / 15) * scale, tt);
    }
    p.setValueAtTime(0, t + dur);
  }

  tone(voice: 'pulse' | 'tri', tone: Tone, out: AudioNode, scale: number, tag: string): void {
    const { ctx } = this;
    const release = tone.release ?? 0;
    const end = tone.time + tone.dur + release + 0.02;
    const twin = voice === 'pulse' && tone.chorus ? tone.chorus : 0;
    const oscs = (twin ? [-twin / 2, twin / 2] : [0]).map((cents) => {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(voice === 'tri' ? this.tri : this.pulse[tone.duty ?? 2]);
      osc.detune.value = cents;
      const f = osc.frequency;
      f.setValueAtTime(tone.freq, tone.time);
      if (tone.sweepTo !== undefined) {
        // Stepped once per frame, like a hardware sweep unit.
        const frames = Math.max(1, Math.round(tone.dur * 60));
        for (let i = 1; i < frames; i++) {
          f.setValueAtTime(tone.freq + ((tone.sweepTo - tone.freq) * i) / frames, tone.time + i / 60);
        }
      }
      return osc;
    });
    const g = ctx.createGain();
    g.gain.value = 0;
    const vol = voice === 'tri' ? 15 : tone.vol;
    this.envelope(g, tone.time, tone.dur, vol, voice === 'tri' ? 0 : tone.decay ?? 0, twin ? scale * 0.62 : scale, tone.sustain ?? 0, release);
    g.connect(out);
    if (tone.vib && tone.dur > 0.2) {
      // Delayed vibrato that fades in, like a held flute or voice.
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 5.5;
      const on = tone.time + Math.min(0.14, tone.dur * 0.3);
      lg.gain.setValueAtTime(0, tone.time);
      lg.gain.setValueAtTime(0, on);
      lg.gain.linearRampToValueAtTime(tone.vib, on + 0.18);
      lfo.connect(lg);
      for (const o of oscs) lg.connect(o.detune);
      lfo.start(tone.time);
      lfo.stop(end);
      this.track(tag, lfo);
    }
    for (const o of oscs) {
      o.connect(g);
      o.start(tone.time);
      o.stop(end);
      this.track(tag, o);
    }
  }

  /** A pitched body that drops in frequency: kick, taiko and snare shells. */
  private thump(time: number, f0: number, f1: number, dur: number, peak: number, out: AudioNode, tag: string, wave: 'sine' | 'tri' = 'sine'): void {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    if (wave === 'tri') osc.setPeriodicWave(this.tri);
    osc.frequency.setValueAtTime(f0, time);
    osc.frequency.exponentialRampToValueAtTime(f1, time + dur * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g).connect(out);
    osc.start(time);
    osc.stop(time + dur + 0.02);
    this.track(tag, osc);
  }

  /** A burst of LFSR noise with an exponential tail. */
  private hiss(time: number, period: number, short: boolean, dur: number, peak: number, out: AudioNode, tag: string): void {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(period, short);
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(g).connect(out);
    src.start(time, Math.random() * 0.5);
    src.stop(time + dur + 0.02);
    this.track(tag, src);
  }

  /** Music drum kit: FC noise on top, with a pitched body underneath for weight. */
  drum(kind: string, time: number, vol: number, out: AudioNode, scale: number, tag: string): void {
    const a = (vol / 15) * scale;
    switch (kind) {
      case 'k':
        this.thump(time, 160, 46, 0.2, a * 1.6, out, tag);
        this.hiss(time, 11, false, 0.03, a * 0.35, out, tag);
        break;
      case 's':
        this.thump(time, 240, 140, 0.09, a * 0.7, out, tag, 'tri');
        this.hiss(time, 5, false, 0.16, a * 0.75, out, tag);
        break;
      case 'h':
        this.hiss(time, 0, false, 0.04, a * 0.32, out, tag);
        break;
      case 'p':
        this.hiss(time, 0, false, 0.2, a * 0.3, out, tag);
        break;
      case 'x':
        this.hiss(time, 2, false, 1.1, a * 0.5, out, tag);
        this.hiss(time, 0, true, 0.5, a * 0.12, out, tag);
        break;
      case 'w':
        this.thump(time, 1250, 1000, 0.05, a * 0.55, out, tag, 'tri');
        break;
      case 't':
        this.thump(time, 110, 52, 0.45, a * 1.8, out, tag);
        this.hiss(time, 12, false, 0.08, a * 0.3, out, tag);
        break;
      case 'u':
        this.thump(time, 420, 300, 0.09, a * 0.6, out, tag, 'tri');
        this.hiss(time, 3, true, 0.04, a * 0.25, out, tag);
        break;
    }
  }

  private noiseBuffer(period: number, short: boolean): AudioBuffer {
    const key = `${period}:${short}`;
    const hit = this.noiseCache.get(key);
    if (hit) return hit;
    const rate = this.ctx.sampleRate;
    const len = rate; // one second loop
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    const clock = CPU_HZ / NOISE_PERIODS[period];
    let lfsr = 1;
    let acc = 0;
    const tap = short ? 6 : 1;
    for (let i = 0; i < len; i++) {
      acc += clock / rate;
      while (acc >= 1) {
        const fb = (lfsr & 1) ^ ((lfsr >> tap) & 1);
        lfsr = (lfsr >> 1) | (fb << 14);
        acc -= 1;
      }
      d[i] = lfsr & 1 ? -1 : 1;
    }
    this.noiseCache.set(key, buf);
    return buf;
  }

  noise(hit: NoiseHit, out: AudioNode, scale: number, tag: string): void {
    const { ctx } = this;
    const g = ctx.createGain();
    g.gain.value = 0;
    this.envelope(g, hit.time, hit.dur, hit.vol, hit.decay ?? 0, scale);
    if (hit.periodStep) {
      // Re-trigger per frame at a walking period for sweeps (explosions, wind).
      const frames = Math.max(1, Math.round(hit.dur * 60));
      for (let i = 0; i < frames; i++) {
        const p = Math.max(0, Math.min(15, Math.round(hit.period + hit.periodStep * i)));
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer(p, !!hit.short);
        src.loop = true;
        src.connect(g);
        const t = hit.time + i / 60;
        src.start(t, Math.random() * 0.5);
        src.stop(t + 1 / 60 + 0.002);
        this.track(tag, src);
      }
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(hit.period, !!hit.short);
      src.loop = true;
      src.connect(g);
      src.start(hit.time, Math.random() * 0.5);
      src.stop(hit.time + hit.dur + 0.02);
      this.track(tag, src);
    }
    g.connect(out);
  }
}
