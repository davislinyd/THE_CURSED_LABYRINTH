import { AudioEngine } from '../audio/AudioEngine';
import type { SongName } from '../audio/MusicData';
import type { SfxName } from '../audio/SoundEffects';
import { Display } from '../graphics/Display';
import { INVERT_MAP } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { KEY_NAMES, isZh, setLang, t } from '../i18n';
import { SaveManager, Settings } from '../persistence/SaveManager';
import { DUNGEONS } from '../data/levels/dungeons';
import { BOSS_ORDER, STAGES, StageId } from '../data/levels/stages';
import { BossId } from '../world/DungeonMap';
import { GameLoop } from './GameLoop';
import { DungeonId, GameState, KeyItemId, Location, newGameState } from './GameState';
import { InputManager } from './InputManager';
import { Scene, SceneManager } from './SceneManager';
import { TitleScene } from '../scenes/TitleScene';
import { IntroScene } from '../scenes/IntroScene';
import { WorldScene } from '../scenes/WorldScene';
import { DungeonScene } from '../scenes/DungeonScene';
import { ActionScene } from '../scenes/ActionScene';
import { GameOverScene } from '../scenes/GameOverScene';
import { EndingScene } from '../scenes/EndingScene';
import { CardScene } from '../scenes/CardScene';
import { PauseMenu } from '../ui/PauseMenu';
import { Inventory } from '../ui/Inventory';
import { WORLD_ENTRANCES } from '../data/levels/world';

export const SEAL_OF_BOSS: Record<BossId, KeyItemId | null> = {
  rotroot: 'mirror',
  centipede: 'jewel',
  gashadokuro: 'flute',
  meiou: null,
};

export class Game {
  readonly r: PixelRenderer;
  readonly display: Display;
  readonly input = new InputManager();
  readonly audio = new AudioEngine();
  readonly scenes = new SceneManager();
  state: GameState = newGameState();
  settings: Settings = SaveManager.loadSettings();
  frame = 0;
  continuesLeft = 3;
  /** World-map spirits defeated since the hero last left the map (they return later). */
  readonly spiritsBeaten = new Set<string>();
  private readonly loop: GameLoop;

  constructor(canvas: HTMLCanvasElement, host: HTMLElement) {
    this.display = new Display(canvas, host);
    this.r = new PixelRenderer(this.display.lowresContext());
    this.input.onFirstGesture = () => this.audio.unlock();
    this.input.onFullscreenKey = () => this.toggleFullscreen();
    this.loop = new GameLoop(
      () => this.update(),
      () => this.render(),
    );
    window.addEventListener('blur', () => this.autoPause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autoPause();
    });
    this.applySettings();
  }

  start(scene?: Scene): void {
    this.scenes.change(scene ?? new TitleScene(this), false);
    this.loop.start();
  }

  private update(): void {
    this.input.tick();
    this.frame++;
    const sc = this.scenes;
    if (!sc.busy && !sc.hasOverlay && sc.current?.pausable) {
      if (this.input.pressed('start')) {
        this.input.consume('start');
        this.openPause();
      } else if (this.input.pressed('select')) {
        this.input.consume('select');
        this.openInventory();
      }
    }
    if (!sc.hasOverlay && sc.current?.playTime) this.state.stats.frames++;
    sc.update();
  }

  private render(): void {
    this.r.spriteLimit = this.settings.flicker ? 8 : 0;
    this.scenes.draw(this.r);
    this.r.present();
    this.display.present();
  }

  private autoPause(): void {
    const sc = this.scenes;
    if (!sc.busy && !sc.hasOverlay && sc.current?.pausable) this.openPause();
  }

  toggleFullscreen(): void {
    const el = document.getElementById('app')!;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  applySettings(): void {
    const s = this.settings;
    this.audio.bgmVolume = s.bgmVolume;
    this.audio.sfxVolume = s.sfxVolume;
    this.audio.muted = s.muted;
    this.audio.applyVolumes();
    this.display.scanlines = s.scanlines;
    this.display.pixelAspect = s.aspect === 1 ? 8 / 7 : 1;
    this.display.resize();
    document.getElementById('pad')?.toggleAttribute('hidden', !s.touchPad);
    setLang(s.lang);
    this.labelPage();
    SaveManager.saveSettings(s);
  }

  /** The HTML around the canvas: key hints, buttons and touch pad use the same key names as the game. */
  private labelPage(): void {
    document.documentElement.lang = isZh() ? 'zh-Hant' : 'en';
    const set = (sel: string, text: string) => document.querySelectorAll(sel).forEach((el) => (el.textContent = text));
    set('#hint', t('←↑→↓ MOVE · {A} JUMP / OK · {B} SWORD / CANCEL · ↑+{B} ITEM · {START} PAUSE · {SELECT} ITEMS · F FULLSCREEN'));
    set('#btn-pad', t('TOUCH PAD'));
    set('#btn-full', t('FULLSCREEN'));
    for (const [btn, key] of [['a', 'A'], ['b', 'B'], ['start', 'START'], ['select', 'SELECT']]) set(`#pad [data-btn="${btn}"]`, KEY_NAMES[key]);
  }

  sfx(name: SfxName): void {
    this.audio.sfxPlay(name);
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

  openInventory(): void {
    this.sfx('cursor');
    this.scenes.push(new Inventory(this));
  }

  encounterFlash(): void {
    this.scenes.flash(INVERT_MAP, 4);
  }

  // ---- Flow -------------------------------------------------------------

  toTitle(): void {
    this.audio.stopMusic();
    this.scenes.change(new TitleScene(this));
  }

  newGame(): void {
    this.state = newGameState();
    this.continuesLeft = 3;
    SaveManager.save(this.state);
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

  /** Go to a saved location (world map or a labyrinth cell). */
  private resume(loc: Location): void {
    if (loc.mode === 'dungeon') this.scenes.change(new DungeonScene(this, loc.id));
    else this.toWorld(loc.x, loc.y);
  }

  toWorld(x?: number, y?: number): void {
    const s = this.state;
    if (x !== undefined && y !== undefined) s.location = { mode: 'world', x, y };
    if (s.location.mode !== 'world') {
      const back = WORLD_ENTRANCES[s.location.id];
      s.location = { mode: 'world', x: back.x, y: back.y };
    }
    s.checkpoint = { ...s.location };
    this.saveGame();
    this.scenes.change(new WorldScene(this));
  }

  enterDungeon(id: DungeonId): void {
    this.spiritsBeaten.clear();
    const d = DUNGEONS[id];
    const rows = d.map;
    let sx = 1, sy = 1;
    rows.forEach((row, y) => {
      const i = row.indexOf('@');
      if (i >= 0) [sx, sy] = [i, y];
    });
    this.state.location = { mode: 'dungeon', id, x: sx, y: sy, dir: d.start.dir };
    this.state.checkpoint = { ...this.state.location };
    this.saveGame();
    this.scenes.change(new CardScene(this, d.name, 'LABYRINTH', () => this.scenes.change(new DungeonScene(this, id))));
  }

  /** Back to the labyrinth after a battle, at the same cell and heading. */
  returnToDungeon(): void {
    const loc = this.state.location;
    if (loc.mode !== 'dungeon') return this.toWorld();
    this.saveGame();
    this.scenes.change(new DungeonScene(this, loc.id, false));
  }

  startStage(id: StageId): void {
    this.spiritsBeaten.clear();
    const st = STAGES[id];
    this.scenes.change(new CardScene(this, st.title, st.subtitle, () => this.scenes.change(new ActionScene(this, { kind: 'stage', stage: id }))));
  }

  startEncounter(group: string, cell: string): void {
    this.scenes.change(new ActionScene(this, { kind: 'encounter', group, cell }), true);
  }

  startBoss(boss: BossId): void {
    this.scenes.change(new ActionScene(this, { kind: 'boss', boss }));
  }

  stageCleared(id: StageId): void {
    this.state.flags[`stage:${id}`] = true;
    const st = STAGES[id];
    if (st.leadsTo.kind === 'dungeon') this.enterDungeon(st.leadsTo.id);
    else this.startBoss(st.leadsTo.boss);
  }

  bossDefeated(boss: BossId): void {
    const s = this.state;
    s.flags[`boss:${boss}`] = true;
    if (boss === 'meiou') {
      s.cleared = true;
      this.saveGame();
      this.scenes.change(new EndingScene(this));
      return;
    }
    const seal = SEAL_OF_BOSS[boss];
    if (seal && !s.keyItems.includes(seal)) {
      s.keyItems.push(seal);
      if (seal === 'jewel') {
        s.maxLife = Math.min(24, s.maxLife + 4);
      }
    }
    s.life = s.maxLife;
    const idx = BOSS_ORDER.indexOf(boss);
    const dungeon = (['d1', 'd2', 'd3'] as DungeonId[])[idx];
    const back = WORLD_ENTRANCES[dungeon];
    this.toWorld(back.x, back.y);
  }

  gameOver(): void {
    this.state.stats.deaths++;
    this.scenes.change(new GameOverScene(this), false);
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
