import type { Game } from '../core/Game';
import { hasItem } from '../core/GameState';
import { Scene } from '../core/SceneManager';
import { CHAPTER_STAGE, STAGES } from '../data/levels/stages';
import { DUNGEONS } from '../data/levels/dungeons';
import { BARRIERS, ENTRANCE_DUNGEON, SHRINES, SPIRITS, TOWNS, WORLD_H, WORLD_MAP, WORLD_W } from '../data/levels/world';
import { WISP_S } from '../data/sprites/actors';
import { HERO_PAL, MINI_DOWN, MINI_SIDE, MINI_UP } from '../data/sprites/hero';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { drawWorldTile } from '../graphics/WorldTiles';
import { drawHUD } from '../ui/HUD';
import { MessageBox } from '../ui/Window';
import { t } from '../i18n';
import { TownScene } from './TownScene';

const TOP = 32;
const STEP_FRAMES = 8;
const WALKABLE = new Set(['.', ',', 't', 'r', '=', 'V', 'v', 'S', '1', '2', '3', '4']);
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

interface Spirit {
  id: string;
  hx: number;
  hy: number;
  x: number;
  y: number;
  px: number; // previous tile, for the slide
  py: number;
  t: number;
  group: string;
}

export class WorldScene implements Scene {
  readonly playTime = true;
  private x: number;
  private y: number;
  private dir = 2;
  private moving = 0; // frames left in the current step
  private walkT = 0;
  private bumpCD = 0;
  private msg = new MessageBox(28, 3);
  private after: (() => void) | null = null;
  private prompt: { yes: () => void; cursor: number } | null = null;
  private spirits: Spirit[] = [];
  private frame = 0;
  private leaving = false;
  private seed = 1;

  constructor(private readonly game: Game) {
    const loc = game.state.location;
    if (loc.mode === 'world') {
      this.x = loc.x;
      this.y = loc.y;
    } else {
      this.x = 6;
      this.y = 25;
    }
    SPIRITS.forEach((sp, i) => {
      const id = `spirit:${i}`;
      if (game.spiritsBeaten.has(id)) return;
      if (Math.abs(sp.x - this.x) + Math.abs(sp.y - this.y) < 6) return; // never ambush on arrival
      this.spirits.push({ id, hx: sp.x, hy: sp.y, x: sp.x, y: sp.y, px: sp.x, py: sp.y, t: i * 11, group: sp.group });
    });
  }

  get pausable(): boolean {
    return !this.msg.active && !this.leaving && this.moving === 0;
  }

  enter(): void {
    this.game.music('WORLD');
  }

  resume(): void {
    this.game.audio.resumeMusic();
  }

  private tile(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return 'M';
    const ch = WORLD_MAP[y][x];
    const s = this.game.state;
    if (ch === 'a' && s.flags['barrier:a']) return ',';
    if (ch === 'b' && s.flags['barrier:b']) return '=';
    if (ch === 'c' && s.flags['barrier:c']) return ',';
    return ch;
  }

  private say(text: string, then?: () => void): void {
    this.msg.set(text);
    this.after = then ?? null;
  }

  private ask(text: string, yes: () => void): void {
    this.msg.set(text);
    this.msg.update(true);
    this.prompt = { yes, cursor: 0 };
  }

  private rand(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed >> 8;
  }

  update(): void {
    this.frame++;
    if (this.leaving) return;
    const g = this.game, inp = g.input;
    if (this.bumpCD > 0) this.bumpCD--;

    if (this.msg.active) {
      if (this.prompt) {
        this.msg.update(true);
        if (inp.pressed('left') || inp.pressed('right') || inp.pressed('up') || inp.pressed('down')) {
          this.prompt.cursor ^= 1;
          g.sfx('cursor');
        }
        if (inp.pressed('a') || inp.pressed('start')) {
          const p = this.prompt;
          this.prompt = null;
          this.msg.clear();
          if (p.cursor === 0) {
            g.sfx('confirm');
            p.yes();
          } else g.sfx('cancel');
        } else if (inp.pressed('b')) {
          this.prompt = null;
          this.msg.clear();
          g.sfx('cancel');
        }
        return;
      }
      if (this.msg.update(inp.held('a') || inp.held('b'))) g.sfx('text');
      if (inp.pressed('a') || inp.pressed('b') || inp.pressed('start')) {
        if (!this.msg.advance()) {
          const f = this.after;
          this.after = null;
          f?.();
        }
      }
      return;
    }

    this.updateSpirits();
    if (this.leaving) return;

    if (this.moving > 0) {
      this.moving--;
      this.walkT++;
      if (this.moving === 0) this.arrive();
      return;
    }
    const dirs: [string, number][] = [['up', 0], ['right', 1], ['down', 2], ['left', 3]];
    for (const [b, d] of dirs) {
      if (inp.held(b as 'up')) {
        this.dir = d;
        this.tryMove(d);
        break;
      }
    }
  }

  private tryMove(d: number): void {
    const g = this.game, s = g.state;
    const nx = this.x + DX[d], ny = this.y + DY[d];
    const ch = this.tile(nx, ny);
    const barrier = BARRIERS[ch];
    if (barrier) {
      if (barrier.need.every((k) => hasItem(s, k))) {
        s.flags[`barrier:${ch}`] = true;
        g.sfx('mechanism');
        g.scenes.flash(new Uint8Array(64).fill(0x30), 4);
        this.say(t(barrier.opened));
      } else {
        g.sfx('locked');
        this.say(t(barrier.closed));
      }
      return;
    }
    if (!WALKABLE.has(ch)) {
      if (this.bumpCD === 0) {
        g.sfx('bump');
        this.bumpCD = 16;
      }
      return;
    }
    this.x = nx;
    this.y = ny;
    this.moving = STEP_FRAMES;
    s.stats.steps++;
  }

  private arrive(): void {
    const g = this.game, s = g.state;
    s.location = { mode: 'world', x: this.x, y: this.y };
    const ch = this.tile(this.x, this.y);
    if (TOWNS[ch]) {
      g.sfx('door');
      this.leaving = true;
      g.saveGame();
      g.scenes.change(new TownScene(g, ch, this.x, this.y));
      return;
    }
    if (ch === 'S') {
      g.sfx('heal');
      s.life = s.maxLife;
      s.checkpoint = { ...s.location };
      g.saveGame();
      this.say(t(SHRINES[`${this.x},${this.y}`] ?? 'A QUIET SHRINE. YOUR WOUNDS CLOSE.'));
      return;
    }
    const id = ENTRANCE_DUNGEON[ch];
    if (id) {
      const stage = CHAPTER_STAGE[id];
      const viaStage = stage && !s.flags[`stage:${stage}`];
      const name = viaStage ? STAGES[stage!].subtitle : DUNGEONS[id].name;
      this.ask(t('ENTER {0}?', t(name)), () => {
        this.leaving = true;
        if (viaStage) g.startStage(stage!);
        else g.enterDungeon(id);
      });
    }
  }

  private updateSpirits(): void {
    for (const sp of this.spirits) {
      sp.t++;
      if (sp.t % 48 === 0) {
        sp.px = sp.x;
        sp.py = sp.y;
        // drift toward the hero when close, otherwise wander near home
        const chase = this.frame > 120 && Math.abs(this.x - sp.x) + Math.abs(this.y - sp.y) < 4;
        const order = chase
          ? [0, 1, 2, 3].sort((a, b) => this.dist(sp, a) - this.dist(sp, b))
          : [this.rand() & 3];
        for (const d of order) {
          const nx = sp.x + DX[d], ny = sp.y + DY[d];
          const ch = this.tile(nx, ny);
          if (!'.,tr'.includes(ch) || Math.abs(nx - sp.hx) + Math.abs(ny - sp.hy) > 4) continue;
          sp.x = nx;
          sp.y = ny;
          break;
        }
      }
      if (sp.x === this.x && sp.y === this.y && !this.leaving) this.ambush(sp);
    }
  }

  private dist(sp: Spirit, d: number): number {
    return Math.abs(this.x - (sp.x + DX[d])) + Math.abs(this.y - (sp.y + DY[d]));
  }

  private ambush(sp: Spirit): void {
    const g = this.game;
    this.leaving = true;
    g.state.location = { mode: 'world', x: this.x, y: this.y };
    g.sfx('encounter');
    g.encounterFlash();
    g.startEncounter(sp.group, sp.id);
  }

  // ---- Draw ----

  private camera(): [number, number] {
    const slide = this.moving / STEP_FRAMES;
    const wx = (this.x - DX[this.dir] * slide) * 16, wy = (this.y - DY[this.dir] * slide) * 16;
    const cx = Math.max(0, Math.min(WORLD_W * 16 - 256, Math.round(wx) - 120));
    const cy = Math.max(0, Math.min(WORLD_H * 16 - 208, Math.round(wy) - 96));
    return [cx, cy];
  }

  draw(r: PixelRenderer): void {
    const s = this.game.state;
    const [cx, cy] = this.camera();
    const anim = this.frame >> 4;
    r.clip(0, TOP, 256, 208);
    const tx0 = Math.floor(cx / 16), ty0 = Math.floor(cy / 16);
    for (let ty = ty0; ty <= ty0 + 13; ty++)
      for (let tx = tx0; tx <= tx0 + 16; tx++) drawWorldTile(r, this.tile(tx, ty), tx * 16 - cx, ty * 16 - cy + TOP, anim);
    // spirits
    for (const sp of this.spirits) {
      const k = Math.min(1, (sp.t % 48) / 12);
      const px = (sp.px + (sp.x - sp.px) * k) * 16 - cx, py = (sp.py + (sp.y - sp.py) * k) * 16 - cy + TOP;
      const bob = Math.round(Math.sin((this.frame + sp.t) * 0.1) * 2);
      const pal = sp.group === 'w2' ? [0x06, 0x16, 0x37] : sp.group === 'w3' ? [0x03, 0x13, 0x33] : [0x01, 0x21, 0x30];
      r.sprite(WISP_S[(this.frame >> 3) & 1], Math.round(px), Math.round(py) + 2 + bob, pal, false, 2);
    }
    // hero
    const slide = this.moving / STEP_FRAMES;
    const hx = Math.round((this.x - DX[this.dir] * slide) * 16) - cx;
    const hy = Math.round((this.y - DY[this.dir] * slide) * 16) - cy + TOP - 8;
    const step = this.moving > 0 ? (this.walkT >> 3) & 1 : 0;
    const set = this.dir === 0 ? MINI_UP : this.dir === 2 ? MINI_DOWN : MINI_SIDE;
    r.sprite(set[step], hx, hy, HERO_PAL, this.dir === 3);
    r.unclip();
    drawHUD(r, s, { area: this.areaName() });
    if (this.msg.active) {
      this.msg.draw(r, 0, 196, 256, this.frame);
      if (this.prompt) {
        r.text(t('YES'), 64, 220, C.WHITE);
        r.text(t('NO'), 136, 220, C.WHITE);
        if ((this.frame >> 3) & 3) r.text('▶', this.prompt.cursor === 0 ? 52 : 124, 220, C.RED);
      }
    }
  }

  private areaName(): string {
    if (this.y <= 11) return t('NORTHERN WILDS');
    if (this.x >= 26) return t('MISTY PASS');
    return t('HAIYA PLAINS');
  }
}
