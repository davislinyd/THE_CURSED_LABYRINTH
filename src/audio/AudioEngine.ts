import { ChiptuneSynth } from './ChiptuneSynth';
import { MusicSequencer, Song, compileSong } from './MusicSequencer';
import { SONGS, SongName } from './MusicData';
import { SFX, SfxName } from './SoundEffects';

/**
 * Owns the AudioContext (created on the first user gesture, per browser
 * autoplay rules) plus the BGM / SFX buses and their volume settings.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private synth: ChiptuneSynth | null = null;
  private seq: MusicSequencer | null = null;
  private master!: GainNode;
  private bgm!: GainNode;
  private sfx!: GainNode;
  private songs = new Map<SongName, Song>();
  private current: SongName | null = null;
  private wanted: { name: SongName; onEnd?: () => void } | null = null;
  bgmVolume = 7;
  sfxVolume = 8;
  muted = false;

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Must be called from inside a user-gesture handler. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.bgm = ctx.createGain();
    this.sfx = ctx.createGain();
    this.bgm.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(ctx.destination);
    this.synth = new ChiptuneSynth(ctx);
    this.seq = new MusicSequencer(this.synth, this.bgm);
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
    this.bgm.gain.setValueAtTime((this.bgmVolume / 10) * 0.9, t);
    this.sfx.gain.setValueAtTime((this.sfxVolume / 10) * 0.9, t);
  }

  private song(name: SongName): Song {
    let s = this.songs.get(name);
    if (!s) this.songs.set(name, (s = compileSong(SONGS[name])));
    return s;
  }

  /** Start a track; re-requesting the track already playing keeps it going. */
  play(name: SongName, onEnd?: () => void): void {
    if (!this.seq) {
      this.wanted = { name, onEnd };
      return;
    }
    if (this.current === name && this.seq.playing && !onEnd) return;
    this.current = name;
    this.seq.play(this.song(name), () => {
      if (this.current === name) this.current = null;
      onEnd?.();
    });
  }

  stopMusic(): void {
    this.wanted = null;
    this.current = null;
    this.seq?.stop();
  }

  pauseMusic(): void {
    this.seq?.pause();
  }

  resumeMusic(): void {
    this.seq?.resume();
  }

  get currentSong(): SongName | null {
    return this.current;
  }

  sfxPlay(name: SfxName): void {
    if (!this.ctx || !this.synth || this.ctx.state !== 'running') return;
    SFX[name](this.synth, this.sfx, this.ctx.currentTime + 0.005);
  }
}
