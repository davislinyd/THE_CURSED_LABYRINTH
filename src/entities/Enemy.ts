import type { SfxName } from '../audio/SoundEffects';
import {
  BAT, BONE, CROW, FIREBALL, GHOUL, HOPPER, ONE_EYE, ONI, ORB, SKELETON, SPEARMAN, TALISMAN, WISP_S, WRAITH,
} from '../data/sprites/actors';
import { WAVE } from '../data/sprites/bosses';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { Sprite } from '../graphics/Sprite';
import { Body, groundAhead, moveBody, StageMap } from '../world/StageMap';
import { Player, Rect } from './Player';

export type EnemyKind =
  | 'ghoul' | 'wisp' | 'crow' | 'skeleton' | 'bat' | 'hopper' | 'wraith' | 'spearman' | 'oneeye' | 'oni';

export interface EnemyDef {
  hp: number;
  dmg: number;
  exp: number;
  gold: number;
  w: number;
  h: number;
  frames: Sprite[];
  pal: number[];
  fly?: boolean;
  heavy?: boolean; // no knockback
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  ghoul: { hp: 2, dmg: 2, exp: 1, gold: 2, w: 14, h: 30, frames: GHOUL, pal: [C.BLACK, 0x17, 0x2a] },
  wisp: { hp: 1, dmg: 1, exp: 1, gold: 1, w: 12, h: 10, frames: WISP_S, pal: [0x01, 0x21, 0x30], fly: true },
  crow: { hp: 1, dmg: 2, exp: 1, gold: 2, w: 14, h: 12, frames: CROW, pal: [C.BLACK, 0x00, 0x27], fly: true },
  skeleton: { hp: 4, dmg: 2, exp: 2, gold: 4, w: 14, h: 42, frames: SKELETON, pal: [C.BLACK, 0x30, 0x17] },
  bat: { hp: 1, dmg: 1, exp: 1, gold: 1, w: 12, h: 10, frames: BAT, pal: [C.BLACK, 0x06, 0x16], fly: true },
  hopper: { hp: 2, dmg: 1, exp: 1, gold: 1, w: 14, h: 11, frames: HOPPER, pal: [C.BLACK, 0x08, 0x28] },
  wraith: { hp: 3, dmg: 2, exp: 2, gold: 3, w: 16, h: 28, frames: WRAITH, pal: [C.BLACK, 0x13, 0x38], fly: true },
  spearman: { hp: 5, dmg: 3, exp: 3, gold: 5, w: 14, h: 42, frames: SPEARMAN, pal: [C.BLACK, 0x10, 0x0c] },
  oneeye: { hp: 3, dmg: 2, exp: 2, gold: 3, w: 14, h: 28, frames: ONE_EYE, pal: [C.BLACK, 0x37, 0x16] },
  oni: { hp: 14, dmg: 4, exp: 8, gold: 20, w: 28, h: 62, frames: ONI, pal: [C.BLACK, 0x16, 0x28], heavy: true },
};

export const SPAWN_KIND: Record<string, EnemyKind> = {
  g: 'ghoul', w: 'wisp', c: 'crow', k: 'skeleton', b: 'bat', h: 'hopper', r: 'wraith', s: 'spearman', o: 'oneeye', n: 'oni',
};

// ---- Shots ------------------------------------------------------------------

export type ShotKind = 'fire' | 'bone' | 'wave' | 'orb' | 'talisman';

export interface Shot {
  kind: ShotKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  friendly: boolean;
  gravity?: number;
  life: number;
  pierce?: boolean;
  hits?: Set<object>;
}

export const SHOT_SIZE: Record<ShotKind, [number, number]> = {
  fire: [6, 6], bone: [6, 6], wave: [8, 10], orb: [6, 6], talisman: [8, 5],
};

export function shotBox(s: Shot): Rect {
  const [w, h] = SHOT_SIZE[s.kind];
  return { x: s.x - w / 2, y: s.y - h / 2, w, h };
}

export function drawShot(r: PixelRenderer, s: Shot, camX: number, top: number, frame: number, pal?: number[]): void {
  const x = Math.round(s.x - camX), y = Math.round(s.y) + top;
  const f = (frame >> 2) & 1;
  switch (s.kind) {
    case 'fire':
      r.sprite(FIREBALL[f], x - 4, y - 4, pal ?? [0x06, 0x16, 0x27]);
      break;
    case 'bone':
      r.sprite(BONE[f], x - 4, y - 3, [C.BLACK, 0x30]);
      break;
    case 'wave':
      r.sprite(WAVE[f], x - 4, y - 5, pal ?? [C.BLACK, 0x16, 0x27], s.vx > 0);
      break;
    case 'orb':
      r.sprite(ORB, x - 3, y - 3, pal ?? [0x03, 0x13, 0x33]);
      break;
    case 'talisman':
      r.sprite(TALISMAN, x - 4, y - 2, [C.BLACK, 0x37, 0x16], s.vx < 0);
      break;
  }
}

// ---- Enemy -------------------------------------------------------------------

export interface Arena {
  map: StageMap;
  player: Player;
  frame: number;
  shoot(s: Shot): void;
  sfx(n: SfxName): void;
  shake(frames: number): void;
}

const FLASH = [C.WHITE, C.WHITE, C.WHITE];

export class Enemy {
  readonly def: EnemyDef;
  readonly body: Body;
  hp: number;
  dir = -1;
  t = 0;
  phase = 0; // AI state
  frame = 0;
  flash = 0;
  dead = false;
  lastSwing = -1;
  lastShot: object | null = null;
  homeY: number;

  constructor(readonly kind: EnemyKind, x: number, y: number, readonly spawnId = -1, private readonly seed = 0) {
    this.def = ENEMY_DEFS[kind];
    this.hp = this.def.hp;
    this.body = { x, y, vx: 0, vy: 0, w: this.def.w, h: this.def.h, onGround: false };
    this.homeY = y;
    this.t = seed * 13;
  }

  hurtbox(): Rect {
    const b = this.body;
    return { x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h };
  }

  /** Weapon reach beyond the body (pickaxe, spear, club), when swinging. */
  attackbox(): Rect | null {
    const b = this.body;
    const front = (w: number) => (this.dir > 0 ? b.x + b.w / 2 : b.x - b.w / 2 - w);
    if (this.kind === 'skeleton' && this.phase === 2) return { x: front(18), y: b.y - 34, w: 18, h: 30 };
    if (this.kind === 'spearman' && this.phase === 2) return { x: front(34), y: b.y - 32, w: 34, h: 6 };
    if (this.kind === 'oni' && this.phase === 2 && this.t < 10) return { x: front(30), y: b.y - 40, w: 30, h: 40 };
    return null;
  }

  /** Returns true when the hit landed (killed or hurt). */
  hit(dmg: number, fromX: number): boolean {
    this.hp -= dmg;
    this.flash = 8;
    if (!this.def.heavy) {
      const away = this.body.x < fromX ? -1 : 1;
      this.body.vx = away * 2;
      if (!this.def.fly) this.body.vy = Math.min(this.body.vy, -1.5);
    }
    if (this.hp <= 0) this.dead = true;
    return true;
  }

  update(a: Arena): void {
    this.t++;
    if (this.flash > 0) this.flash--;
    const b = this.body, p = a.player;
    const dx = p.x - b.x, adx = Math.abs(dx);
    const face = () => (this.dir = dx > 0 ? 1 : -1);
    const knock = this.flash > 4;
    switch (this.kind) {
      case 'ghoul': {
        if (!knock) {
          face();
          b.vx = adx < 180 ? this.dir * 0.45 : 0;
          if (b.onGround && !groundAhead(a.map, b, this.dir)) b.vx = 0;
        }
        moveBody(a.map, b);
        if (!knock) b.vx = 0;
        this.frame = (this.t >> 4) & 1;
        break;
      }
      case 'wisp': {
        face();
        b.x += Math.sign(dx) * 0.55;
        const ty = p.y - 30 + Math.sin((this.t + this.seed * 20) * 0.06) * 18;
        b.y += Math.sign(ty - b.y) * 0.5;
        this.frame = (this.t >> 3) & 1;
        break;
      }
      case 'crow': {
        // perch, then swoop at where the hero stood, then climb away
        if (this.phase === 0) {
          face();
          if (adx < 110) {
            this.phase = 1;
            const dy = p.y - 24 - b.y;
            const d = Math.hypot(dx, dy) || 1;
            b.vx = (dx / d) * 2.4;
            b.vy = (dy / d) * 2.4;
            a.sfx('throw');
          }
        } else if (this.phase === 1) {
          b.x += b.vx;
          b.y += b.vy;
          if (b.y >= p.y - 22 || this.t > 400) {
            this.phase = 2;
            b.vy = -1.6;
          }
        } else {
          b.x += b.vx;
          b.y += b.vy;
        }
        this.dir = b.vx > 0 ? 1 : b.vx < 0 ? -1 : this.dir;
        this.frame = this.phase === 0 ? 0 : (this.t >> 2) & 1;
        break;
      }
      case 'skeleton': {
        // walk in, wind up the pick (1), swing (2); lob bones from range (3)
        if (this.phase === 0) {
          face();
          b.vx = knock ? b.vx : this.dir * 0.5;
          if (b.onGround && !groundAhead(a.map, b, this.dir)) b.vx = 0;
          if (adx < 34 && !knock) this.go(1);
          else if (adx > 60 && adx < 150 && this.t > 110) this.go(3);
          this.frame = (this.t >> 4) & 1;
        } else if (this.phase === 1) {
          b.vx = 0;
          this.frame = 0;
          if (this.t > 22) {
            this.go(2);
            a.sfx('slash');
          }
        } else if (this.phase === 2) {
          this.frame = 1;
          if (this.t > 16) this.go(0);
        } else {
          b.vx = 0;
          this.frame = 0;
          if (this.t === 14) {
            a.shoot({ kind: 'bone', x: b.x, y: b.y - 44, vx: this.dir * 1.4, vy: -3.6, gravity: 0.15, dmg: 2, friendly: false, life: 160 });
            a.sfx('throw');
          }
          if (this.t > 30) this.go(0);
        }
        moveBody(a.map, b);
        if (knock === false && this.phase !== 0) b.vx = 0;
        break;
      }
      case 'bat': {
        if (this.phase === 0) {
          this.frame = 0;
          if (adx < 100) this.go(1);
        } else {
          face();
          b.x += this.dir * 1.1;
          b.y += Math.sin(this.t * 0.18) * 2 + Math.sign(p.y - 26 - b.y) * 0.4;
          this.frame = (this.t >> 2) & 1;
        }
        break;
      }
      case 'hopper': {
        if (b.onGround && !knock) {
          b.vx = 0;
          this.frame = 0;
          if (this.t > 46) {
            face();
            b.vy = -3.4;
            b.vx = this.dir * 1.1;
            this.t = 0;
          }
        } else this.frame = 1;
        moveBody(a.map, b);
        break;
      }
      case 'wraith': {
        // drift at a wary distance, fade out and in, cast fire when solid
        face();
        const want = p.x - this.dir * 84;
        b.x += Math.sign(want - b.x) * 0.5;
        b.y = this.homeY - 20 + Math.sin(this.t * 0.04) * 10;
        const cyc = this.t % 180;
        this.phase = cyc < 40 ? 1 : 0; // 1 = faded (untouchable)
        if (cyc === 120) {
          const dy = p.y - 24 - (b.y - 16);
          const d = Math.hypot(dx, dy) || 1;
          a.shoot({ kind: 'fire', x: b.x, y: b.y - 16, vx: (dx / d) * 1.6, vy: (dy / d) * 1.6, dmg: 2, friendly: false, life: 200 });
          a.sfx('shoot');
        }
        this.frame = (this.t >> 4) & 1;
        break;
      }
      case 'spearman': {
        if (this.phase === 0) {
          face();
          b.vx = knock ? b.vx : this.dir * 0.4;
          if (b.onGround && !groundAhead(a.map, b, this.dir)) b.vx = 0;
          if (adx < 58 && !knock) this.go(1);
          this.frame = 0;
        } else if (this.phase === 1) {
          b.vx = 0;
          this.frame = 0;
          if (this.t > 26) {
            this.go(2);
            a.sfx('slash');
          }
        } else if (this.phase === 2) {
          b.vx = this.t < 6 ? this.dir * 1.2 : 0;
          this.frame = 1;
          if (this.t > 20) this.go(3);
        } else {
          b.vx = -this.dir * 0.5;
          this.frame = 0;
          if (b.onGround && !groundAhead(a.map, b, -this.dir)) b.vx = 0;
          if (this.t > 24) this.go(0);
        }
        moveBody(a.map, b);
        break;
      }
      case 'oneeye': {
        if (b.onGround && !knock) {
          b.vx = 0;
          this.frame = 0;
          if (this.t > 64) {
            face();
            b.vy = -5;
            b.vx = this.dir * 1.3;
            this.t = 0;
            a.sfx('jump');
          }
        } else this.frame = 1;
        moveBody(a.map, b);
        break;
      }
      case 'oni': {
        if (this.phase === 0) {
          face();
          b.vx = this.dir * 0.35;
          if (b.onGround && !groundAhead(a.map, b, this.dir)) b.vx = 0;
          if (adx < 74 && this.t > 30) this.go(1);
          this.frame = 0;
        } else if (this.phase === 1) {
          b.vx = 0;
          this.frame = 0;
          if (this.t > 34) {
            this.go(2);
            a.shake(10);
            a.sfx('explode');
            for (const d of [-1, 1]) {
              a.shoot({ kind: 'wave', x: b.x + d * 30, y: b.y - 5, vx: d * 1.8, vy: 0, dmg: 3, friendly: false, life: 90 });
            }
          }
        } else {
          b.vx = 0;
          this.frame = 1;
          if (this.t > 40) this.go(0);
        }
        moveBody(a.map, b);
        break;
      }
    }
  }

  private go(phase: number): void {
    this.phase = phase;
    this.t = 0;
  }

  /** Untouchable right now (faded wraith)? */
  get intangible(): boolean {
    return this.kind === 'wraith' && this.phase === 1;
  }

  draw(r: PixelRenderer, camX: number, top: number, frameNo: number): void {
    if (this.intangible && frameNo & 1) return;
    const spr = this.def.frames[this.frame] ?? this.def.frames[0];
    const b = this.body;
    const flip = this.dir > 0; // art faces left
    const x = Math.round(b.x - camX - spr.w / 2);
    const y = Math.round(b.y) + top - spr.h;
    r.sprite(spr, x, y, this.flash > 0 && (this.flash & 2) ? FLASH : this.def.pal, flip, 2);
  }
}
