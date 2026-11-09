import { ChiptuneSynth } from './ChiptuneSynth';
import { Channel, NoteEvent, midiToFreq, parseMML } from './MML';

export interface SongSource {
  tempo: number;
  loop: boolean;
  sq1: string;
  sq2: string;
  tri: string;
  noise: string;
  /** Reverb send level (0..1). */
  reverb?: number;
  /** A delayed, quieter copy of the lead (sq1), panned to the other side. */
  echo?: { delay: number; vol: number };
}

export interface Song {
  tempo: number;
  loop: boolean;
  channels: Channel[]; // sq1, sq2, tri, noise
  reverb: number;
  echo: { delay: number; vol: number } | null;
}

export function compileSong(src: SongSource): Song {
  return {
    tempo: src.tempo,
    loop: src.loop,
    channels: [src.sq1, src.sq2, src.tri, src.noise].map(parseMML),
    reverb: src.reverb ?? 0.2,
    echo: src.echo ?? null,
  };
}

const LOOKAHEAD = 0.15;
const TICK_MS = 25;
// sq1, sq2, tri, noise (+ echo for PAN / RELEASE)
const SCALE = [0.16, 0.12, 0.2, 0.28];
const PAN = [-0.22, 0.28, 0, 0.08, 0.45];
const RELEASE = [0.07, 0.09, 0.03, 0, 0.09];
const TAG = 'bgm';

/** Stereo impulse response: decaying noise with a soft high-frequency roll-off. */
function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.round(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.4 * k);
      d[i] = lp * Math.pow(1 - k, 2.6) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
    }
  }
  return buf;
}

interface Cursor {
  idx: number;
  offset: number; // ticks added by completed loops
  done: boolean;
}

/**
 * Look-ahead scheduler: note times come from the AudioContext clock, so tempo
 * is immune to frame-rate changes. Loops are sample-accurate because every
 * repeat is scheduled on the same tick grid.
 */
export class MusicSequencer {
  private song: Song | null = null;
  private start = 0;
  private cursors: Cursor[] = [];
  private timer = 0;
  private pausedAt = -1;
  private onEnd: (() => void) | null = null;
  private secPerTick = 0;
  private readonly buses: GainNode[];
  private readonly wet: GainNode;

  constructor(private readonly synth: ChiptuneSynth, out: AudioNode) {
    // voices -> pan -> lowpass -> limiter -> out, plus a reverb send from the limiter input
    const ctx = synth.ctx;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(out);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7800;
    lp.Q.value = 0.5;
    lp.connect(limiter);
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 2.4);
    this.wet = ctx.createGain();
    lp.connect(verb).connect(this.wet).connect(limiter);
    this.buses = PAN.map((pan) => {
      const g = ctx.createGain();
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(lp);
      return g;
    });
  }

  get playing(): Song | null {
    return this.song;
  }

  play(song: Song, onEnd?: () => void): void {
    this.stop();
    this.song = song;
    this.onEnd = onEnd ?? null;
    this.secPerTick = 60 / (song.tempo * 24);
    this.start = this.synth.ctx.currentTime + 0.06;
    this.wet.gain.setValueAtTime(song.reverb, this.synth.ctx.currentTime);
    this.cursors = song.channels.map(() => ({ idx: 0, offset: 0, done: false }));
    this.pausedAt = -1;
    this.timer = window.setInterval(() => this.pump(), TICK_MS);
    this.pump();
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.synth.cut(TAG);
    this.song = null;
    this.onEnd = null;
  }

  pause(): void {
    if (!this.song || this.pausedAt >= 0) return;
    window.clearInterval(this.timer);
    this.timer = 0;
    this.pausedAt = this.synth.ctx.currentTime;
    this.synth.cut(TAG);
    // Rewind each cursor to the first note that had not started yet.
    const nowTick = (this.pausedAt - this.start) / this.secPerTick;
    this.song.channels.forEach((ch, i) => {
      const c = this.cursors[i];
      while (c.idx > 0) {
        const prev = ch.events[c.idx - 1];
        if (prev.tick + c.offset >= nowTick) c.idx--;
        else break;
      }
    });
  }

  resume(): void {
    if (!this.song || this.pausedAt < 0) return;
    this.start += this.synth.ctx.currentTime - this.pausedAt + 0.05;
    this.pausedAt = -1;
    this.timer = window.setInterval(() => this.pump(), TICK_MS);
    this.pump();
  }

  private pump(): void {
    const song = this.song;
    if (!song) return;
    const horizon = this.synth.ctx.currentTime + LOOKAHEAD;
    let allDone = true;
    song.channels.forEach((ch, ci) => {
      const cur = this.cursors[ci];
      if (cur.done || ch.events.length === 0) {
        if (!song.loop && ch.events.length === 0) cur.done = true;
        if (!cur.done) allDone = false;
        return;
      }
      for (let guard = 0; guard < 256; guard++) {
        if (cur.idx >= ch.events.length) {
          if (song.loop) {
            cur.offset += ch.length - ch.loopTick;
            cur.idx = ch.events.findIndex((e) => e.tick >= ch.loopTick);
            if (cur.idx < 0) cur.idx = 0;
          } else {
            cur.done = true;
            break;
          }
        }
        const ev = ch.events[cur.idx];
        const t = this.start + (ev.tick + cur.offset) * this.secPerTick;
        if (t > horizon) break;
        this.emit(ci, ev, t);
        cur.idx++;
      }
      if (!cur.done) allDone = false;
    });
    if (!song.loop && allDone) {
      const endT = this.start + Math.max(...song.channels.map((c) => c.length)) * this.secPerTick;
      if (this.synth.ctx.currentTime >= endT) {
        const cb = this.onEnd;
        window.clearInterval(this.timer);
        this.timer = 0;
        this.song = null;
        this.onEnd = null;
        cb?.();
      }
    }
  }

  private emit(ci: number, ev: NoteEvent, t: number): void {
    const dur = ev.gate * this.secPerTick;
    if (ci === 3) {
      if (ev.drum) this.synth.drum(ev.drum, t, ev.vol, this.buses[3], SCALE[3], TAG);
      return;
    }
    if (ev.midi < 0 || ev.vol <= 0) return;
    const tone = {
      time: t,
      dur,
      freq: midiToFreq(ev.midi),
      vol: ev.vol,
      duty: ev.duty,
      decay: ev.decay,
      sustain: ev.sustain,
      vib: ev.vib,
      chorus: ev.chorus,
      release: RELEASE[ci],
    };
    this.synth.tone(ci === 2 ? 'tri' : 'pulse', tone, this.buses[ci], SCALE[ci], TAG);
    const echo = this.song?.echo;
    if (ci === 0 && echo) {
      this.synth.tone('pulse', { ...tone, time: t + echo.delay * this.secPerTick, vol: ev.vol * echo.vol, chorus: 0, release: RELEASE[4] }, this.buses[4], SCALE[0], TAG);
    }
  }
}
