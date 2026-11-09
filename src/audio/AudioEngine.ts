import type { Assets } from '../engine/Assets';
import { MusicPlayer, Song, compileSong, impulse } from './MusicPlayer';
import { SONGS, SongName } from './MusicData';
import { INSTRUMENTS, Instrument } from './Sampler';
import { SYNTH_SFX, SfxName, SfxOptions, SynthSfx } from './Sfx';

/** Like the PS2 sound chip, everything runs at a modest rate; it also halves sample memory. */
const SAMPLE_RATE = 32000;

/**
 * Sample banks, music and effects. Samples are decoded while the loading
 * screen runs; the AudioContext itself starts on the first user gesture,
 * per browser autoplay rules.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private player: MusicPlayer | null = null;
  private master!: GainNode;
  private bgm!: GainNode;
  private sfx!: GainNode;
  private space!: GainNode;
  private noise!: AudioBuffer;
  private readonly instruments = new Map<string, Instrument>();
  private readonly perc = new Map<string, AudioBuffer>();
  private readonly effects = new Map<string, AudioBuffer[]>();
  private readonly songs = new Map<SongName, Song>();
  private current: SongName | null = null;
  private wanted: { name: SongName; onEnd?: () => void } | null = null;
  bgmVolume = 7;
  sfxVolume = 8;
  muted = false;

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Decode every instrument, drum and effect sample listed in the manifest. */
  async load(assets: Assets, onProgress: (done: number, total: number) => void): Promise<void> {
    const decoder = new OfflineAudioContext(1, 1, SAMPLE_RATE);
    const entries = Object.entries(assets.manifest.assets).filter(([, a]) => a.kind === 'instrument' || a.kind === 'percussion' || a.kind === 'sfx');
    const files = entries.flatMap(([, a]) => a.files);
    const decoded = new Map<string, AudioBuffer>();
    let done = 0;
    const queue = [...files];
    await Promise.all(Array.from({ length: 6 }, async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        decoded.set(f, await decoder.decodeAudioData(await assets.bytes(f)));
        onProgress(++done, files.length);
      }
    }));
    for (const [key, a] of entries) {
      const [kind, name] = key.split('/');
      if (kind === 'inst') {
        const spec = INSTRUMENTS[name];
        if (spec) this.instruments.set(name, Instrument.create(spec, a.samples!, a.files.map((f) => decoded.get(f)!)));
      } else if (kind === 'perc') this.perc.set(name, decoded.get(a.files[0])!);
      else {
        const base = name.replace(/_\d+$/, '');
        this.effects.set(base, [...(this.effects.get(base) ?? []), decoded.get(a.files[0])!]);
      }
    }
  }

  /** Must be called from inside a user-gesture handler. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
    } catch {
      ctx = new AudioContext();
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.bgm = ctx.createGain();
    this.sfx = ctx.createGain();
    this.bgm.connect(this.master);
    this.master.connect(ctx.destination);
    // effects: dry, plus a send to a small room whose level follows the location
    const sfxOut = ctx.createGain();
    this.sfx.connect(sfxOut).connect(this.master);
    const room = ctx.createConvolver();
    room.buffer = impulse(ctx, 1.4);
    this.space = ctx.createGain();
    this.space.gain.value = 0.15;
    this.sfx.connect(this.space).connect(room).connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.player = new MusicPlayer(ctx, this.bgm, {
      instrument: (id) => this.instruments.get(id),
      percussion: (name) => this.perc.get(name),
    });
    this.applyVolumes();
    void ctx.resume();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void ctx.suspend();
      else void ctx.resume();
    });
    if (this.wanted) {
      const w = this.wanted;
      this.wanted = null;
      this.play(w.name, w.onEnd);
    }
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setValueAtTime(this.muted ? 0 : 1, t);
    this.bgm.gain.setValueAtTime(this.bgmVolume / 10, t);
    this.sfx.gain.setValueAtTime((this.sfxVolume / 10) * 0.8, t);
  }

  /** Reverb of the current location for effects: 0 (open field) .. 1 (large cave). */
  setSpace(level: number): void {
    if (this.ctx) this.space.gain.setTargetAtTime(0.1 + level * 0.5, this.ctx.currentTime, 0.3);
  }

  private song(name: SongName): Song {
    let s = this.songs.get(name);
    if (!s) this.songs.set(name, (s = compileSong(SONGS[name])));
    return s;
  }

  /** Start a track (crossfading); re-requesting the track already playing keeps it going. */
  play(name: SongName, onEnd?: () => void): void {
    if (!this.player) {
      this.wanted = { name, onEnd };
      return;
    }
    if (this.current === name && this.player.song && !onEnd) return;
    this.current = name;
    this.player.play(this.song(name), () => {
      if (this.current === name) this.current = null;
      onEnd?.();
    });
  }

  stopMusic(fade = 0.6): void {
    this.wanted = null;
    this.current = null;
    this.player?.stop(fade);
  }

  pauseMusic(): void {
    this.player?.pause();
  }

  resumeMusic(): void {
    this.player?.resume();
  }

  get currentSong(): SongName | null {
    return this.current;
  }

  sfxPlay(name: SfxName, opt: SfxOptions = {}): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    let out: AudioNode = this.sfx;
    if (opt.vol !== undefined || opt.pan) {
      const g = ctx.createGain();
      g.gain.value = opt.vol ?? 1;
      const p = ctx.createStereoPanner();
      p.pan.value = opt.pan ?? 0;
      g.connect(p).connect(this.sfx);
      out = g;
    }
    if (name in SYNTH_SFX) {
      SYNTH_SFX[name as SynthSfx]({ ctx, noise: this.noise, instrument: (id) => this.instruments.get(id), percussion: (n) => this.perc.get(n) }, out, t);
      return;
    }
    const variants = this.effects.get(name);
    if (!variants) return;
    const src = ctx.createBufferSource();
    src.buffer = variants[Math.floor(Math.random() * variants.length)];
    src.playbackRate.value = (opt.pitch ?? 1) * (variants.length > 1 ? 1 : 0.97 + Math.random() * 0.06);
    src.connect(out);
    src.start(t);
  }
}
