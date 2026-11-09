import { Channel, NoteEvent, parseMML } from './MML';
import type { Instrument } from './Sampler';

export interface TrackDef {
  /** Starting instrument; `@name` in the MML switches it. */
  inst: string;
  mml: string;
  vol?: number;
  pan?: number;
  /** Reverb send, 0..1. */
  rev?: number;
}

export interface SongDef {
  /** Quarter notes per minute. */
  tempo: number;
  loop: boolean;
  /** Beats per bar (quarter notes); 4 by default. */
  meter?: number;
  /** Reverb return level, 0..1. */
  reverb?: number;
  /** Drum letters -> percussion sample names. */
  kit?: Record<string, string>;
  tracks: TrackDef[];
}

export interface Song {
  def: SongDef;
  channels: Channel[];
}

export function compileSong(def: SongDef): Song {
  return { def, channels: def.tracks.map((t) => parseMML(t.mml, def.kit, t.inst)) };
}

/** Where the player finds loaded sounds. */
export interface SoundBank {
  instrument(id: string): Instrument | undefined;
  percussion(name: string): AudioBuffer | undefined;
}

/** Stereo hall impulse: decaying, darkening noise with a short pre-delay. */
export function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.round(ctx.sampleRate * seconds);
  const pre = Math.round(ctx.sampleRate * 0.018);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const k = (i - pre) / (len - pre);
      lp += (Math.random() * 2 - 1 - lp) * (0.6 - 0.48 * k);
      d[i] = lp * Math.pow(1 - k, 3) * Math.min(1, (i - pre) / (ctx.sampleRate * 0.01));
    }
  }
  return buf;
}

/** Level fixes for quietly recorded one-shots (dynamics between taiko layers are kept). */
const PERC_TRIM: Record<string, number> = {
  rin: 6, bowl: 2.5, cym_swell: 2.5, cym_scrape: 4, gong_roll: 2, gong_scrape: 1.6, gong_mp: 1.5,
  log_lo: 2, log_hi: 2, frame_hi: 3, timp1: 3, clapper: 1.5, taiko_rim: 1.5,
};

const LOOKAHEAD = 0.2;
const PUMP_MS = 25;

interface Cursor {
  idx: number;
  offset: number;
  done: boolean;
}

interface Playback {
  song: Song;
  dry: GainNode;
  wet: GainNode;
  inputs: GainNode[];
  cursors: Cursor[];
  start: number;
  secPerTick: number;
  voices: Set<AudioScheduledSourceNode>;
  onEnd: (() => void) | null;
}

/**
 * Look-ahead scheduler for multi-track songs on the AudioContext clock.
 * Each song gets its own buses, so a new song can crossfade over the old one.
 */
export class MusicPlayer {
  private current: Playback | null = null;
  private timer = 0;
  private pausedAt = -1;
  private readonly mix: GainNode;
  private readonly verb: ConvolverNode;

  constructor(private readonly ctx: AudioContext, out: AudioNode, private readonly bank: SoundBank) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    comp.connect(limiter).connect(out);
    this.mix = ctx.createGain();
    this.mix.connect(comp);
    this.verb = ctx.createConvolver();
    this.verb.buffer = impulse(ctx, 3.4);
    this.verb.connect(comp);
  }

  get song(): Song | null {
    return this.current?.song ?? null;
  }

  play(song: Song, onEnd?: () => void, fadeOut = 0.8): void {
    this.stop(fadeOut);
    const ctx = this.ctx, def = song.def;
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    wet.gain.value = def.reverb ?? 0.3;
    dry.connect(this.mix);
    wet.connect(this.verb);
    const inputs = def.tracks.map((t) => {
      const g = ctx.createGain();
      g.gain.value = t.vol ?? 0.7;
      const pan = ctx.createStereoPanner();
      pan.pan.value = t.pan ?? 0;
      const send = ctx.createGain();
      send.gain.value = t.rev ?? 0.5;
      g.connect(pan);
      pan.connect(dry);
      pan.connect(send).connect(wet);
      return g;
    });
    this.current = {
      song,
      dry,
      wet,
      inputs,
      cursors: song.channels.map(() => ({ idx: 0, offset: 0, done: false })),
      start: ctx.currentTime + 0.08,
      secPerTick: 60 / (def.tempo * 24),
      voices: new Set(),
      onEnd: onEnd ?? null,
    };
    this.pausedAt = -1;
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.pump(), PUMP_MS);
    this.pump();
  }

  /** Fade the current song out; its scheduled notes are cut after the fade. */
  stop(fade = 0.5): void {
    const p = this.current;
    window.clearInterval(this.timer);
    this.timer = 0;
    this.current = null;
    this.pausedAt = -1;
    if (p) this.release(p, fade);
  }

  private release(p: Playback, fade: number): void {
    const t = this.ctx.currentTime;
    for (const g of [p.dry, p.wet]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + Math.max(0.02, fade));
    }
    for (const v of p.voices) v.stop(t + fade + 0.02);
    window.setTimeout(() => {
      p.dry.disconnect();
      p.wet.disconnect();
    }, (fade + 4) * 1000);
  }

  pause(): void {
    const p = this.current;
    if (!p || this.pausedAt >= 0) return;
    window.clearInterval(this.timer);
    this.timer = 0;
    const t = this.ctx.currentTime;
    this.pausedAt = t;
    p.dry.gain.setTargetAtTime(0, t, 0.01);
    for (const v of p.voices) v.stop(t + 0.06);
    p.voices.clear();
    // rewind each cursor to the first note that had not started yet
    const nowTick = (t - p.start) / p.secPerTick;
    p.song.channels.forEach((ch, i) => {
      const c = p.cursors[i];
      while (c.idx > 0 && ch.events[c.idx - 1].tick + c.offset >= nowTick) c.idx--;
    });
  }

  resume(): void {
    const p = this.current;
    if (!p || this.pausedAt < 0) return;
    const t = this.ctx.currentTime;
    p.start += t - this.pausedAt + 0.08;
    p.dry.gain.cancelScheduledValues(t);
    p.dry.gain.setValueAtTime(1, t + 0.07);
    this.pausedAt = -1;
    this.timer = window.setInterval(() => this.pump(), PUMP_MS);
    this.pump();
  }

  private pump(): void {
    const p = this.current;
    if (!p) return;
    const { song } = p;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    let allDone = true;
    song.channels.forEach((ch, ci) => {
      const cur = p.cursors[ci];
      if (!ch.events.length) cur.done = true;
      for (let guard = 0; guard < 512 && !cur.done; guard++) {
        if (cur.idx >= ch.events.length) {
          if (!song.def.loop) {
            cur.done = true;
            break;
          }
          cur.offset += ch.length - ch.loopTick;
          cur.idx = Math.max(0, ch.events.findIndex((e) => e.tick >= ch.loopTick));
        }
        const ev = ch.events[cur.idx];
        const t = p.start + (ev.tick + cur.offset) * p.secPerTick;
        if (t > horizon) break;
        if (t > this.ctx.currentTime - 0.01) this.emit(p, ci, ev, t);
        cur.idx++;
      }
      if (!cur.done) allDone = false;
    });
    if (!song.def.loop && allDone) {
      const end = p.start + Math.max(...song.channels.map((c) => c.length)) * p.secPerTick;
      if (this.ctx.currentTime >= end) {
        window.clearInterval(this.timer);
        this.timer = 0;
        this.current = null;
        window.setTimeout(() => {
          p.dry.disconnect();
          p.wet.disconnect();
        }, 5000);
        p.onEnd?.();
      }
    }
  }

  private emit(p: Playback, ci: number, ev: NoteEvent, t: number): void {
    for (const src of scheduleEvent(this.ctx, p.inputs[ci], this.bank, p.song.def.tracks[ci].inst, ev, t, p.secPerTick)) {
      p.voices.add(src);
      src.onended = () => p.voices.delete(src);
    }
  }
}

/** Schedule one score event; also used to render songs offline for level checks. */
export function scheduleEvent(ctx: BaseAudioContext, out: AudioNode, bank: SoundBank, trackInst: string, ev: NoteEvent, t: number, secPerTick: number): AudioScheduledSourceNode[] {
  if (ev.drum) {
    const buf = bank.percussion(ev.drum);
    if (!buf) return [];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = Math.pow(ev.vel / 15, 1.4) * (PERC_TRIM[ev.drum] ?? 1);
    src.connect(g).connect(out);
    src.start(t);
    return [src];
  }
  const inst = bank.instrument(ev.inst || trackInst);
  if (!inst || ev.vel <= 0) return [];
  const dur = ev.gate * secPerTick;
  return ev.notes.map((midi) => inst.play(ctx, out, midi, ev.vel / 15, t, dur, { vibrato: ev.vib, scoop: ev.scoop }));
}
