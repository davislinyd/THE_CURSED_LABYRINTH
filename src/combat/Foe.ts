import { ENEMY_ATTACK, ENEMY_REACT, EnemyAction, EnemyKindCh1, EnemyModel } from '../actors/Enemies';

/** Behaviour numbers per enemy kind (metres, m/s, ticks). */
export interface FoeSpec {
  hp: number;
  /** Body radius for collision and being hit. */
  radius: number;
  speed: number;
  /** Distance at which it starts its attack. */
  range: number;
  /** Reach and half-angle of its blow. */
  reach: number;
  arc: number;
  damage: number;
  sight: number;
  cooldown: number;
  /** Red souls (sword experience) released on death. */
  souls: number;
}

export const FOES: Record<EnemyKindCh1, FoeSpec> = {
  ghoul: { hp: 4, radius: 0.45, speed: 1.5, range: 1.9, reach: 2.2, arc: 1.0, damage: 2, sight: 14, cooldown: 60, souls: 3 },
  hopper: { hp: 6, radius: 0.4, speed: 2.8, range: 3.4, reach: 1.3, arc: 3.2, damage: 2, sight: 12, cooldown: 70, souls: 4 },
  wisp: { hp: 3, radius: 0.35, speed: 1.8, range: 6, reach: 1.0, arc: 3.2, damage: 2, sight: 14, cooldown: 90, souls: 3 },
  crow: { hp: 2, radius: 0.35, speed: 3.5, range: 7, reach: 1.2, arc: 3.2, damage: 1, sight: 16, cooldown: 80, souls: 2 },
};

export type FoeState = 'idle' | 'chase' | 'attack' | 'hurt' | 'stagger' | 'die' | 'dead';

const DT = 1 / 60;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Knock-back speed (m/s) per unit of blow power, the extra for a killing blow, and the share kept each tick. */
const KNOCK = 3;
const KNOCK_KILL = 1.5;
const KNOCK_KEEP = 0.82;
/** Its eyes glint this many ticks before its blow lands. */
const WARN_LEAD = 16;

/** Height of the eyes (metres), where the warning glint shows. */
export const EYE_Y: Record<EnemyKindCh1, number> = { ghoul: 1.4, hopper: 1.5, wisp: 1.45, crow: 2.3 };
/** What a wound spills (a ghost-fire has none). */
export const BLOOD: Record<EnemyKindCh1, number | null> = { ghoul: 0x560a06, hopper: 0x4a0c08, wisp: null, crow: 0x0e0d12 };

/**
 * One enemy's mind and body position. The scene resolves wall collision after
 * `update`, applies the blow when `update` returns 'hit', and calls `hurt` /
 * `stagger` when the hero's blade or a parry lands.
 */
export class Foe {
  readonly spec: FoeSpec;
  hp: number;
  state: FoeState = 'idle';
  t = 0;
  yaw = 0;
  /** Last hero swing that hurt it (each swing hits once). */
  lastSwing = -1;
  private cool = 30;
  private struck = false;
  /** Direction locked at the start of a rush / dive. */
  private lockX = 0;
  private lockZ = 0;
  private orbit = Math.random() < 0.5 ? 1 : -1;
  /** Wander about the spawn point while idle (spirits roaming the world map). */
  roam = false;
  private readonly homeX: number;
  private readonly homeZ: number;
  private heading = 0;
  /** Knock-back velocity (m/s), fading. */
  private kx = 0;
  private kz = 0;

  constructor(readonly kind: EnemyKindCh1, public x: number, public z: number, readonly model: EnemyModel | null = null) {
    this.spec = FOES[kind];
    this.hp = this.spec.hp;
    this.homeX = x;
    this.homeZ = z;
  }

  get alive(): boolean {
    return this.state !== 'die' && this.state !== 'dead';
  }

  /** The tick to warn of the coming blow. */
  get warn(): boolean {
    return this.state === 'attack' && this.t === ENEMY_ATTACK[this.kind].active[0] - WARN_LEAD;
  }

  /** In its blow's active window. */
  get striking(): boolean {
    const a = ENEMY_ATTACK[this.kind].active;
    return this.state === 'attack' && this.t >= a[0] && this.t < a[1];
  }

  private set(s: FoeState, action?: EnemyAction): void {
    this.state = s;
    this.t = 0;
    const a = action ?? (s === 'chase' ? 'move' : s === 'dead' ? null : (s as EnemyAction));
    if (a) this.model?.play(a);
  }

  /** One tick. Returns 'hit' on the tick its blow connects with the hero at (px, pz). */
  update(px: number, pz: number, heroAlive: boolean): 'hit' | null {
    this.t++;
    const s = this.spec;
    const dx = px - this.x, dz = pz - this.z, d = Math.hypot(dx, dz) || 1e-6;
    const toHero = Math.atan2(dx, dz);
    const step = (speed: number, ax = Math.sin(this.yaw), az = Math.cos(this.yaw)) => {
      this.x += ax * speed * DT;
      this.z += az * speed * DT;
    };
    const turn = (to: number, rate: number) => (this.yaw += Math.max(-rate * DT, Math.min(rate * DT, wrap(to - this.yaw))));
    if (this.cool > 0) this.cool--;
    if (this.kx || this.kz) {
      this.x += this.kx * DT;
      this.z += this.kz * DT;
      this.kx *= KNOCK_KEEP;
      this.kz *= KNOCK_KEEP;
      if (Math.hypot(this.kx, this.kz) < 0.1) this.kx = this.kz = 0;
    }
    switch (this.state) {
      case 'dead':
        return null;
      case 'die':
        if (this.t >= ENEMY_REACT.die) this.set('dead');
        return null;
      case 'hurt':
        if (this.t >= ENEMY_REACT.hurt) this.set('chase');
        return null;
      case 'stagger':
        if (this.t >= ENEMY_REACT.stagger) this.set('chase');
        return null;
      case 'idle':
        if (heroAlive && d < s.sight) this.set('chase');
        else if (this.roam) this.wander(step, turn);
        return null;
      case 'attack':
        return this.attack(d, dx, dz, toHero, step, turn);
    }
    // chase
    if (!heroAlive) {
      this.set('idle');
      return null;
    }
    switch (this.kind) {
      case 'ghoul':
        turn(toHero, 4);
        if (d > s.range * 0.8) step(s.speed);
        break;
      case 'hopper': {
        // it only covers ground while in the air (0.12 - 0.48 s of each 0.6 s hop)
        turn(toHero, 3);
        const ph = this.t % 36;
        if (ph >= 7 && ph < 29 && d > 1.2) step(s.speed * 1.6);
        break;
      }
      case 'wisp': {
        turn(toHero, 3);
        const want = d > 5.5 ? 1 : d < 3.5 ? -1 : 0;
        step(s.speed * want);
        step(s.speed * 0.5, Math.cos(toHero) * this.orbit, -Math.sin(toHero) * this.orbit);
        break;
      }
      case 'crow': {
        // circle the hero at ~4.5 m
        const radial = (d - 4.5) * 0.8;
        const ax = Math.sin(toHero) * radial + Math.cos(toHero) * this.orbit * s.speed;
        const az = Math.cos(toHero) * radial - Math.sin(toHero) * this.orbit * s.speed;
        const len = Math.hypot(ax, az) || 1;
        turn(Math.atan2(ax, az), 5);
        step(Math.min(s.speed, len), ax / len, az / len);
        break;
      }
    }
    const facing = Math.abs(wrap(toHero - this.yaw)) < 0.5 || this.kind === 'crow';
    if (this.cool === 0 && d < s.range && facing) {
      this.struck = false;
      this.set('attack');
    }
    return null;
  }

  private attack(d: number, dx: number, dz: number, toHero: number, step: (s: number, ax?: number, az?: number) => void, turn: (to: number, rate: number) => void): 'hit' | null {
    const s = this.spec, tm = ENEMY_ATTACK[this.kind], t = this.t;
    switch (this.kind) {
      case 'ghoul':
        if (t < tm.active[0] - 6) turn(toHero, 3);
        else if (t < tm.active[1]) step(1.8);
        break;
      case 'hopper':
        if (t < 27) turn(toHero, 3);
        else if (t < tm.active[1]) step(6.5);
        break;
      case 'wisp':
      case 'crow': {
        const lockAt = this.kind === 'wisp' ? tm.active[0] : 33;
        if (t < lockAt) {
          turn(toHero, 4);
          if (this.kind === 'crow') step(1.5, -Math.sin(toHero), -Math.cos(toHero));
        } else {
          if (t === lockAt) {
            this.lockX = dx / d;
            this.lockZ = dz / d;
          }
          if (t < tm.active[1]) step(this.kind === 'wisp' ? 9 : 8, this.lockX, this.lockZ);
        }
        break;
      }
    }
    let hit: 'hit' | null = null;
    if (this.striking && !this.struck && d < s.reach + 0.4 && Math.abs(wrap(toHero - this.yaw)) < s.arc) {
      this.struck = true;
      hit = 'hit';
    }
    if (t >= tm.len) {
      this.cool = s.cooldown;
      this.set('chase');
    }
    return hit;
  }

  /** Idle drift: walk a while, rest a while; head home when strayed too far. */
  private wander(step: (s: number) => void, turn: (to: number, rate: number) => void): void {
    const ph = this.t % 100;
    if (ph === 1) {
      const hx = this.homeX - this.x, hz = this.homeZ - this.z;
      this.heading = Math.hypot(hx, hz) > 4 ? Math.atan2(hx, hz) : Math.random() * Math.PI * 2;
      this.model?.play('move');
    }
    if (ph < 60) {
      turn(this.heading, 3);
      step(this.spec.speed * 0.4);
    } else if (ph === 60) this.model?.play('idle');
  }

  /**
   * The hero's blade lands. `power` >= 2.5 (strong, counter) staggers; the blow
   * knocks it away from `from`, harder the stronger it is. Returns true if it died.
   */
  hurt(damage: number, power: number, from: { x: number; z: number } | null = null): boolean {
    if (!this.alive) return false;
    this.hp -= damage;
    this.model?.flash();
    if (from) {
      const dx = this.x - from.x, dz = this.z - from.z, d = Math.hypot(dx, dz) || 1;
      const v = KNOCK * power * (this.hp <= 0 ? KNOCK_KILL : 1);
      this.kx = (dx / d) * v;
      this.kz = (dz / d) * v;
    }
    if (this.hp <= 0) {
      this.set('die');
      return true;
    }
    if (power >= 2.5) this.set('stagger');
    else this.set('hurt');
    return false;
  }

  /** Thrown off balance by a perfect parry: wide open for a counter. */
  stagger(): void {
    if (this.alive) this.set('stagger');
  }
}
