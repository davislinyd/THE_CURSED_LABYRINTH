import { GameState, swordDamage, swordReach } from '../core/GameState';
import { InputManager } from '../core/InputManager';
import { HERO, HERO_AX, HERO_AY, HERO_PAL } from '../data/sprites/hero';
import { SLASH } from '../data/sprites/actors';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { Sprite } from '../graphics/Sprite';
import { Body, feetTiles, moveBody, StageMap, TILE } from '../world/StageMap';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const WALK = 1.25;
const JUMP_V = -5;
// Attack timeline (frames): windup, strike (high cut), follow-through (low cut), recover.
const ATK_WIND = 4, ATK_HIGH = 10, ATK_LOW = 15, ATK_END = 18;
const FLASH_PAL = [C.WHITE, C.WHITE, C.WHITE, C.WHITE, C.WHITE, C.WHITE, C.WHITE, C.WHITE];

export type PlayerState = 'normal' | 'attack' | 'hurt' | 'dead';

export class Player {
  readonly body: Body = { x: 0, y: 0, vx: 0, vy: 0, w: 12, h: 40, onGround: false };
  facing = 1;
  state: PlayerState = 'normal';
  t = 0;
  invuln = 0;
  swing = 0; // increments every attack so one cut hits each enemy once
  private walkT = 0;
  private itemCooldown = 0;
  /** Set by the scene when B+UP asks for the current item. */
  wantsItem = false;

  constructor(x: number, y: number) {
    this.body.x = x;
    this.body.y = y;
  }

  get x(): number {
    return this.body.x;
  }
  get y(): number {
    return this.body.y;
  }

  hurtbox(): Rect {
    const b = this.body;
    return { x: b.x - 5, y: b.y - 38, w: 10, h: 36 };
  }

  /** Active sword hitbox, if the blade is cutting this frame. */
  swordBox(s: GameState): Rect | null {
    if (this.state !== 'attack') return null;
    const reach = swordReach(s);
    const b = this.body;
    if (this.t >= ATK_WIND && this.t < ATK_HIGH) {
      const w = 18 + reach;
      return { x: this.facing > 0 ? b.x + 4 : b.x - 4 - w, y: b.y - 42, w, h: 26 };
    }
    if (this.t >= ATK_HIGH && this.t < ATK_LOW) {
      const w = 10 + reach;
      return { x: this.facing > 0 ? b.x + 4 : b.x - 4 - w, y: b.y - 26, w, h: 26 };
    }
    return null;
  }

  damage(s: GameState): number {
    return swordDamage(s);
  }

  update(inp: InputManager, m: StageMap): void {
    const b = this.body;
    this.t++;
    if (this.invuln > 0) this.invuln--;
    if (this.itemCooldown > 0) this.itemCooldown--;
    this.wantsItem = false;

    if (this.state === 'dead') {
      b.vx = 0;
      moveBody(m, b);
      return;
    }
    if (this.state === 'hurt') {
      moveBody(m, b);
      if (this.t > 18 && b.onGround) this.setState('normal');
      return;
    }

    const left = inp.held('left'), right = inp.held('right');
    if (this.state === 'attack') {
      if (b.onGround) b.vx = 0; // planted feet; in the air momentum carries on
      if (this.t >= ATK_END) this.setState('normal');
    }
    if (this.state === 'normal') {
      if (left !== right) {
        this.facing = left ? -1 : 1;
        b.vx = this.facing * WALK;
      } else b.vx = 0;
      if (inp.pressed('a') && b.onGround) {
        b.vy = JUMP_V;
        b.onGround = false;
      }
      if (inp.pressed('b')) {
        if (inp.held('up') && this.itemCooldown === 0) {
          this.wantsItem = true;
          this.itemCooldown = 20;
        } else {
          this.setState('attack');
          this.swing++;
        }
      }
    }
    moveBody(m, b);
    if (b.onGround) {
      const [x0, x1, ty] = feetTiles(b);
      for (let tx = x0; tx <= x1; tx++) m.stepOn(tx, ty);
    }
    if (b.vx !== 0 && b.onGround) this.walkT++;
    else this.walkT = 0;
  }

  /** Feet resting on spikes? */
  onSpikes(m: StageMap): boolean {
    const b = this.body;
    if (!b.onGround) return false;
    const [x0, x1, ty] = feetTiles(b);
    // only when the centre column is over spikes, so ledge edges are forgiving
    const cx = Math.floor(b.x / TILE);
    return cx >= x0 && cx <= x1 && m.tile(cx, ty) === '^';
  }

  hurt(dmg: number, fromX: number, s: GameState): boolean {
    if (this.invuln > 0 || this.state === 'dead') return false;
    s.life = Math.max(0, s.life - dmg);
    const b = this.body;
    const away = fromX > b.x ? -1 : 1;
    b.vx = away * 1.5;
    b.vy = -2.5;
    b.onGround = false;
    this.invuln = 80;
    this.setState(s.life <= 0 ? 'dead' : 'hurt');
    if (s.life <= 0) {
      b.vx = 0;
      b.vy = -3;
    }
    return true;
  }

  setState(st: PlayerState): void {
    this.state = st;
    this.t = 0;
  }

  private frame(): Sprite {
    const b = this.body;
    switch (this.state) {
      case 'dead':
        return this.t > 20 ? HERO.dead : HERO.hurt;
      case 'hurt':
        return HERO.hurt;
      case 'attack':
        return this.t < ATK_WIND ? HERO.atk[0] : this.t < ATK_HIGH ? HERO.atk[1] : HERO.atk[2];
    }
    if (!b.onGround) return HERO.jump;
    if (b.vx !== 0) return HERO.walk[Math.floor(this.walkT / 8) & 3];
    return HERO.stand;
  }

  draw(r: PixelRenderer, camX: number, top: number, s: GameState): void {
    // Invulnerability flicker, the FC way: skip drawing on alternate frames.
    if (this.invuln > 0 && this.state !== 'dead' && (this.invuln >> 1) & 1) return;
    const spr = this.frame();
    const flip = this.facing < 0;
    const sx = Math.round(this.body.x - camX) - (flip ? spr.w - 1 - HERO_AX : HERO_AX);
    const sy = Math.round(this.body.y) + top - HERO_AY - 1;
    const pal = this.state === 'hurt' && this.t < 4 ? FLASH_PAL : HERO_PAL;
    r.sprite(spr, sx, sy, pal, flip);
    // Blade trail on the cutting frames.
    if (this.state === 'attack' && this.t >= ATK_WIND && this.t < ATK_WIND + 3) {
      const lv = Math.min(2, Math.floor((swordReach(s) - 18) / 4));
      const sl = SLASH[lv];
      const x = Math.round(this.body.x - camX) + (flip ? -10 - sl.w : 10);
      r.sprite(sl, x, Math.round(this.body.y) + top - 35, [0x31, C.WHITE, C.WHITE], flip);
    }
  }
}
