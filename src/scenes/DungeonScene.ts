import type { Game } from '../core/Game';
import type { Scene } from '../core/SceneManager';
import {
  DIR_NAMES, DX, DY, Dir, DungeonId, ITEM_NAMES, KEY_ITEM_INFO, hasItem, reverse, turnLeft, turnRight,
} from '../core/GameState';
import { DUNGEONS } from '../data/levels/dungeons';
import { CHEST, SLASH_ARC, SPIKES, SPIRIT, WISP } from '../data/sprites/dungeon';
import { BOSS_GATE_STAGE } from '../data/levels/stages';
import { BACK_CUT, BACK_CX, BACK_RAISE, BACK_STAND, BACK_WALK, HERO_PAL } from '../data/sprites/hero';
import { C } from '../graphics/Palette';
import { PerspectiveRenderer, VIEW, ViewState } from '../graphics/PerspectiveRenderer';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { Dungeon, Loot, key } from '../world/DungeonMap';
import { drawHUD } from '../ui/HUD';
import { MessageBox } from '../ui/Window';
import { isZh, t } from '../i18n';

type Mode = 'idle' | 'walk' | 'turn' | 'attack' | 'message' | 'prompt' | 'encounter' | 'warp' | 'leaving';


const BREAK_HP = 3;

export class DungeonScene implements Scene {
  readonly id: DungeonId;
  readonly dungeon: Dungeon;
  private readonly view: PerspectiveRenderer;
  private x: number;
  private y: number;
  private dir: Dir;
  private mode: Mode = 'idle';
  private t = 0;
  private walkFrame = 0;
  private turnSign = 0;
  private stepBack = false;
  private readonly doorHp = new Map<string, number>();
  private flashCell: string | null = null;
  private flashT = 0;
  private readonly msg = new MessageBox(28, 3);
  private prompt: { text: string; yes: () => void; cursor: number } | null = null;
  private afterMessage: (() => void) | null = null;
  private pendingEncounter: string | null = null;
  private bumpCooldown = 0;
  private shake = 0;
  private wasDark = false;

  constructor(private readonly game: Game, id: DungeonId, private readonly announce = true) {
    this.id = id;
    const s = game.state;
    this.dungeon = new Dungeon(DUNGEONS[id], { get: (n) => !!s.flags[n] });
    const loc = s.location;
    if (loc.mode === 'dungeon' && loc.id === id) {
      this.x = loc.x;
      this.y = loc.y;
      this.dir = loc.dir;
    } else {
      this.x = this.dungeon.start.x;
      this.y = this.dungeon.start.y;
      this.dir = this.dungeon.start.dir;
    }
    this.view = new PerspectiveRenderer({ chest: CHEST, wisp: WISP as [typeof WISP[0], typeof WISP[1]], spirit: SPIRIT, spikes: SPIKES });
  }

  readonly playTime = true;

  get pausable(): boolean {
    return this.mode === 'idle';
  }

  get position(): { x: number; y: number; dir: Dir } {
    return { x: this.x, y: this.y, dir: this.dir };
  }

  enter(): void {
    this.game.music(this.dungeon.def.music);
    this.markVisited();
    this.wasDark = this.dungeon.isDark(this.x, this.y);
    if (this.announce) this.say(t(this.dungeon.def.name) + (isZh() ? '' : '.'));
  }

  private save(): void {
    this.game.state.location = { mode: 'dungeon', id: this.id, x: this.x, y: this.y, dir: this.dir };
  }

  private markVisited(): void {
    this.game.state.visited[`${this.id}:${key(this.x, this.y)}`] = true;
  }

  private say(text: string, then?: () => void): void {
    this.msg.set(text);
    this.afterMessage = then ?? null;
    this.mode = 'message';
  }

  private ask(text: string, yes: () => void): void {
    this.prompt = { text, yes, cursor: 1 };
    this.msg.set(text);
    this.msg.update(true);
    this.mode = 'prompt';
  }

  // ---- Update -----------------------------------------------------------

  update(): void {
    const g = this.game;
    const inp = g.input;
    this.t++;
    if (this.bumpCooldown > 0) this.bumpCooldown--;
    if (this.shake > 0) this.shake--;
    if (this.flashT > 0 && --this.flashT === 0) this.flashCell = null;

    switch (this.mode) {
      case 'message': {
        if (this.msg.update(inp.held('a') || inp.held('b'))) g.sfx('text');
        if (inp.pressed('a') || inp.pressed('b') || inp.pressed('start')) {
          if (!this.msg.advance()) this.closeMessage();
        } else if (!this.msg.typing && this.msg.lastPage && (inp.pressed('up') || inp.pressed('left') || inp.pressed('right') || inp.pressed('down'))) {
          this.msg.clear();
          this.closeMessage();
          this.idle();
        }
        return;
      }
      case 'prompt': {
        this.msg.update(true);
        const p = this.prompt!;
        if (inp.pressed('left') || inp.pressed('right') || inp.pressed('up') || inp.pressed('down')) {
          p.cursor ^= 1;
          g.sfx('cursor');
        }
        if (inp.pressed('a') || inp.pressed('start')) {
          this.msg.clear();
          this.prompt = null;
          this.mode = 'idle';
          if (p.cursor === 0) {
            g.sfx('confirm');
            p.yes();
          } else g.sfx('cancel');
        } else if (inp.pressed('b')) {
          this.msg.clear();
          this.prompt = null;
          this.mode = 'idle';
          g.sfx('cancel');
        }
        return;
      }
      case 'walk':
        if (this.t >= 4) this.finishStep();
        return;
      case 'turn':
        if (this.t >= 4) {
          this.mode = 'idle';
          this.t = 0;
        }
        return;
      case 'attack':
        if (this.t === 4) this.strike();
        if (this.t >= 14) this.mode = 'idle';
        return;
      case 'encounter':
        if (this.t % 6 === 0 && this.t <= 30) g.encounterFlash();
        if (this.t === 40) {
          this.save();
          g.startEncounter(this.pendingEncounter!, key(this.x, this.y));
        }
        return;
      case 'warp':
        if (this.t === 30) this.finishWarp();
        return;
      case 'leaving':
        return;
      case 'idle':
        this.idle();
    }
  }

  private closeMessage(): void {
    this.mode = 'idle';
    const f = this.afterMessage;
    this.afterMessage = null;
    f?.();
  }

  private idle(): void {
    const inp = this.game.input;
    if (inp.repeat('up', 14, 14)) this.tryStep(this.dir, false);
    else if (inp.repeat('down', 14, 14)) this.tryStep(reverse(this.dir), true);
    else if (inp.repeat('left', 14, 12)) this.turn(-1);
    else if (inp.repeat('right', 14, 12)) this.turn(1);
    else if (inp.pressed('a')) {
      this.mode = 'attack';
      this.t = 0;
      this.game.sfx('slash');
    } else if (inp.pressed('b')) this.useItem();
  }

  private turn(sign: number): void {
    this.dir = sign < 0 ? turnLeft(this.dir) : turnRight(this.dir);
    this.turnSign = sign;
    this.mode = 'turn';
    this.t = 0;
    this.game.sfx('turn');
    this.save();
  }

  private tryStep(d: Dir, back: boolean): void {
    const nx = this.x + DX[d], ny = this.y + DY[d];
    const dg = this.dungeon;
    if (dg.passable(nx, ny)) {
      this.x = nx;
      this.y = ny;
      this.stepBack = back;
      this.mode = 'walk';
      this.t = 0;
      this.walkFrame ^= 1;
      this.game.sfx('step');
      this.game.state.stats.steps++;
      return;
    }
    if (back) {
      this.bump();
      return;
    }
    this.interact(nx, ny);
  }

  private bump(): void {
    if (this.bumpCooldown > 0) return;
    this.bumpCooldown = 16;
    this.shake = 6;
    this.game.sfx('bump');
  }

  /** Pushing into a solid cell in front. */
  private interact(nx: number, ny: number): void {
    const g = this.game;
    const s = g.state;
    const dg = this.dungeon;
    const face = dg.face(nx, ny);
    const k = key(nx, ny);
    switch (face) {
      case 'door':
        s.flags[dg.flag('open', nx, ny)] = true;
        g.sfx('door');
        this.save();
        return;
      case 'locked':
        if (s.keys[this.id] > 0) {
          s.keys[this.id]--;
          s.flags[dg.flag('open', nx, ny)] = true;
          g.sfx('unlock');
          this.say(t('THE KEY TURNS. THE LOCK FALLS AWAY.'));
        } else {
          g.sfx('locked');
          this.say(t('A HEAVY LOCK. YOU NEED A KEY.'));
        }
        return;
      case 'seal': {
        const need = dg.def.seals![k];
        const info = KEY_ITEM_INFO[need];
        if (hasItem(s, need)) {
          s.flags[dg.flag('open', nx, ny)] = true;
          g.sfx('mechanism');
          g.scenes.flash(new Uint8Array(64).fill(0x30), 3);
          this.say(t('THE {0} SHINES. THE SEAL CRUMBLES!', t(info.name)));
        } else {
          g.sfx('locked');
          this.say(t('A SACRED SEAL. ONLY THE {0} CAN BREAK IT.', t(info.name)));
        }
        return;
      }
      case 'breakable':
        this.bump();
        this.say(t('ROTTEN BOARDS BAR THE WAY. STRIKE THEM WITH YOUR SWORD! ({A})'));
        return;
      case 'gate':
        this.bump();
        this.say(t('AN IRON GATE. IT WILL NOT BUDGE. PERHAPS A LEVER MOVES IT.'));
        return;
      case 'lever':
        this.pullLever(nx, ny);
        return;
      case 'tablet':
        g.sfx('confirm');
        this.say(t(dg.def.tablets![k]));
        return;
      case 'npc':
        g.sfx('confirm');
        this.say(t(dg.def.npcs![k]));
        return;
      case 'exit':
        this.ask(t('LEAVE THE LABYRINTH?'), () => {
          this.mode = 'leaving';
          this.game.sfx('door');
          this.game.toWorld();
        });
        return;
      case 'boss':
        this.ask(t('A TERRIBLE PRESENCE WAITS BEYOND. ENTER?'), () => {
          this.mode = 'leaving';
          this.save();
          s.checkpoint = { ...s.location };
          g.saveGame();
          g.sfx('bossAppear');
          g.scenes.flash(new Uint8Array(64).fill(0x16), 8);
          const gate = BOSS_GATE_STAGE[dg.def.boss];
          if (gate) g.startStage(gate);
          else g.startBoss(dg.def.boss);
        });
        return;
      default:
        this.bump();
    }
  }

  private pullLever(x: number, y: number): void {
    const g = this.game;
    const group = this.dungeon.ch(x, y) === '=' ? 0 : 1;
    const f = `${this.id}:lever${group}`;
    g.state.flags[f] = !g.state.flags[f];
    g.sfx('mechanism');
    this.shake = 10;
    this.say(g.state.flags[f] ? t('THE LEVER GROANS DOWNWARD. SOMEWHERE, IRON GATES GRIND.') : t('THE LEVER SNAPS BACK UP. DISTANT GATES SHIFT AGAIN.'));
  }

  /** Active frame of the sword swing: affects the cell directly ahead. */
  private strike(): void {
    const g = this.game;
    const nx = this.x + DX[this.dir], ny = this.y + DY[this.dir];
    const face = this.dungeon.face(nx, ny);
    const k = key(nx, ny);
    if (face === 'breakable') {
      const hp = (this.doorHp.get(k) ?? BREAK_HP) - 1;
      this.flashCell = k;
      this.flashT = 10;
      this.shake = 4;
      if (hp <= 0) {
        this.doorHp.delete(k);
        g.state.flags[this.dungeon.flag('open', nx, ny)] = true;
        g.sfx('doorBreak');
        this.say(t('THE ROTTEN DOOR BURSTS APART!'));
      } else {
        this.doorHp.set(k, hp);
        g.sfx('doorHit');
      }
    } else if (face === 'lever') {
      this.pullLever(nx, ny);
    } else if (face && face !== 'npc') {
      g.sfx('clang');
    }
  }

  private useItem(): void {
    const g = this.game;
    const s = g.state;
    const id = s.currentItem;
    if (s.items[id] <= 0) {
      g.sfx('locked');
      this.say(t('NO {0} LEFT.', t(ITEM_NAMES[id])));
      return;
    }
    if (id === 'talisman') {
      g.sfx('throw');
      this.say(t('THE TALISMAN FLUTTERS AND FALLS. IT IS MEANT FOR BATTLE.'));
      return;
    }
    if (s.life >= s.maxLife) {
      g.sfx('locked');
      this.say(t('YOU ARE ALREADY HALE.'));
      return;
    }
    s.items[id]--;
    s.life = id === 'elixir' ? s.maxLife : Math.min(s.maxLife, s.life + 6);
    g.sfx('heal');
    this.say(id === 'elixir' ? t('THE ELIXIR BURNS LIKE SUNLIGHT. LIFE FULLY RESTORED!') : t('THE BITTER HERB RESTORES YOUR STRENGTH.'));
  }

  private finishStep(): void {
    this.mode = 'idle';
    this.t = 0;
    this.markVisited();
    this.save();
    this.onEnterCell();
  }

  private onEnterCell(): void {
    const g = this.game;
    const s = g.state;
    const dg = this.dungeon;
    const { x, y } = this;
    const k = key(x, y);
    const c = dg.ch(x, y);
    const dark = dg.isDark(x, y);
    if (dark !== this.wasDark) {
      this.wasDark = dark;
      if (dark)
        this.say(hasItem(s, 'candle') ? t('CURSED DARKNESS... THE GHOST CANDLE FLARES PALE BLUE.') : t('A CURSED DARKNESS SWALLOWS ALL LIGHT. YOU CAN BARELY SEE.'));
    }
    if (c === 'C' && !s.flags[dg.flag('chest', x, y)]) {
      s.flags[dg.flag('chest', x, y)] = true;
      s.stats.chests++;
      this.give(dg.def.chests[k], t('THE CHEST CREAKS OPEN.'));
    } else if (c === '?' && !s.flags[dg.flag('hidden', x, y)]) {
      s.flags[dg.flag('hidden', x, y)] = true;
      s.stats.secrets++;
      this.give(dg.def.hidden![k], t('SOMETHING GLINTS IN THE DUST...'));
    } else if (c === '^') {
      g.sfx('trap');
      this.shake = 8;
      s.life = Math.max(0, s.life - (dg.def.spike ?? 2));
      g.scenes.flash(new Uint8Array(64).fill(0x16), 3);
      if (s.life <= 0) {
        this.mode = 'leaving';
        g.gameOver();
        return;
      }
      this.say(t('SPIKES! THEY BITE DEEP.'));
    } else if (c === 'O') {
      g.sfx('warp');
      this.mode = 'warp';
      this.t = 0;
    } else if (c === 'E' && !s.flags[dg.flag('enc', x, y)]) {
      g.sfx('encounter');
      this.pendingEncounter = dg.def.encounters[k];
      this.mode = 'encounter';
      this.t = 0;
    }
    if (c === 'F' && !s.flags[dg.flag('secret', x, y)]) {
      s.flags[dg.flag('secret', x, y)] = true;
      s.stats.secrets++;
      g.sfx('mechanism');
      this.say(t('THE WALL WAS AN ILLUSION! A HIDDEN PASSAGE.'));
    }
  }

  private finishWarp(): void {
    const to = this.dungeon.def.warps![key(this.x, this.y)];
    this.x = to.x;
    this.y = to.y;
    this.dir = to.dir;
    this.markVisited();
    this.save();
    this.game.scenes.flash(new Uint8Array(64).fill(0x33), 6);
    this.say(t('THE CIRCLE FLARES - YOU ARE CAST ELSEWHERE!'));
  }

  private give(loot: Loot, intro: string): void {
    const g = this.game;
    const s = g.state;
    let text = '';
    switch (loot.kind) {
      case 'key':
        s.keys[this.id]++;
        text = t('FOUND AN IRON KEY.');
        break;
      case 'gold':
        s.gold = Math.min(9999, s.gold + loot.n);
        text = t('FOUND {0} GOLD.', loot.n);
        break;
      case 'item':
        s.items[loot.id] = Math.min(99, s.items[loot.id] + loot.n);
        text = t('FOUND {0} ×{1}.', t(ITEM_NAMES[loot.id]), loot.n);
        break;
      case 'keyItem': {
        if (!s.keyItems.includes(loot.id)) s.keyItems.push(loot.id);
        const info = KEY_ITEM_INFO[loot.id];
        text = t('FOUND THE {0}! {1}', t(info.name), t(info.desc));
        if (loot.id.startsWith('map_')) text += t(' ({SELECT} TO VIEW)');
        break;
      }
      case 'vessel':
        s.maxLife = Math.min(24, s.maxLife + 2);
        s.life = s.maxLife;
        text = t('FOUND A SPIRIT VESSEL! MAXIMUM LIFE RISES.');
        break;
    }
    g.sfx(loot.kind === 'gold' ? 'coin' : 'pickup');
    this.say(isZh() ? intro + text : `${intro} ${text}`);
  }

  // ---- Draw -------------------------------------------------------------

  private viewState(): ViewState {
    const s = this.game.state;
    const dark = this.dungeon.isDark(this.x, this.y);
    const candle = hasItem(s, 'candle');
    let depth = 5;
    let fog = [0, 0, 1, 2, 3];
    if (dark && candle) {
      depth = 4;
      fog = [0, 1, 2, 3];
    } else if (dark) {
      depth = 2;
      fog = [1, 2];
    }
    let x = this.x, y = this.y, offset = 0;
    if (this.mode === 'walk' && this.t < 3) {
      // Half-step frame: forward shows the old cell half advanced, backward the new cell half advanced.
      if (this.stepBack) offset = 0.5;
      else {
        x -= DX[this.dir];
        y -= DY[this.dir];
        offset = 0.5;
      }
    }
    return {
      dungeon: this.dungeon, x, y, dir: this.dir, offset, depth, fog, frame: this.game.frame,
      mirror: hasItem(s, 'mirror'), doorHp: this.doorHp, flashCell: this.flashCell,
    };
  }

  draw(r: PixelRenderer): void {
    const s = this.game.state;
    r.clear(C.BLACK);
    drawHUD(r, s, { area: this.areaShort(), keys: s.keys[this.id] });
    this.view.render(r, this.viewState());
    if (this.mode === 'turn' && this.t < 4) {
      // Snap-pan: the new view slides in from the side over a few frames.
      const amount = [96, 56, 24, 0][this.t];
      this.view.shift(r, this.turnSign > 0 ? amount : -amount);
    }
    if (this.mode === 'warp') {
      const band = (this.t * 6) % VIEW.h;
      r.rect(VIEW.x, VIEW.y + band, VIEW.w, 6, 0x13);
    }
    this.drawHero(r);
    if (this.shake > 0) this.view.shift(r, this.shake & 2 ? 2 : -2);
    this.drawFrame(r);
    this.msg.draw(r, 0, 200, 256, this.game.frame);
    if (this.prompt) {
      r.text(t('YES'), 64, 224, C.WHITE);
      r.text(t('NO'), 136, 224, C.WHITE);
      if ((this.game.frame >> 3) & 3) r.text('▶', this.prompt.cursor === 0 ? 52 : 124, 224, C.RED);
    }
  }

  private areaShort(): string {
    return isZh() ? t(this.dungeon.def.name) : this.dungeon.def.name.split(' ').slice(-1)[0];
  }

  private drawHero(r: PixelRenderer): void {
    // The samurai stands at the near edge of the view, cut off at the shins.
    const baseX = 128 - BACK_CX;
    const baseY = VIEW.y + VIEW.h - BACK_STAND.h + 10;
    r.clip(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    if (this.mode === 'attack') {
      if (this.t < 4) {
        r.sprite(BACK_RAISE, baseX, baseY + 1, HERO_PAL);
      } else {
        r.sprite(BACK_CUT, baseX, baseY + 2, HERO_PAL);
        if (this.t < 9) {
          const arc = SLASH_ARC;
          const pal = this.t & 1 ? [C.WHITE, 0x31, C.WHITE] : [0x31, C.WHITE, 0x21];
          r.sprite(arc, 128 - arc.w / 2, VIEW.y + 62, pal);
        }
      }
    } else {
      const walking = this.mode === 'walk';
      const sprite = walking ? BACK_WALK[this.walkFrame] : BACK_STAND;
      const breathe = !walking && (this.game.frame >> 5) & 1 ? 1 : 0;
      r.sprite(sprite, baseX, baseY + breathe - (walking ? 1 : 0), HERO_PAL);
    }
    r.unclip();
  }

  private drawFrame(r: PixelRenderer): void {
    // Stone frame around the view window.
    const x = VIEW.x - 4, y = VIEW.y - 4, w = VIEW.w + 8, h = VIEW.h + 8;
    r.rect(x, y, w, 4, 0x00);
    r.rect(x, y + h - 4, w, 4, 0x00);
    r.rect(x, y, 4, h, 0x00);
    r.rect(x + w - 4, y, 4, h, 0x00);
    for (let i = x; i < x + w; i += 8) {
      r.pset(i, y + 1, 0x10);
      r.pset(i + 4, y + h - 2, 0x10);
    }
    for (let j = y; j < y + h; j += 8) {
      r.pset(x + 1, j, 0x10);
      r.pset(x + w - 2, j + 4, 0x10);
    }
    r.frame(x, y, w, h, C.BLACK);
    r.frame(VIEW.x - 1, VIEW.y - 1, VIEW.w + 2, VIEW.h + 2, C.BLACK);
    // Compass plate
    const s = this.game.state;
    const zh = isZh();
    r.rect(120, y - (zh ? 4 : 2), 16, zh ? 14 : 10, C.BLACK);
    r.frame(120, y - (zh ? 4 : 2), 16, zh ? 14 : 10, 0x10);
    r.text(hasItem(s, 'compass') ? t(DIR_NAMES[this.dir]) : '?', zh && hasItem(s, 'compass') ? 122 : 124, y, hasItem(s, 'compass') ? C.GOLD : C.GRAY);
  }
}
