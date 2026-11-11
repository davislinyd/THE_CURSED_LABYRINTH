import * as THREE from 'three';
import { AutoInput, HeroActor, Mark } from '../actors/HeroActor';
import { ROTROOT_ATTACK, ROTROOT_REACT, Rotroot, buildRotroot } from '../actors/Rotroot';
import { HIT_STOP } from '../combat/HeroMachine';
import { harm, toughness } from '../core/Difficulty';
import type { Game } from '../core/Game';
import { DungeonId, ItemId, swordDamage } from '../core/GameState';
import { Scene } from '../core/SceneManager';
import { DUNGEONS } from '../data/levels/dungeons';
import { FollowCam } from '../engine/FollowCam';
import { pointShadow } from '../engine/Lighting';
import type { QualityProfile } from '../engine/Quality';
import { Movers } from '../engine/Interp';
import { View } from '../engine/Renderer';
import { t } from '../i18n';
import { DeathOverlay } from '../ui/DeathOverlay';
import { drawHud } from '../ui/Hud';
import { COL, UI } from '../ui/UI';
import { Fx, blobShadow } from '../world/Fx';
import { DRIFT } from '../world/Drift';
import { P2, Rect, SolidFn, WALL_H } from '../world/Grid3D';

const ARENA_R = 11;
const ITEMS: ItemId[] = ['herb', 'elixir', 'talisman'];
const BOSS_HP = 40;
const BOSS: P2 = { x: 0, z: -3 };
const TRUNK_R = 1.5;
/** The trunk as something a blow can be aimed at. */
const BOSS_MARK: Mark = { ...BOSS, alive: true, spec: { radius: TRUNK_R } };
/** What its wounds spill: dark sap. */
const SAP = 0x241608;
/** Its eyes flare this many ticks before a blow lands. */
const WARN_LEAD = 20;

type Phase = 'intro' | 'idle' | 'slam' | 'sweep' | 'hurt' | 'stagger' | 'die' | 'won';

/** The guardian's hollow: a round cavern and the Rotroot at its heart. */
export class BossScene implements Scene {
  readonly playTime = true;
  view: View | null = null;
  private readonly scene3 = new THREE.Scene();
  private readonly cam = new FollowCam();
  private hero!: HeroActor;
  private heroShadow!: THREE.Mesh;
  private readonly heroLight = new THREE.PointLight(0xffd2a0, 14, 12, 1.4);
  private boss!: Rotroot;
  private readonly fx = new Fx(DRIFT.boss);
  private ready = false;
  private phase: Phase = 'intro';
  private t = 0;
  /** Hit points on the chosen difficulty. */
  private readonly maxHp: number;
  private hp: number;
  private arm = 0;
  private struck = false;
  private lastSwing = -1;
  private hitStop = 0;
  private locked = true;
  private death: DeathOverlay | null = null;
  private frame = 0;
  private hurtFlash = 0;
  private readonly movers = new Movers();
  /** The arena wall as 1 m blocks, for the camera's line of sight. */
  private readonly solid: SolidFn = (cx, cy) => {
    const out: Rect[] = [];
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        const x = cx * 4 + i, z = cy * 4 + j;
        if (Math.hypot(x + 0.5, z + 0.5) > ARENA_R + 0.3) out.push({ x0: x, z0: z, x1: x + 1, z1: z + 1 });
      }
    }
    return out;
  };

  constructor(private readonly game: Game, private readonly id: DungeonId) {
    this.maxHp = this.hp = toughness(game.state.difficulty, BOSS_HP);
    void this.build().catch((e) => console.error(e));
  }

  enter(): void {
    this.game.audio.stopMusic(0.5);
    this.game.audio.setSpace(1);
  }

  resume(): void {
    this.game.audio.resumeMusic();
  }

  get moving(): readonly THREE.Object3D[] {
    return this.movers.list;
  }

  private async build(): Promise<void> {
    const g = this.game, s3 = this.scene3;
    const [floorMat, wallMat] = await Promise.all([
      g.assets.material('mud_forest', 1, { color: 0x8a8478 }),
      g.assets.material('rock_wall_02', 1, { color: 0x8a847a }),
    ]);
    s3.background = new THREE.Color(0x040506);
    s3.fog = new THREE.FogExp2(0x040506, 0.045);
    s3.environment = await g.assets.environment('moonlit_golf', g.gfx.gl);
    s3.environmentIntensity = 0.15;
    pointShadow(this.heroLight, g.gfx.quality);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 1, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    const uv = floor.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 6);
    floor.receiveShadow = true;
    // a rough round wall, bulging in and out
    const wallGeo = new THREE.CylinderGeometry(ARENA_R + 0.8, ARENA_R + 1.2, WALL_H * 2, 64, 8, true);
    const p = wallGeo.attributes.position, wuv = wallGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
      const k = 1 + 0.06 * Math.sin(a * 7 + y) + 0.04 * Math.sin(a * 17 - y * 2);
      p.setXYZ(i, x * k, y, z * k);
      wuv.setXY(i, wuv.getX(i) * 18, wuv.getY(i) * 3);
    }
    wallGeo.computeVertexNormals();
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.material.side = THREE.BackSide;
    wall.position.y = WALL_H;
    s3.add(floor, wall, this.heroLight, this.fx.group, new THREE.HemisphereLight(0x3a4050, 0x100a08, 0.3));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const l = new THREE.PointLight(0x9a6aff, 16, 14, 1.5);
      l.position.set(Math.sin(a) * (ARENA_R - 1), 2.5, Math.cos(a) * (ARENA_R - 1));
      s3.add(l);
    }
    this.boss = await buildRotroot(g.assets);
    this.boss.root.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh === true));
    this.boss.root.position.set(BOSS.x, 0, BOSS.z);
    s3.add(this.boss.root);
    this.hero = new HeroActor(0, 8, this.game.fatigue);
    this.hero.yaw = Math.PI;
    this.heroShadow = blobShadow(1.3);
    s3.add(this.hero.root, this.heroShadow, this.hero.effects);
    s3.onBeforeRender = () => this.hero.drawTrail();
    this.movers.add(this.cam.camera, this.heroShadow, this.heroLight);
    this.movers.addRig(this.hero.root);
    this.movers.addRig(this.boss.root);
    this.cam.yaw = Math.PI;
    this.cam.maxY = 7;
    this.cam.update(this.hero.pos, this.hero.yaw, 0, false, BOSS, this.solid, true);
    this.view = { scene: s3, camera: this.cam.camera };
    this.ready = true;
    g.sfx('roar');
    this.cam.shake(0.8);
  }

  private keepInside(p: P2, r: number): void {
    const d = Math.hypot(p.x, p.z);
    if (d > ARENA_R - r) {
      p.x *= (ARENA_R - r) / d;
      p.z *= (ARENA_R - r) / d;
    }
    const dx = p.x - BOSS.x, dz = p.z - BOSS.z, db = Math.hypot(dx, dz) || 1e-6;
    if (db < TRUNK_R + r) {
      p.x = BOSS.x + (dx / db) * (TRUNK_R + r);
      p.z = BOSS.z + (dz / db) * (TRUNK_R + r);
    }
  }

  private setPhase(p: Phase, arm = 0): void {
    this.phase = p;
    this.t = 0;
    this.arm = arm;
    this.struck = false;
    if (p === 'slam' || p === 'sweep' || p === 'hurt' || p === 'stagger' || p === 'die') this.boss.play(p, arm);
    if (p === 'idle') this.boss.play('idle');
  }

  quality(q: QualityProfile): void {
    pointShadow(this.heroLight, q);
  }

  /** Enter also confirms, so it must not open the pause menu over the death screen. */
  get pausable(): boolean {
    return !this.death;
  }

  update(): void {
    if (!this.ready) return;
    this.frame++;
    const g = this.game, inp = g.input, h = this.hero;
    if (this.death) return this.death.update();
    const playing = this.phase !== 'won' && h.state !== 'die';
    if (playing) inp.wantLock = true;
    const [lx, ly] = inp.camLook();
    this.cam.addLook(this.locked ? 0 : lx, ly);
    if (inp.pressed('lock') || inp.mouseMid) {
      this.locked = !this.locked;
      g.sfx('cursor', { vol: 0.6 });
    }
    if (inp.wheel) {
      const s = g.state;
      s.currentItem = ITEMS[(ITEMS.indexOf(s.currentItem) + inp.wheel + ITEMS.length) % ITEMS.length];
      g.sfx('cursor');
    }
    const slot = inp.slot();
    if (slot >= 0) g.state.currentItem = ITEMS[slot];
    const auto: AutoInput = { dx: 0, dz: 0, attack: inp.mouseLeft, strong: inp.mouseRight, use: slot >= 0 };
    const alive = h.state !== 'die';
    if (this.hitStop > 0) {
      this.hitStop--;
      // the struck trunk shudders while the world stands still
      this.boss.root.position.set(BOSS.x + (Math.random() - 0.5) * 0.1, 0, BOSS.z + (Math.random() - 0.5) * 0.1);
      if (playing) h.stall(inp, auto);
      return;
    }
    this.boss.root.position.set(BOSS.x, 0, BOSS.z);
    this.t++;
    const target = this.locked && this.phase !== 'die' && this.phase !== 'won' ? BOSS_MARK : null;
    // blows turn to the trunk by themselves, except while a slammed root lies there to be cut
    const near = this.phase === 'slam' || this.phase === 'die' || this.phase === 'won' ? [] : [BOSS_MARK];
    const hi = h.update(inp, this.cam.yaw, () => [], target, !alive || this.phase === 'intro' || this.phase === 'won', auto, near);
    const hp = { x: h.x, z: h.z };
    this.keepInside(hp, h.radius);
    h.x = hp.x;
    h.z = hp.z;
    h.root.position.set(h.x, 0, h.z);
    for (const e of h.machine.events) {
      if (e === 'swing') g.sfx(h.state === 'strong' || h.state === 'counter' ? 'swing_heavy' : 'swing');
      if (e === 'dust') this.fx.dust(h.x, h.z);
    }
    if (h.machine.events.includes('use')) this.useItem();
    this.boss.update(1 / 60);
    this.boss.root.updateMatrixWorld(true);
    this.think(alive);
    this.heroStrikes();
    const got = this.fx.update(1 / 60, h.root.position);
    if (got.red) g.state.weaponExp += got.red;
    if (got.yellow) g.state.life = Math.min(g.state.maxLife, g.state.life + got.yellow);
    this.cam.update(h.pos, h.yaw, inp.move().x, hi.move > 0.1, target, this.solid, false);
    this.heroLight.position.set(h.x - h.fx * 1.8, 3.3, h.z - h.fz * 1.8);
    this.heroShadow.position.set(h.x, 0.03, h.z);
    if (this.hurtFlash > 0) this.hurtFlash--;
    if (!alive && h.machine.t > 100) {
      this.death = new DeathOverlay(g);
      g.audio.stopMusic(1.5);
    }
  }

  /** The guardian's choices: rest, slam the root nearest the hero, or sweep from its side. */
  private think(heroAlive: boolean): void {
    const h = this.hero, b = this.boss;
    switch (this.phase) {
      case 'intro':
        if (this.t > 100) {
          this.game.music('BOSS');
          this.setPhase('idle');
        }
        return;
      case 'idle': {
        const rest = this.hp < this.maxHp / 2 ? 50 : 80;
        if (this.t < rest || !heroAlive) return;
        // the arm whose base points closest to the hero
        const toHero = Math.atan2(h.x - BOSS.x, h.z - BOSS.z);
        let best = 0, bestD = Infinity;
        b.arms.forEach((a, i) => {
          const d = Math.abs(Math.atan2(Math.sin(toHero - a.yaw), Math.cos(toHero - a.yaw)));
          if (d < bestD) (bestD = d), (best = i);
        });
        const dist = Math.hypot(h.x - BOSS.x, h.z - BOSS.z);
        if (dist < 3.6 || Math.random() < 0.35) this.setPhase('sweep', toHero > 0 ? 3 : 2);
        else this.setPhase('slam', best);
        return;
      }
      case 'slam':
      case 'sweep': {
        const tm = ROTROOT_ATTACK[this.phase];
        // its eyes flare before the blow
        if (this.t === tm.active[0] - WARN_LEAD) this.fx.glint(this.boss.core.getWorldPosition(new THREE.Vector3()), 0xff5020, 2.4);
        if (this.t === tm.active[0] && this.phase === 'slam') {
          this.game.sfx('break_heavy');
          this.cam.shake(0.5);
        }
        if (this.t >= tm.active[0] && this.t < tm.active[1] && !this.struck && heroAlive && this.armTouches(this.arm, this.phase === 'slam' ? 1.2 : 1.0)) {
          this.struck = true;
          this.blow(this.phase === 'slam' ? 3 : 2, this.phase === 'sweep');
        }
        if (this.t >= tm.len) this.setPhase('idle');
        return;
      }
      case 'hurt':
        if (this.t >= ROTROOT_REACT.hurt) this.setPhase('idle');
        return;
      case 'stagger':
        if (this.t >= ROTROOT_REACT.stagger) this.setPhase('idle');
        return;
      case 'die':
        if (this.t === 60) this.fx.release(new THREE.Vector3(BOSS.x, 2, BOSS.z + 1.5), 'red', 24);
        if (this.t >= ROTROOT_REACT.die) {
          this.setPhase('won');
          this.game.sfx('bell');
        }
        return;
      case 'won':
        if (this.t > 200 || (this.t > 60 && (this.game.input.pressed('confirm') || this.game.input.mouseLeft))) this.game.bossDefeated(DUNGEONS[this.id].boss);
        return;
    }
  }

  /** Is the hero within `r` of any segment point of an arm (near the ground)? */
  private armTouches(arm: number, r: number): boolean {
    const h = this.hero, v = new THREE.Vector3();
    for (let k = 2; k <= 9; k++) {
      this.boss.armPoint(arm, k, v);
      if (v.y < 1.6 && Math.hypot(v.x - h.x, v.z - h.z) < r + h.radius) return true;
    }
    return false;
  }

  private blow(damage: number, parryable: boolean): void {
    const g = this.game, h = this.hero;
    const front = (BOSS.x - h.x) * h.fx + (BOSS.z - h.z) * h.fz > 0;
    const r = h.hit(front);
    const at = h.root.position.clone().setY(1.2);
    if (r === 'parried' && parryable) {
      g.sfx('parry');
      this.fx.spark(at, 0xffffff, 2.4, 0.25);
      g.scenes.flash(1, 1, 1, 6);
      this.hitStop = 8;
      g.slowMo();
      this.setPhase('stagger');
    } else if (r === 'parried' || r === 'guarded') {
      g.sfx('guard');
      this.fx.spark(at, 0xffe0a0, 1.2);
      // the weight of the blow still shoves you back
      h.x -= h.fx * 0.8;
      h.z -= h.fz * 0.8;
    } else if (r === 'hit') {
      g.state.life = Math.max(0, g.state.life - harm(g.state.difficulty, damage));
      g.sfx('hit_heavy', { pitch: 0.85 });
      g.scenes.flash(0.6, 0, 0, 5);
      this.cam.shake(0.4);
      if (g.state.life <= 0) {
        h.kill();
        g.state.stats.deaths++;
      }
    }
  }

  private heroStrikes(): void {
    const h = this.hero, a = h.machine.attack, g = this.game;
    if (!a || a.swing === this.lastSwing || this.phase === 'die' || this.phase === 'won' || this.phase === 'intro') return;
    let mult = 0;
    if (h.inSweep(BOSS, TRUNK_R)) mult = 1;
    // a root lying on the ground after a slam is soft wood
    else if (this.phase === 'slam' && this.t > ROTROOT_ATTACK.slam.active[1]) {
      const v = new THREE.Vector3();
      for (let k = 3; k <= 9 && !mult; k++) if (h.inSweep({ x: this.boss.armPoint(this.arm, k, v).x, z: v.z }, 0.3)) mult = 1.5;
    }
    if (!mult) return;
    this.lastSwing = a.swing;
    const staggered = this.phase === 'stagger' ? 1.5 : 1;
    this.hp -= swordDamage(g.state) * a.power * mult * staggered;
    const at = new THREE.Vector3(h.x + h.fx * 1.4, 1.3, h.z + h.fz * 1.4), heavy = a.power >= 2.5;
    this.fx.wound(at, h, h.trail.path(), this.cam.camera, h.blowColor, heavy, SAP);
    g.sfx(heavy ? 'hit_heavy' : 'hit', { pitch: 0.8 });
    this.hitStop = HIT_STOP[a.kind] ?? 3;
    this.hurtFlash = 8;
    this.boss.flash();
    this.cam.punch(heavy ? 4 : 1.2);
    if (heavy) g.scenes.impact(at, a.kind === 'counter' ? 1 : 0.7);
    if (a.kind === 'counter') g.scenes.cut();
    if (this.hp <= 0) {
      this.hp = 0;
      g.audio.stopMusic(2);
      g.sfx('roar', { pitch: 0.7 });
      this.cam.shake(1.2);
      this.setPhase('die');
    } else if (a.power >= 2.5 && this.phase === 'idle') this.setPhase('hurt');
  }

  private useItem(): void {
    const s = this.game.state, id = s.currentItem;
    if (s.items[id] <= 0) return this.game.sfx('locked');
    if (id === 'talisman') {
      s.items[id]--;
      this.game.sfx('fire');
      this.hp -= 3;
      this.fx.spark(new THREE.Vector3(BOSS.x, 2.5, BOSS.z + 1.4), 0xff8040, 2.2, 0.3);
      return;
    }
    if (s.life >= s.maxLife) return this.game.sfx('locked');
    s.items[id]--;
    s.life = id === 'elixir' ? s.maxLife : Math.min(s.maxLife, s.life + 6);
    this.game.sfx('heal');
  }

  drawUI(ui: UI): void {
    if (!this.ready) return;
    if (this.death) return this.death.draw(ui);
    const s = this.game.state;
    drawHud(ui, s, 0, this.game.fatigue);
    const name = t('THE ROTROOT ELDER');
    ui.text(name, 320, 404, { size: 14, weight: 700, color: COL.goldLight, align: 'center', spacing: 2 });
    ui.gauge(170, 412, 300, 9, this.hp / this.maxHp, this.hurtFlash ? '#ffffff' : COL.crimson, COL.red);
    const inp = this.game.input;
    if (!inp.locked && inp.mouse && inp.device === 'kb' && this.phase !== 'won') {
      ui.text(t('CLICK TO CONTROL THE CAMERA'), 320, 440, { size: 12, align: 'center', color: COL.gray });
    }
    if (this.phase === 'won' && this.t > 30) {
      ui.veil(Math.min(0.5, (this.t - 30) / 60));
      ui.text(t('{0} IS VANQUISHED', name), 320, 190, { size: 24, weight: 700, color: COL.goldLight, align: 'center', spacing: 3 });
      ui.text(t('A SEAL IS YOURS'), 320, 230, { size: 16, color: COL.text, align: 'center' });
    }
  }

  dispose(): void {
    this.scene3.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
    this.heroLight.dispose();
    this.fx.dispose();
    this.hero?.dispose();
    this.boss?.dispose();
  }
}
