import {
  CENTI_HEAD, CENTI_SEG, HAND_FIST, HAND_OPEN, KING_CAST, KING_IDLE, MASK_OPEN, MASK_SHUT,
  ROOT_FACE_OPEN, ROOT_FACE_SHUT, ROOT_SPIKE, SKULL_OPEN, SKULL_SHUT,
} from '../data/sprites/bosses';
import { Arena } from '../entities/Enemy';
import { Rect } from '../entities/Player';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { Sprite } from '../graphics/Sprite';
import type { BossId } from '../world/DungeonMap';

export const FLOOR_Y = 160; // arena floor (row 10 top)
const WHITE = [C.WHITE, C.WHITE, C.WHITE];

export abstract class Boss {
  /** Short name for the status bar, and the full title for the banner. */
  abstract readonly name: string;
  abstract readonly title: string;
  hp: number;
  t = 0;
  flash = 0;
  contactDmg = 3;

  constructor(public max: number) {
    this.hp = max;
  }

  abstract update(a: Arena): void;
  abstract draw(r: PixelRenderer, top: number, frame: number): void;
  /** Where the sword deals damage. */
  abstract hurtboxes(): Rect[];
  /** Parts that hurt on touch. */
  abstract attackboxes(): Rect[];
  /** Parts that deflect the sword with a clang. */
  armorboxes(): Rect[] {
    return [];
  }

  hit(dmg: number): void {
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 10;
  }

  /** Bosses with a second form return true once while transforming. */
  get finished(): boolean {
    return this.hp <= 0;
  }

  /** Centre of the last hurtbox, for the death explosions. */
  centre(): { x: number; y: number } {
    const h = this.hurtboxes()[0] ?? { x: 112, y: 80, w: 32, h: 32 };
    return { x: h.x + h.w / 2, y: h.y + h.h / 2 };
  }

  protected pal(p: number[]): number[] {
    return this.flash > 0 && this.flash & 2 ? WHITE : p;
  }

  protected tick(): void {
    this.t++;
    if (this.flash > 0) this.flash--;
  }
}

const aim = (fx: number, fy: number, tx: number, ty: number, speed: number) => {
  const dx = tx - fx, dy = ty - fy, d = Math.hypot(dx, dy) || 1;
  return { vx: (dx / d) * speed, vy: (dy / d) * speed };
};

// ---- I. Rotroot Elder: a demon face grown into a dead cedar ---------------------

class Rotroot extends Boss {
  readonly name = 'ROTROOT';
  readonly title = 'THE ROTROOT ELDER';
  private open = 0;
  private spikes: { x: number; t: number }[] = [];
  private readonly FX = 200;
  private readonly PAL = [0x08, 0x18, 0x2a];

  constructor() {
    super(20);
  }

  update(a: Arena): void {
    this.tick();
    const angry = this.hp <= 10;
    const cycle = angry ? 150 : 200;
    const c = this.t % cycle;
    // mouth opens and spits a fan of seeds
    this.open = c >= cycle - 70 && c < cycle - 10 ? 1 : 0;
    if (c === cycle - 50 || (angry && c === cycle - 30)) {
      a.sfx('shoot');
      for (const vx of [-1.2, -1.9, -2.6]) {
        a.shoot({ kind: 'fire', x: this.FX, y: 132, vx, vy: -3.2, gravity: 0.12, dmg: 2, friendly: false, life: 200 });
      }
    }
    // roots erupt under the hero after a rumble
    if (c === 20 || (angry && c === 90)) this.spikes.push({ x: a.player.x, t: 0 });
    for (const s of this.spikes) {
      s.t++;
      if (s.t === 40) {
        a.sfx('trap');
        a.shake(6);
      }
    }
    this.spikes = this.spikes.filter((s) => s.t < 90);
  }

  hurtboxes(): Rect[] {
    return this.open ? [{ x: this.FX - 4, y: 112, w: 36, h: 36 }] : [];
  }

  armorboxes(): Rect[] {
    return this.open ? [] : [{ x: this.FX - 4, y: 112, w: 36, h: 36 }];
  }

  attackboxes(): Rect[] {
    const out: Rect[] = [{ x: this.FX + 4, y: 0, w: 60, h: FLOOR_Y }];
    for (const s of this.spikes) if (s.t >= 40 && s.t < 80) out.push({ x: s.x - 5, y: FLOOR_Y - 22, w: 10, h: 22 });
    return out;
  }

  centre() {
    return { x: this.FX + 16, y: 130 };
  }

  draw(r: PixelRenderer, top: number, frame: number): void {
    // trunk
    for (let x = this.FX - 6; x < 256; x++) {
      const edge = x === this.FX - 6;
      const c = edge ? C.BLACK : (x * 7 + ((x >> 2) & 3)) % 9 === 0 ? 0x08 : 0x18;
      r.vline(x, top, top + FLOOR_Y - 1, c);
    }
    for (let y = top; y < top + FLOOR_Y; y += 6) r.hline(this.FX, 255, y + ((y >> 3) & 3), 0x08);
    const face: Sprite = this.open ? ROOT_FACE_OPEN : ROOT_FACE_SHUT;
    r.sprite(face, this.FX, top + 148 - face.h, this.pal(this.PAL));
    // root spikes: rumble dust, then the spike
    for (const s of this.spikes) {
      const x = Math.round(s.x);
      if (s.t < 40) {
        if (frame & 2) for (let i = -6; i <= 6; i += 3) r.pset(x + i, top + FLOOR_Y - 1 - ((i + frame) & 1), 0x18);
      } else if (s.t < 80) {
        const rise = Math.min(22, (s.t - 40) * 4);
        r.clip(0, top, 256, FLOOR_Y);
        r.sprite(ROOT_SPIKE, x - 6, top + FLOOR_Y - rise, this.PAL);
        r.unclip();
      }
    }
  }
}

// ---- II. Crimson Centipede: weaves through the air, armoured but for its head ----

class Centipede extends Boss {
  readonly name = 'MUKADE';
  readonly title = 'CRIMSON MUKADE';
  private trail: { x: number; y: number }[] = [];
  private hx = 200;
  private hy = 60;
  private readonly PAL = [C.BLACK, 0x16, 0x27];

  constructor() {
    super(26);
  }

  private get segs(): number {
    return 3 + Math.ceil((this.hp / this.max) * 7);
  }

  update(a: Arena): void {
    this.tick();
    const sp = this.hp <= 13 ? 1.5 : 1;
    const t = this.t * sp;
    // swoop low every cycle so it can be struck from the ground
    this.hx = 128 + Math.sin(t * 0.011) * 104;
    this.hy = 92 + Math.sin(t * 0.023) * 36 + Math.max(0, Math.sin(t * 0.007)) * 34;
    this.trail.unshift({ x: this.hx, y: this.hy });
    if (this.trail.length > 120) this.trail.pop();
    if (this.t % (this.hp <= 13 ? 80 : 120) === 60) {
      a.sfx('shoot');
      const v = aim(this.hx, this.hy, a.player.x, a.player.y - 20, 1.8);
      a.shoot({ kind: 'fire', x: this.hx, y: this.hy, ...v, dmg: 2, friendly: false, life: 200 });
    }
  }

  private segPos(i: number) {
    return this.trail[Math.min(this.trail.length - 1, (i + 1) * 10)] ?? { x: this.hx, y: this.hy };
  }

  hurtboxes(): Rect[] {
    return [{ x: this.hx - 9, y: this.hy - 7, w: 18, h: 14 }];
  }

  armorboxes(): Rect[] {
    const out: Rect[] = [];
    for (let i = 0; i < this.segs; i++) {
      const p = this.segPos(i);
      out.push({ x: p.x - 8, y: p.y - 5, w: 16, h: 10 });
    }
    return out;
  }

  attackboxes(): Rect[] {
    return [...this.hurtboxes(), ...this.armorboxes()];
  }

  draw(r: PixelRenderer, top: number, frame: number): void {
    for (let i = this.segs - 1; i >= 0; i--) {
      const p = this.segPos(i);
      const s = CENTI_SEG[(frame >> 3) & 1];
      r.sprite(s, Math.round(p.x) - 8, Math.round(p.y) + top - 5, this.pal(this.PAL), false, 2);
    }
    const prev = this.trail[4] ?? { x: this.hx };
    const h = CENTI_HEAD[(frame >> 4) & 1];
    r.sprite(h, Math.round(this.hx) - 8, Math.round(this.hy) + top - 6, this.pal(this.PAL), this.hx > prev.x, 2);
  }
}

// ---- III. Gashadokuro: a starving giant skeleton; strike its hands and its jaw ----

interface Hand {
  side: number;
  x: number;
  y: number;
  st: 'hover' | 'aim' | 'slam' | 'rest' | 'rise';
  t: number;
  tx: number;
}

class Gashadokuro extends Boss {
  readonly name = 'DOKURO';
  readonly title = 'GASHADOKURO';
  private sx = 112;
  private sy = 24;
  private mouth = 0;
  private dive = 0;
  private hands: Hand[] = [
    { side: -1, x: 40, y: 70, st: 'hover', t: 0, tx: 0 },
    { side: 1, x: 200, y: 70, st: 'hover', t: 60, tx: 0 },
  ];
  private readonly PAL = [C.BLACK, 0x30, 0x16];

  constructor() {
    super(30);
  }

  update(a: Arena): void {
    this.tick();
    const fast = this.hp <= 15;
    // skull bobs; every so often it lunges low with its jaw open
    const cyc = this.t % 420;
    if (cyc > 300 && cyc < 380) {
      this.dive = Math.min(1, this.dive + 0.04);
    } else this.dive = Math.max(0, this.dive - 0.03);
    this.sx = 112 + Math.sin(this.t * 0.01) * 40;
    this.sy = 22 + Math.sin(this.t * 0.05) * 4 + this.dive * 84;
    this.mouth = this.dive > 0.6 || cyc % 140 > 110 ? 1 : 0;
    if (cyc % 140 === 120) {
      a.sfx('shoot');
      for (const d of [-1, 0, 1]) {
        const v = aim(this.sx + 16, this.sy + 28, a.player.x + d * 40, FLOOR_Y, 1.7);
        a.shoot({ kind: 'fire', x: this.sx + 16, y: this.sy + 28, ...v, dmg: 2, friendly: false, life: 200 });
      }
    }
    for (const h of this.hands) {
      h.t++;
      const homeX = h.side < 0 ? 40 : 192;
      switch (h.st) {
        case 'hover':
          h.x += (homeX - h.x) * 0.05;
          h.y += (60 + Math.sin(this.t * 0.04 + h.side) * 6 - h.y) * 0.1;
          if (h.t > (fast ? 70 : 110) && this.dive === 0) this.setHand(h, 'aim');
          break;
        case 'aim':
          h.tx = a.player.x - 12;
          h.x += (h.tx - h.x) * 0.08;
          h.y += (40 - h.y) * 0.1;
          if (h.t > 40) this.setHand(h, 'slam');
          break;
        case 'slam':
          h.y += 6;
          if (h.y >= FLOOR_Y - 18) {
            h.y = FLOOR_Y - 18;
            a.shake(8);
            a.sfx('explode');
            this.setHand(h, 'rest');
          }
          break;
        case 'rest':
          if (h.t > (fast ? 50 : 70)) this.setHand(h, 'rise');
          break;
        case 'rise':
          h.y -= 2;
          if (h.y <= 60) this.setHand(h, 'hover');
          break;
      }
    }
  }

  private setHand(h: Hand, st: Hand['st']): void {
    h.st = st;
    h.t = 0;
  }

  hurtboxes(): Rect[] {
    const out: Rect[] = [];
    if (this.dive > 0.6) out.push({ x: this.sx + 2, y: this.sy + 4, w: 28, h: 28 });
    for (const h of this.hands) if (h.st === 'rest') out.push({ x: h.x + 2, y: h.y, w: 20, h: 18 });
    return out;
  }

  armorboxes(): Rect[] {
    return this.hands.filter((h) => h.st !== 'rest').map((h) => ({ x: h.x + 2, y: h.y, w: 20, h: 18 }));
  }

  attackboxes(): Rect[] {
    const out: Rect[] = [{ x: this.sx + 2, y: this.sy + 4, w: 28, h: 28 }];
    for (const h of this.hands) if (h.st === 'slam' || h.st === 'rest') out.push({ x: h.x + 2, y: h.y, w: 20, h: 18 });
    return out;
  }

  /** The jaw takes double damage. */
  hit(dmg: number): void {
    super.hit(this.dive > 0.6 ? dmg * 2 : dmg);
  }

  centre() {
    return { x: this.sx + 16, y: this.sy + 16 };
  }

  draw(r: PixelRenderer, top: number): void {
    // spine dangling below the skull into the dark
    for (let y = Math.round(this.sy) + 30; y < FLOOR_Y; y += 6) r.rect(Math.round(this.sx) + 13, top + y, 6, 4, 0x10);
    r.sprite(this.mouth ? SKULL_OPEN : SKULL_SHUT, Math.round(this.sx), Math.round(this.sy) + top, this.pal(this.PAL));
    for (const h of this.hands) {
      const s = h.st === 'slam' || h.st === 'rest' ? HAND_FIST : HAND_OPEN;
      r.sprite(s, Math.round(h.x), Math.round(h.y) + top, this.pal(this.PAL), h.side > 0);
    }
  }
}

// ---- IV. Meiou, King of the Underworld, and his true face ------------------------

class Meiou extends Boss {
  readonly name = 'MEIOU';
  readonly title = 'MEIOU, KING OF THE DEAD';
  private form = 1;
  private x = 180;
  private y = FLOOR_Y;
  private cast = 0;
  private warp = 0;
  private spots = [56, 128, 200];
  private spot = 2;
  private transform = 0;
  private readonly KPAL = [C.BLACK, 0x03, 0x28, 0x16, 0x30];
  private mouth = 0;

  constructor() {
    super(24);
  }

  get finished(): boolean {
    return this.form === 2 && this.hp <= 0;
  }

  update(a: Arena): void {
    this.tick();
    if (this.transform > 0) {
      // first form shatters; the mask rises
      this.transform++;
      if (this.transform % 8 === 0) a.sfx('explode');
      a.shake(2);
      if (this.transform > 90) {
        this.transform = 0;
        this.form = 2;
        this.max = 30;
        this.hp = 30;
        this.t = 0;
        a.sfx('bossAppear');
      }
      return;
    }
    if (this.form === 1) {
      if (this.hp <= 0) {
        this.transform = 1;
        return;
      }
      const cyc = this.t % 200;
      if (cyc === 0) {
        this.warp = 16;
        a.sfx('warp');
      }
      if (this.warp > 0) {
        this.warp--;
        if (this.warp === 8) {
          // never land on the hero
          const choices = this.spots.map((_, i) => i).filter((i) => i !== this.spot && Math.abs(this.spots[i] - a.player.x) > 40);
          this.spot = choices[this.t % choices.length] ?? (this.spot + 1) % 3;
          this.x = this.spots[this.spot];
        }
      }
      this.cast = cyc > 60 && cyc < 110 ? 1 : cyc > 140 && cyc < 170 ? 2 : 0;
      if (cyc === 80) {
        a.sfx('shoot');
        for (let i = -2; i <= 2; i++) {
          const v = aim(this.x, this.y - 50, a.player.x + i * 28, a.player.y - 20, 1.6);
          a.shoot({ kind: 'orb', x: this.x, y: this.y - 50, ...v, dmg: 3, friendly: false, life: 220 });
        }
      }
      if (cyc === 150) {
        a.sfx('explode');
        a.shake(6);
        for (const d of [-1, 1]) a.shoot({ kind: 'wave', x: this.x + d * 14, y: FLOOR_Y - 5, vx: d * 2, vy: 0, dmg: 3, friendly: false, life: 120 });
      }
    } else {
      // the mask: a slow figure-eight over the arena, rings of fire, and low sweeps
      const t = this.t;
      this.x = 128 + Math.sin(t * 0.012) * 90;
      this.y = 64 + Math.sin(t * 0.024) * 26 + Math.max(0, Math.sin(t * 0.006)) * 54;
      this.mouth = t % 110 > 30 && t % 110 < 70 ? 1 : 0;
      if (t % 110 === 50) {
        a.sfx('shoot');
        const n = this.hp <= 15 ? 10 : 8;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + t * 0.01;
          a.shoot({ kind: 'fire', x: this.x, y: this.y, vx: Math.cos(ang) * 1.4, vy: Math.sin(ang) * 1.4, dmg: 3, friendly: false, life: 240 }, );
        }
      }
    }
  }

  hurtboxes(): Rect[] {
    if (this.transform > 0 || this.warp > 4) return [];
    if (this.form === 1) return [{ x: this.x - 14, y: this.y - 64, w: 28, h: 64 }];
    return [{ x: this.x - 16, y: this.y - 20, w: 32, h: 40 }];
  }

  attackboxes(): Rect[] {
    return this.hurtboxes();
  }

  centre() {
    return this.form === 1 ? { x: this.x, y: this.y - 36 } : { x: this.x, y: this.y };
  }

  draw(r: PixelRenderer, top: number, frame: number): void {
    if (this.form === 1) {
      if (this.warp > 0 && frame & 1) return;
      const s = this.cast ? KING_CAST : KING_IDLE;
      if (this.transform > 0 && frame & 2) return;
      r.sprite(s, Math.round(this.x) - (s.w >> 1), Math.round(this.y) + top - s.h, this.pal(this.KPAL));
      if (this.cast === 1) {
        const ox = Math.round(this.x), oy = Math.round(this.y) + top - 78;
        for (let i = 0; i < 6; i++) {
          const ang = frame * 0.2 + i;
          r.pset(ox + Math.round(Math.cos(ang) * 10), oy + Math.round(Math.sin(ang) * 6), i & 1 ? 0x33 : 0x13);
        }
      }
      return;
    }
    const m = this.mouth ? MASK_OPEN : MASK_SHUT;
    r.sprite(m, Math.round(this.x) - (m.w >> 1), Math.round(this.y) + top - 26, this.pal(this.KPAL));
  }
}

export function createBoss(id: BossId): Boss {
  switch (id) {
    case 'rotroot':
      return new Rotroot();
    case 'centipede':
      return new Centipede();
    case 'gashadokuro':
      return new Gashadokuro();
    case 'meiou':
      return new Meiou();
  }
}

export const BOSS_THEME: Record<BossId, 'grotto' | 'mine' | 'crypt' | 'temple'> = {
  rotroot: 'grotto',
  centipede: 'mine',
  gashadokuro: 'crypt',
  meiou: 'temple',
};
