import { AudioEngine } from '../audio/AudioEngine';
import type { SongName } from '../audio/MusicData';
import type { SfxName, SfxOptions } from '../audio/Sfx';
import * as THREE from 'three';
import { Assets } from '../engine/Assets';
import { loadFonts } from '../engine/Fonts';
import { Interp } from '../engine/Interp';
import { Renderer, SCREEN_H, VIEW } from '../engine/Renderer';
import { isZh, setKeyNames, setLang, t } from '../i18n';
import { SaveManager, Settings } from '../persistence/SaveManager';
import { LoadingScene } from '../scenes/LoadingScene';
import { BossScene } from '../scenes/BossScene';
import { DungeonScene } from '../scenes/DungeonScene';
import { IntroScene } from '../scenes/IntroScene';
import { IsoScene } from '../scenes/IsoScene';
import { TitleScene } from '../scenes/TitleScene';
import { PauseMenu } from '../ui/PauseMenu';
import { COL, UI } from '../ui/UI';
import { CheatCode } from './Cheat';
import { GameLoop } from './GameLoop';
import { DUNGEONS } from '../data/levels/dungeons';
import { WORLD_ENTRANCES } from '../data/levels/world';
import type { BossId } from '../world/DungeonMap';
import { DungeonId, GameState, KeyItemId, Location, newGameState } from './GameState';
import { Device, InputManager, KEY_LABELS } from './InputManager';
import { SceneManager } from './SceneManager';

/** The seal each guardian guards. */
export const SEAL_OF_BOSS: Record<BossId, KeyItemId | null> = { rotroot: 'mirror', centipede: 'jewel', gashadokuro: 'flute', meiou: null };

/** Top-level game object: owns the renderer, interface, input, audio, scenes and the current journey. */
export class Game {
  readonly gfx: Renderer;
  readonly ui: UI;
  readonly input: InputManager;
  readonly audio = new AudioEngine();
  readonly assets = new Assets();
  readonly scenes = new SceneManager();
  private readonly loop: GameLoop;
  private readonly interp = new Interp();
  state: GameState = newGameState();
  settings: Settings = SaveManager.loadSettings();
  frame = 0;
  continuesLeft = 3;
  /** Test cheat (↑↑↓↓←→←→BA): every map is shown while it is on. Not saved. */
  reveal = false;
  private readonly cheat = new CheatCode();
  private toast: { text: string; t: number } | null = null;
  /** Ticks of slow motion left. */
  private slowFor = 0;
  private labelledDevice: Device | null = null;

  constructor(display: HTMLCanvasElement, uiCanvas: HTMLCanvasElement, private readonly host: HTMLElement) {
    this.gfx = new Renderer(display, host);
    this.assets.anisotropy = Math.min(16, this.gfx.gl.capabilities.getMaxAnisotropy());
    this.ui = new UI(uiCanvas);
    this.gfx.onResize = () => this.ui.resize(this.gfx.cssW, this.gfx.cssH);
    this.ui.resize(this.gfx.cssW, this.gfx.cssH);
    this.input = new InputManager(host);
    this.input.toLogical = (cx, cy) => {
      const r = uiCanvas.getBoundingClientRect();
      return r.width ? { x: ((cx - r.left) / r.width) * VIEW.w - VIEW.ox, y: ((cy - r.top) / r.height) * SCREEN_H } : null;
    };
    this.input.onFirstGesture = () => this.audio.unlock();
    this.input.onFullscreenKey = () => this.toggleFullscreen();
    this.applySettings();
    this.loop = new GameLoop(
      () => this.update(),
      (alpha, ms, now) => this.render(alpha, ms, now),
      () => this.interp.begin(this.moving()),
    );
    window.addEventListener('blur', () => this.autoPause());
  }

  async start(): Promise<void> {
    this.loop.start();
    await loadFonts();
    this.scenes.change(new LoadingScene(this), false);
  }

  private update(): void {
    this.frame++;
    if (this.slowFor > 0 && --this.slowFor === 0) this.loop.scale = 1;
    this.ui.frame = this.frame;
    this.input.poll();
    if (this.input.device !== this.labelledDevice) this.labelPage();
    const cur = this.scenes.current;
    for (const tap of this.input.taps) if (this.cheat.feed(tap, this.frame)) this.toggleReveal();
    if (this.toast && --this.toast.t <= 0) this.toast = null;
    if (cur?.playTime && !this.scenes.hasOverlay) this.state.stats.frames++;
    // Esc frees a captured mouse before the page sees the key, so that pauses too
    if (!this.scenes.busy && cur?.pausable && this.scenes.top === cur && (this.input.pressed('start') || this.input.lockLost)) {
      this.openPause();
      this.input.syncLock();
      return;
    }
    this.scenes.update();
    this.input.syncLock();
  }

  /** Run the game clock at `scale` for the next `ticks` ticks (by default, after a perfect parry). */
  slowMo(ticks = 20, scale = 0.4): void {
    this.slowFor = ticks;
    this.loop.scale = scale;
  }

  /** The test cheat: reveal every map and restore life, or put the fog of war back. */
  private toggleReveal(): void {
    if (!this.scenes.current?.playTime || this.scenes.hasOverlay) return;
    this.reveal = !this.reveal;
    if (this.reveal) this.state.life = this.state.maxLife;
    this.sfx(this.reveal ? 'heal' : 'cancel');
    this.toast = { text: this.reveal ? t('CHEAT: MAP REVEALED, LIFE RESTORED') : t('CHEAT OFF: FOG OF WAR RESTORED'), t: 150 };
  }

  private moving(): readonly THREE.Object3D[] {
    return this.scenes.current?.moving ?? [];
  }

  private render(alpha: number, ms: number, now: number): void {
    const objs = this.moving();
    this.interp.end(objs);
    this.interp.apply(objs, alpha);
    this.scenes.render(this.gfx, this.ui, (this.frame + alpha) / 60);
    if (this.toast) {
      const w = this.ui.measure(this.toast.text, 14, 600) + 36, alpha = Math.min(1, this.toast.t / 20);
      this.ui.ctx.globalAlpha = alpha;
      this.ui.panel(320 - w / 2, 54, w, 30, COL.red);
      this.ui.ctx.globalAlpha = 1;
      this.ui.text(this.toast.text, 320, 75, { size: 14, weight: 600, align: 'center', color: COL.goldLight, alpha });
    }
    this.interp.restore(objs);
    this.gfx.pace(ms, now);
  }

  private autoPause(): void {
    const cur = this.scenes.current;
    if (cur?.pausable && !this.scenes.hasOverlay && !this.scenes.busy) this.openPause();
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void this.host.requestFullscreen?.().catch(() => undefined);
  }

  applySettings(): void {
    const s = this.settings;
    this.audio.bgmVolume = s.bgmVolume;
    this.audio.sfxVolume = s.sfxVolume;
    this.audio.muted = s.muted;
    this.audio.applyVolumes();
    setLang(s.lang);
    this.gfx.apply(s.resolution, s.effects, s.crt);
    SaveManager.saveSettings(s);
    this.labelPage();
  }

  /** Page chrome below the game: key hints in the current language and device. */
  private labelPage(): void {
    this.labelledDevice = this.input.device;
    setKeyNames(KEY_LABELS[this.input.device]);
    document.documentElement.lang = isZh() ? 'zh-Hant' : 'en';
    const hint = document.getElementById('hint');
    if (hint) {
      hint.textContent = t(
        '{MOVE} MOVE · {ATTACK} ATTACK · {STRONG} STRONG · {GUARD} GUARD · {DODGE} DODGE · {ACT} EXAMINE · {ITEM} ITEM · {LOCK} LOCK ON · {MAP} MAP · {START} PAUSE · F FULLSCREEN',
      );
    }
  }

  sfx(name: SfxName, opt?: SfxOptions): void {
    this.audio.sfxPlay(name, opt);
  }

  music(name: SongName, onEnd?: () => void): void {
    this.audio.play(name, onEnd);
  }

  saveGame(): void {
    SaveManager.save(this.state);
  }

  openPause(): void {
    this.sfx('pause');
    this.audio.pauseMusic();
    this.scenes.push(new PauseMenu(this));
  }

  toTitle(): void {
    this.audio.stopMusic();
    this.scenes.change(new TitleScene(this));
  }

  newGame(): void {
    this.state = newGameState();
    this.continuesLeft = 3;
    this.scenes.change(new IntroScene(this));
  }

  continueGame(): boolean {
    const s = SaveManager.load();
    if (!s) return false;
    this.state = s;
    this.continuesLeft = 3;
    this.resume(s.location);
    return true;
  }

  private resume(loc: Location): void {
    if (loc.mode === 'dungeon') this.scenes.change(new DungeonScene(this, loc.id));
    else this.toWorld();
  }

  /** Out on the plains, at world tile (x, y) if given; records the journey. */
  toWorld(x?: number, y?: number): void {
    const s = this.state;
    if (x !== undefined && y !== undefined) s.location = { mode: 'world', x, y };
    if (s.location.mode !== 'world') {
      const back = WORLD_ENTRANCES[s.location.id];
      s.location = { mode: 'world', x: back.x, y: back.y };
    }
    s.checkpoint = { ...s.location };
    this.saveGame();
    this.scenes.change(new IsoScene(this, 'world'));
  }

  /** Into Haiya village from world tile (x, y), where leaving puts the hero back (chapter 1 has one village). */
  enterTown(x: number, y: number): void {
    this.state.location = { mode: 'world', x, y };
    this.scenes.change(new IsoScene(this, 'village'));
  }

  /** The chapter 1 road to the grotto (walked until it has been cleared once). */
  startRoad(): void {
    const back = WORLD_ENTRANCES.d1;
    this.state.location = { mode: 'world', x: back.x, y: back.y };
    this.scenes.change(new IsoScene(this, 'road'));
  }

  stageCleared(): void {
    this.state.flags['stage:s1'] = true;
    this.enterDungeon('d1');
  }

  enterDungeon(id: DungeonId): void {
    const d = DUNGEONS[id];
    let x = 1, y = 1;
    d.map.forEach((row, r) => {
      const i = row.indexOf('@');
      if (i >= 0) [x, y] = [i, r];
    });
    this.state.location = { mode: 'dungeon', id, x, y, dir: d.start.dir };
    this.state.checkpoint = { ...this.state.location };
    this.saveGame();
    this.scenes.change(new DungeonScene(this, id));
  }

  startBoss(id: DungeonId): void {
    this.scenes.change(new BossScene(this, id));
  }

  /** Out through the exit stairs, back to the entrance on the world map. */
  leaveDungeon(id: DungeonId): void {
    const back = WORLD_ENTRANCES[id];
    this.toWorld(back.x, back.y);
  }

  bossDefeated(boss: BossId): void {
    const s = this.state;
    s.flags[`boss:${boss}`] = true;
    const seal = SEAL_OF_BOSS[boss];
    if (seal && !s.keyItems.includes(seal)) s.keyItems.push(seal);
    s.life = s.maxLife;
    const id = (Object.keys(DUNGEONS) as DungeonId[]).find((k) => DUNGEONS[k].boss === boss) ?? 'd1';
    this.leaveDungeon(id);
  }

  /** CONTINUE after death: full life, half gold, back to the last checkpoint. */
  continueAfterDeath(): void {
    const s = this.state;
    this.continuesLeft--;
    s.stats.continuesUsed++;
    s.life = s.maxLife;
    s.gold = Math.floor(s.gold / 2);
    s.location = { ...s.checkpoint };
    this.resume(s.location);
  }
}
