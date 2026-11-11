import * as THREE from 'three';
import { BUILD_ENEMY, EnemyKindCh1 } from '../actors/Enemies';
import { AutoInput, HeroActor } from '../actors/HeroActor';
import { BLOOD, EYE_Y, FOES, Foe } from '../combat/Foe';
import { HIT_STOP } from '../combat/HeroMachine';
import { harm, toughness } from '../core/Difficulty';
import type { Game } from '../core/Game';
import { DungeonId, ITEM_NAMES, ItemId, KEY_ITEM_INFO, hasItem, swordDamage } from '../core/GameState';
import { Scene } from '../core/SceneManager';
import { ENCOUNTERS } from '../data/encounters';
import { DUNGEONS } from '../data/levels/dungeons';
import { FollowCam } from '../engine/FollowCam';
import { MAX_LANTERNS, lanternCount, pointShadow } from '../engine/Lighting';
import type { QualityProfile } from '../engine/Quality';
import { Movers } from '../engine/Interp';
import { VIEW, View } from '../engine/Renderer';
import { isZh, t } from '../i18n';
import { drawFullMap, drawHud, drawMinimap, MapView } from '../ui/Hud';
import { DeathOverlay } from '../ui/DeathOverlay';
import { MessageBox } from '../ui/MessageBox';
import { COL, UI, inRect } from '../ui/UI';
import { YesNo } from '../ui/YesNo';
import { Dungeon, Loot, key } from '../world/DungeonMap';
import { Fx, blobShadow } from '../world/Fx';
import { DRIFT } from '../world/Drift';
import { CELL, DIR_X, DIR_Y, SolidFn, barrierAxis, cellKind, cellOf, center, collide, inSolid, isBarrier, solidRects } from '../world/Grid3D';
import { Lantern, buildLevel, falseWall } from '../world/Level3D';
import { Barrier, BarrierKind, Chest, Lever, Prop, PropKit, Spikes, Warp, bossDoor, exitGate, loadPropKit, spirit, tablet } from '../world/Props';

const BARRIER_KIND: Record<string, BarrierKind> = { D: 'door', L: 'locked', B: 'breakable', S: 'seal', G: 'gate', g: 'gate', H: 'gate', h: 'gate' };
/** Facing for each grid direction (N, E, S, W): yaw 0 looks +z (south). */
const DIR_YAW = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
const ITEMS: ItemId[] = ['herb', 'elixir', 'talisman'];
/** Strength of the environment reflection at full light. */
const ENV = 0.18;
/** x of each item on the map page. */
const ITEM_X = (i: number) => 130 + i * 140;

interface Target {
  kind: 'chest' | 'barrier' | 'face' | 'npc';
  x: number;
  y: number;
  px: number;
  pz: number;
  label: string;
}

interface Talisman {
  s: THREE.Sprite;
  x: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
}

/** A labyrinth in real-time 3D: explore, fight, open its locks, reach the guardian. */
export class DungeonScene implements Scene {
  readonly playTime = true;
  view: View | null = null;
  private readonly scene3 = new THREE.Scene();
  private readonly cam = new FollowCam();
  private readonly d: Dungeon;
  private ready = false;
  private hero!: HeroActor;
  private heroShadow!: THREE.Mesh;
  private readonly heroLight = new THREE.PointLight(0xffd2a0, 14, 12, 1.4);
  private hemi!: THREE.HemisphereLight;
  private hemiBase = 0.35;
  private readonly pool: THREE.PointLight[] = [];
  private lanterns: Lantern[] = [];
  private readonly barriers = new Map<string, Barrier>();
  private readonly chests = new Map<string, Chest>();
  private readonly spikes = new Map<string, Spikes>();
  private readonly levers: { lever: Lever; group: 0 | 1 }[] = [];
  private readonly props: Prop[] = [];
  private readonly foes: Foe[] = [];
  private readonly shadows = new Map<Foe, THREE.Mesh>();
  private enc: { cell: string; group: string; wave: number; foes: Foe[] } | null = null;
  private readonly fx = new Fx(DRIFT.cave);
  private readonly talismans: Talisman[] = [];
  private readonly msg = new MessageBox();
  private ask: { box: YesNo; yes: () => void } | null = null;
  private mode: 'play' | 'map' | 'dead' = 'play';
  private death: DeathOverlay | null = null;
  private lock: Foe | null = null;
  private hitStop = 0;
  /** Foes struck by the blow that started the current hit-stop (they shudder). */
  private readonly struck: Foe[] = [];
  private spikeCool = 0;
  private cell = '';
  private frame = 0;
  private prompt: Target | null = null;
  private readonly doorHp = new Map<string, number>();
  private readonly solid: SolidFn;
  private kit!: PropKit;
  private readonly movers = new Movers();

  constructor(private readonly game: Game, private readonly id: DungeonId) {
    this.d = new Dungeon(DUNGEONS[id], { get: (n) => !!game.state.flags[n] });
    this.solid = (x, y) => solidRects(this.d, x, y);
    void this.build().catch((e) => console.error(e));
  }

  enter(): void {
    this.game.music(this.d.def.music);
    this.game.audio.setSpace(0.85);
  }

  resume(): void {
    this.game.audio.resumeMusic();
  }

  get moving(): readonly THREE.Object3D[] {
    return this.movers.list;
  }

  // ------------------------------------------------------------------ build

  private async build(): Promise<void> {
    const g = this.game, d = this.d, s3 = this.scene3;
    const level = await buildLevel(d, d.def.theme, g.assets);
    this.kit = await loadPropKit(g.assets);
    const th = level.theme;
    // a faint sky reflection on armour and steel; it fades with the light in cursed darkness
    s3.environment = await g.assets.environment('moonlit_golf', g.gfx.gl);
    s3.environmentIntensity = ENV;
    // foes, chests and doors throw shadows from the light behind the hero
    pointShadow(this.heroLight, g.gfx.quality);
    s3.background = new THREE.Color(th.fog);
    s3.fog = new THREE.FogExp2(th.fog, th.fogDensity);
    this.hemi = new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]);
    this.hemiBase = th.hemi[2];
    s3.add(level.group, this.hemi, this.heroLight, this.fx.group);
    this.lanterns = level.lanterns;
    for (let i = 0; i < MAX_LANTERNS; i++) {
      const l = new THREE.PointLight(0xff9a4a, 0, 10, 1.5);
      this.pool.push(l);
      s3.add(l);
    }
    lanternCount(this.pool, g.gfx.quality);
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) this.placeProp(x, y);

    const loc = g.state.location;
    const start = loc.mode === 'dungeon' && loc.id === this.id ? loc : { ...d.start };
    this.hero = new HeroActor(center(start.x), center(start.y), this.game.fatigue);
    this.hero.yaw = DIR_YAW[start.dir];
    this.heroShadow = blobShadow(1.3);
    s3.add(this.hero.root, this.heroShadow, this.hero.effects);
    s3.onBeforeRender = () => this.hero.drawTrail();
    this.movers.add(this.cam.camera, this.heroShadow, this.heroLight);
    this.movers.addRig(this.hero.root);
    this.cam.yaw = this.hero.yaw;
    this.cam.update(this.hero.pos, this.hero.yaw, 0, false, null, this.solid, true);
    this.view = { scene: s3, camera: this.cam.camera };
    this.markVisited();
    this.ready = true;
  }

  private placeProp(x: number, y: number): void {
    const d = this.d, k = this.kit, ch = d.ch(x, y), k2 = key(x, y);
    const at = (o: THREE.Object3D, px = center(x), pz = center(y), yaw = 0) => {
      o.position.set(px, 0, pz);
      o.rotation.y = yaw;
      this.scene3.add(o);
    };
    const openDirs = [0, 1, 2, 3].filter((dir) => cellKind(d.ch(x + DIR_X[dir], y + DIR_Y[dir])) === 'open');
    if (ch === 'C') {
      const c = new Chest(k, !!this.game.state.flags[d.flag('chest', x, y)]);
      const dir = openDirs[0] ?? 2;
      at(c.obj, center(x), center(y), Math.atan2(DIR_X[dir], DIR_Y[dir]));
      this.chests.set(k2, c);
      this.props.push(c);
    } else if (isBarrier(ch)) {
      const b = new Barrier(BARRIER_KIND[ch], k, d.passable(x, y));
      at(b.obj, center(x), center(y), barrierAxis(d, x, y) === 'x' ? Math.PI / 2 : 0);
      this.barriers.set(k2, b);
      this.props.push(b);
    } else if (ch === '^') {
      const sp = new Spikes(k, (x * 0.7 + y * 1.3) % Spikes.PERIOD);
      at(sp.obj);
      this.spikes.set(k2, sp);
      this.props.push(sp);
    } else if (ch === 'O') {
      const w = new Warp();
      at(w.obj);
      this.props.push(w);
      this.lanterns.push({ pos: new THREE.Vector3(center(x), 1, center(y)), color: 0x6aa8ff });
    } else if (ch === 'N') {
      at(spirit(k));
    } else if (ch === 'F') {
      for (const dir of openDirs) {
        if (d.ch(x + DIR_X[dir], y + DIR_Y[dir]) === 'F') continue;
        this.scene3.add(falseWall(x + DIR_X[dir], y + DIR_Y[dir], (dir + 2) % 4, this.fakeMat()));
      }
    } else if (cellKind(ch) === 'face') {
      for (const dir of openDirs) {
        const px = center(x) + DIR_X[dir] * (CELL / 2 + 0.45), pz = center(y) + DIR_Y[dir] * (CELL / 2 + 0.45);
        const yaw = Math.atan2(DIR_X[dir], DIR_Y[dir]);
        if (ch === 'T') at(tablet(k), px, pz, yaw);
        else if (ch === 'X') {
          at(exitGate(k), px, pz, yaw);
          this.lanterns.push({ pos: new THREE.Vector3(px + DIR_X[dir], 2.2, pz + DIR_Y[dir]), color: 0xbcd4ff });
        } else if (ch === 'K') {
          at(bossDoor(k), px, pz, yaw);
          this.lanterns.push({ pos: new THREE.Vector3(px + DIR_X[dir] * 1.2, 2.6, pz + DIR_Y[dir] * 1.2), color: 0xff3020 });
        } else {
          const group = ch === '=' ? 0 : 1;
          const lv = new Lever(k, d.lever(group), ch === '%');
          at(lv.obj, center(x) + DIR_X[dir] * (CELL / 2 + 0.5), center(y) + DIR_Y[dir] * (CELL / 2 + 0.5), yaw);
          this.levers.push({ lever: lv, group });
          this.props.push(lv);
        }
      }
    }
  }

  private fake: THREE.MeshStandardMaterial | null = null;

  /** False walls: plain rock, or a shimmer once the bronze mirror is held. */
  private fakeMat(): THREE.Material {
    if (!this.fake) {
      this.fake = new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: 1, transparent: true });
      void this.game.assets.textures('rock_wall_02').then((t) => {
        this.fake!.map = t.map;
        this.fake!.normalMap = t.normalMap;
        this.fake!.needsUpdate = true;
      });
    }
    return this.fake;
  }

  /** Enter also confirms, so it must not open the pause menu over a message, question, map or death screen. */
  get pausable(): boolean {
    return this.mode === 'play' && !this.msg.active && !this.ask && !this.death;
  }

  // ------------------------------------------------------------------ update

  update(): void {
    if (!this.ready) return;
    this.frame++;
    const g = this.game, inp = g.input;
    if (this.death) return this.death.update();
    if (this.mode === 'map') return this.updateMap();
    const modal = this.msg.active || this.ask !== null;
    this.clickActs = false;
    // the mouse steers the camera while playing; a question frees it to click an answer
    if (!this.ask) inp.wantLock = true;
    const [lx, ly] = inp.camLook();
    this.cam.addLook(this.lock?.alive ? 0 : lx, ly);
    let auto: AutoInput | null = null;
    if (this.msg.active) {
      if (this.msg.update(inp.held('confirm'))) g.sfx('text', { vol: 0.4 });
      if (inp.pressed('confirm') || inp.pressed('cancel') || inp.mouseLeft) this.msg.advance();
    } else if (this.ask) {
      const a = this.ask, r = a.box.update(g);
      if (r) this.ask = null;
      if (r === 'yes') return a.yes();
    } else {
      if (inp.pressed('map')) {
        g.settings.minimap = !g.settings.minimap;
        g.applySettings();
        g.sfx('page');
      }
      if (inp.pressed('select')) {
        this.mode = 'map';
        g.sfx('page');
        return;
      }
      if (inp.pressed('lock') || inp.mouseMid) this.toggleLock();
      if (inp.wheel) {
        if (this.lock?.alive) this.nextLock(inp.wheel);
        else this.cycleItem(inp.wheel);
      }
      auto = this.mouseButtons();
    }
    const hero = this.hero;
    const alive = hero.state !== 'die';
    if (this.hitStop > 0) {
      this.hitStop--;
      for (const f of this.struck) f.model?.root.position.set(f.x + (Math.random() - 0.5) * 0.12, 0, f.z + (Math.random() - 0.5) * 0.12);
      if (!modal && alive) hero.stall(inp, auto);
      return;
    }
    this.struck.length = 0;
    const hi = hero.update(inp, this.cam.yaw, this.solid, this.lock && this.lock.alive ? this.lock : null, modal || !alive, auto, this.foes);
    if (this.lock && !this.lock.alive) this.lock = null;
    for (const e of hero.machine.events) {
      if (e === 'swing') g.sfx(hero.state === 'strong' || hero.state === 'counter' ? 'swing_heavy' : 'swing');
      if (e === 'use') this.useItem();
      if (e === 'dust') this.fx.dust(hero.x, hero.z);
    }
    if (hero.state === 'run' && this.frame % Math.round(20 / hero.fatigue.pace) === 0) g.sfx('step_dirt', { vol: 0.35 });
    this.strikeBarriers();
    this.strikeFoes();
    // the hero stands still while a message or question is open, so the foes wait too
    if (!modal) this.updateFoes(alive);
    this.updateTalismans();
    this.updateEncounter();
    const got = this.fx.update(1 / 60, hero.root.position);
    if (got.red) {
      g.state.weaponExp += got.red;
      g.sfx('soul', { vol: 0.5 });
    }
    if (got.yellow) {
      g.state.life = Math.min(g.state.maxLife, g.state.life + got.yellow);
      g.sfx('soul', { vol: 0.5, pitch: 1.3 });
    }
    for (const p of this.props) p.update(1 / 60);
    if (!modal && alive) {
      this.cellEvents();
      this.prompt = this.findTarget();
      if (this.prompt && (inp.pressed('act') || this.clickActs)) this.interact(this.prompt);
    } else this.prompt = null;
    this.cam.update(hero.pos, hero.yaw, inp.move().x, hi.move > 0.1, this.lock && this.lock.alive ? this.lock : null, this.solid, false);
    this.updateLights();
    if (!alive && hero.machine.t > 100) {
      this.mode = 'dead';
      this.death = new DeathOverlay(g);
      g.audio.stopMusic(1.5);
    }
  }

  /** This tick's left click examines the prompt instead of striking (set by mouseButtons). */
  private clickActs = false;

  /**
   * Captured mouse: left strikes, right strikes hard, 1-3 use an item. A left
   * click examines instead when a prompt is up and no foe is near (boards are struck).
   */
  private mouseButtons(): AutoInput {
    const inp = this.game.input, h = this.hero, p = this.prompt;
    const near = this.foes.some((f) => f.alive && Math.hypot(f.x - h.x, f.z - h.z) < 6);
    const boards = p?.kind === 'barrier' && this.barriers.get(key(p.x, p.y))?.kind === 'breakable';
    this.clickActs = inp.mouseLeft && !!p && !near && !boards;
    const slot = inp.slot();
    if (slot >= 0) this.game.state.currentItem = ITEMS[slot];
    return { dx: 0, dz: 0, attack: inp.mouseLeft && !this.clickActs, strong: inp.mouseRight, use: slot >= 0 };
  }

  private cycleItem(dir: number): void {
    const s = this.game.state;
    s.currentItem = ITEMS[(ITEMS.indexOf(s.currentItem) + dir + ITEMS.length) % ITEMS.length];
    this.game.sfx('cursor');
  }

  /** The wheel moves the lock to the next foe to the right (down) or left (up) on screen. */
  private nextLock(dir: number): void {
    const h = this.hero;
    const list = this.foes
      .filter((f) => f.alive && Math.hypot(f.x - h.x, f.z - h.z) < 14)
      .map((f) => ({ f, a: Math.atan2(Math.sin(Math.atan2(f.x - h.x, f.z - h.z) - this.cam.yaw), Math.cos(Math.atan2(f.x - h.x, f.z - h.z) - this.cam.yaw)) }))
      // a larger angle is further left
      .sort((p, q) => q.a - p.a);
    if (list.length < 2) return;
    const i = list.findIndex((e) => e.f === this.lock);
    this.lock = list[(i + dir + list.length) % list.length].f;
    this.game.sfx('cursor', { vol: 0.6 });
  }

  private toggleLock(): void {
    if (this.lock) {
      this.lock = null;
      return;
    }
    const h = this.hero;
    let best: Foe | null = null, bestScore = Infinity;
    for (const f of this.foes) {
      if (!f.alive) continue;
      const dx = f.x - h.x, dz = f.z - h.z, dist = Math.hypot(dx, dz);
      if (dist > 14) continue;
      const front = (dx * Math.sin(this.cam.yaw) + dz * Math.cos(this.cam.yaw)) / (dist || 1);
      const score = dist * (1.6 - front);
      if (score < bestScore) (bestScore = score), (best = f);
    }
    this.lock = best;
    if (!best) this.cam.update(h.pos, h.yaw, 0, false, null, this.solid, true);
    this.game.sfx('cursor', { vol: 0.6 });
  }

  // ---------------------------------------------------------------- combat

  private strikeBarriers(): void {
    const h = this.hero, a = h.machine.attack;
    if (!a) return;
    for (const [k, b] of this.barriers) {
      if (b.kind !== 'breakable' || b.isOpen) continue;
      const [x, y] = k.split(',').map(Number);
      if (!h.inSweep({ x: center(x), z: center(y) }, 1.4)) continue;
      const tag = `${k}#${a.swing}`;
      if (this.doorHp.has(tag)) continue;
      this.doorHp.set(tag, 1);
      const hp = (this.doorHp.get(k) ?? 3) - a.power;
      this.doorHp.set(k, hp);
      if (hp <= 0) {
        this.game.state.flags[this.d.flag('open', x, y)] = true;
        b.setOpen(true);
        this.game.sfx('break_wood');
        this.cam.shake(0.25);
      } else {
        b.hit();
        this.game.sfx('hit', { pitch: 0.8 });
      }
      this.hitStop = 3;
    }
  }

  private strikeFoes(): void {
    const h = this.hero, a = h.machine.attack, g = this.game;
    if (!a) return;
    for (const f of this.foes) {
      if (!f.alive || f.lastSwing === a.swing || !h.inSweep(f, f.spec.radius)) continue;
      f.lastSwing = a.swing;
      const killed = f.hurt(swordDamage(g.state) * a.power, a.power, h);
      const at = new THREE.Vector3(f.x, f.kind === 'crow' ? 2 : 1.1, f.z), heavy = a.power >= 2.5;
      this.fx.wound(at, h, h.trail.path(), this.cam.camera, h.blowColor, heavy, BLOOD[f.kind]);
      g.sfx(heavy ? 'hit_heavy' : 'hit');
      this.hitStop = HIT_STOP[a.kind] ?? 3;
      this.struck.push(f);
      this.cam.shake(heavy ? 0.25 : 0.1);
      this.cam.punch(heavy ? 4 : 1.2);
      if (heavy) g.scenes.impact(at, a.kind === 'counter' ? 1 : 0.7);
      if (a.kind === 'counter') g.scenes.cut();
      if (killed) {
        g.state.stats.kills++;
        g.sfx(f.kind === 'wisp' ? 'fire' : 'bone');
        this.fx.release(at, 'red', f.spec.souls);
        if (Math.random() < 0.35) this.fx.release(at, 'yellow', 1);
        if (this.lock === f) this.lock = null;
      }
    }
  }

  private updateFoes(heroAlive: boolean): void {
    const h = this.hero;
    for (let i = this.foes.length - 1; i >= 0; i--) {
      const f = this.foes[i];
      const res = f.update(h.x, h.z, heroAlive);
      if (f.state === 'dead') {
        if (f.model) {
          this.scene3.remove(f.model.root);
          this.movers.remove(f.model.root);
          f.model.dispose();
        }
        this.scene3.remove(this.shadows.get(f)!);
        this.movers.remove(this.shadows.get(f)!);
        this.shadows.delete(f);
        this.foes.splice(i, 1);
        continue;
      }
      if (f.warn) this.fx.glint(new THREE.Vector3(f.x + Math.sin(f.yaw) * 0.25, EYE_Y[f.kind], f.z + Math.cos(f.yaw) * 0.25));
      // keep bodies apart and out of the rock
      for (const o of this.foes) {
        if (o === f || !o.alive) continue;
        const dx = f.x - o.x, dz = f.z - o.z, dd = Math.hypot(dx, dz), min = f.spec.radius + o.spec.radius;
        if (dd > 1e-4 && dd < min) {
          f.x += (dx / dd) * (min - dd) * 0.5;
          f.z += (dz / dd) * (min - dd) * 0.5;
        }
      }
      if (f.alive && f.kind !== 'crow' && f.kind !== 'wisp') {
        const dx = f.x - h.x, dz = f.z - h.z, dd = Math.hypot(dx, dz), min = f.spec.radius + h.radius;
        if (dd > 1e-4 && dd < min) {
          f.x += (dx / dd) * (min - dd);
          f.z += (dz / dd) * (min - dd);
        }
      }
      const p = { x: f.x, z: f.z };
      collide(p, f.spec.radius, this.solid);
      f.x = p.x;
      f.z = p.z;
      if (f.model) {
        f.model.root.position.set(f.x, 0, f.z);
        f.model.root.rotation.y = f.yaw;
        f.model.update(1 / 60);
      }
      this.shadows.get(f)!.position.set(f.x, 0.03, f.z);
      if (res === 'hit') this.blowLands(f);
    }
  }

  private blowLands(f: Foe): void {
    const h = this.hero, g = this.game;
    const dx = f.x - h.x, dz = f.z - h.z;
    const front = dx * h.fx + dz * h.fz > 0;
    const r = h.hit(front);
    const at = new THREE.Vector3((f.x + h.x) / 2, 1.3, (f.z + h.z) / 2);
    if (r === 'parried') {
      f.stagger();
      g.sfx('parry');
      this.fx.spark(at, 0xffffff, 2.4, 0.25);
      g.scenes.flash(1, 1, 1, 6);
      this.hitStop = 8;
      g.slowMo();
    } else if (r === 'guarded') {
      g.sfx('guard');
      this.fx.spark(at, 0xffe0a0, 1.2);
      this.hitStop = 3;
    } else if (r === 'hit') {
      this.damage(f.spec.damage);
    }
  }

  /** `n`: the blow's (or trap's) damage on Normal. */
  private damage(n: number): void {
    const g = this.game;
    g.state.life = Math.max(0, g.state.life - harm(g.state.difficulty, n));
    g.sfx('hit_heavy', { pitch: 0.9 });
    g.scenes.flash(0.6, 0, 0, 5);
    this.cam.shake(0.3);
    if (g.state.life <= 0) {
      this.hero.kill();
      g.state.stats.deaths++;
      this.lock = null;
    }
  }

  private spawn(kind: EnemyKindCh1, x: number, z: number): Foe {
    const model = BUILD_ENEMY[kind]();
    const f = new Foe(kind, x, z, model, toughness(this.game.state.difficulty, FOES[kind].hp));
    f.yaw = Math.atan2(this.hero.x - x, this.hero.z - z);
    model.root.position.set(x, 0, z);
    // meshes only: a wisp's own point light must not get a shadow map
    model.root.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh === true));
    const sh = blobShadow(kind === 'crow' ? 0.9 : kind === 'wisp' ? 0.8 : 1.3);
    this.shadows.set(f, sh);
    this.scene3.add(model.root, sh);
    this.movers.addRig(model.root);
    this.movers.add(sh);
    this.foes.push(f);
    return f;
  }

  private updateEncounter(): void {
    const g = this.game, d = this.d;
    if (this.enc) {
      if (this.enc.foes.some((f) => f.alive)) return;
      const waves = ENCOUNTERS[this.enc.group] ?? [];
      if (this.enc.wave + 1 < waves.length) {
        this.enc.wave++;
        this.spawnWave();
      } else {
        const [x, y] = this.enc.cell.split(',').map(Number);
        g.state.flags[d.flag('enc', x, y)] = true;
        this.enc = null;
        g.sfx('bell', { vol: 0.6 });
        this.saveHere();
      }
      return;
    }
    const cx = cellOf(this.hero.x), cy = cellOf(this.hero.z);
    for (let y = cy - 2; y <= cy + 2; y++) {
      for (let x = cx - 2; x <= cx + 2; x++) {
        if (d.floorObj(x, y) !== 'enemy') continue;
        if (Math.hypot(center(x) - this.hero.x, center(y) - this.hero.z) > 7) continue;
        const group = d.def.encounters[key(x, y)];
        if (!group) continue;
        this.enc = { cell: key(x, y), group, wave: 0, foes: [] };
        this.spawnWave();
        return;
      }
    }
  }

  private spawnWave(): void {
    const e = this.enc!;
    const [x, y] = e.cell.split(',').map(Number);
    const kinds = (ENCOUNTERS[e.group] ?? [])[e.wave] ?? [];
    e.foes = kinds.map((k, i) => {
      const kind = (k in FOES ? k : 'ghoul') as EnemyKindCh1;
      const a = (i / Math.max(1, kinds.length)) * Math.PI * 2 + this.frame;
      return this.spawn(kind, center(x) + Math.cos(a) * 1.2, center(y) + Math.sin(a) * 1.2);
    });
    this.game.sfx('roar', { vol: 0.5 });
  }

  // ----------------------------------------------------------------- items

  private useItem(): void {
    const g = this.game, s = g.state, id = s.currentItem;
    if (s.items[id] <= 0) {
      g.sfx('locked');
      this.say(t('NO {0} LEFT.', t(ITEM_NAMES[id])));
      return;
    }
    if (id === 'talisman') {
      s.items[id]--;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.kit.glow, color: 0xffe6c0, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.scale.set(0.5, 0.7, 1);
      const h = this.hero;
      this.talismans.push({ s: sp, x: h.x + h.fx * 0.6, z: h.z + h.fz * 0.6, vx: h.fx * 14, vz: h.fz * 14, age: 0 });
      this.scene3.add(sp);
      g.sfx('swing');
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
    this.fx.spark(this.hero.root.position.clone().setY(1.2), 0xffe080, 2.5, 0.5);
  }

  private updateTalismans(): void {
    for (let i = this.talismans.length - 1; i >= 0; i--) {
      const m = this.talismans[i];
      m.age += 1 / 60;
      m.x += m.vx / 60;
      m.z += m.vz / 60;
      m.s.position.set(m.x, 1.3 + Math.sin(m.age * 30) * 0.05, m.z);
      let done = m.age > 0.9 || inSolid(m, this.solid);
      for (const f of this.foes) {
        if (done || !f.alive || Math.hypot(f.x - m.x, f.z - m.z) > f.spec.radius + 0.5) continue;
        const at = new THREE.Vector3(f.x, 1.2, f.z);
        this.fx.spark(at, 0xff8040, 1.8, 0.3);
        this.game.sfx('fire');
        if (f.hurt(3, 2.5, m)) {
          this.game.state.stats.kills++;
          this.fx.release(at, 'red', f.spec.souls);
        }
        done = true;
      }
      if (done) {
        this.scene3.remove(m.s);
        m.s.material.dispose();
        this.talismans.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------- the labyrinth

  private markVisited(): void {
    const cx = cellOf(this.hero.x), cy = cellOf(this.hero.z), s = this.game.state;
    s.visited[`${this.id}:${cx},${cy}`] = true;
    for (let dir = 0; dir < 4; dir++) {
      const x = cx + DIR_X[dir], y = cy + DIR_Y[dir];
      if (cellKind(this.d.ch(x, y)) !== 'wall') s.visited[`${this.id}:${x},${y}`] = true;
    }
  }

  private saveHere(): void {
    const s = this.game.state;
    const dir = (Math.round(((Math.PI - this.hero.yaw) / (Math.PI / 2)) + 8) % 4) as 0 | 1 | 2 | 3;
    s.location = { mode: 'dungeon', id: this.id, x: cellOf(this.hero.x), y: cellOf(this.hero.z), dir };
    this.game.saveGame();
  }

  /** Things that happen by walking: new cells, hidden items, warps, spikes, darkness, false walls. */
  private cellEvents(): void {
    const g = this.game, s = g.state, d = this.d, h = this.hero;
    const cx = cellOf(h.x), cy = cellOf(h.z), k = key(cx, cy);
    const nearCentre = Math.hypot(h.x - center(cx), h.z - center(cy)) < 1.0;
    if (k !== this.cell) {
      const was = this.cell;
      this.cell = k;
      this.markVisited();
      s.stats.steps++;
      const ch = d.ch(cx, cy);
      if (ch === 'F' && !s.flags[d.flag('fake', cx, cy)]) {
        s.flags[d.flag('fake', cx, cy)] = true;
        s.stats.secrets++;
        g.sfx('stone');
        this.say(t('THE WALL WAS AN ILLUSION! A HIDDEN PASSAGE.'));
      }
      const [wx, wy] = was ? was.split(',').map(Number) : [-1, -1];
      if (d.isDark(cx, cy) && !d.isDark(wx, wy)) {
        this.say(hasItem(s, 'candle') ? t('CURSED DARKNESS... THE GHOST CANDLE FLARES PALE BLUE.') : t('A CURSED DARKNESS SWALLOWS ALL LIGHT. YOU CAN BARELY SEE.'));
      }
    }
    const ch = d.ch(cx, cy);
    if (ch === '?' && nearCentre && !s.flags[d.flag('hidden', cx, cy)]) {
      s.flags[d.flag('hidden', cx, cy)] = true;
      s.stats.secrets++;
      const loot = d.def.hidden?.[k];
      if (loot) this.give(loot, t('SOMETHING GLINTS IN THE DUST...'));
    }
    if (ch === 'O' && nearCentre) {
      const to = d.def.warps?.[k];
      if (to) {
        g.sfx('warp');
        g.scenes.flash(0.5, 0.7, 1, 20);
        h.x = center(to.x);
        h.z = center(to.y);
        h.yaw = DIR_YAW[to.dir];
        this.cam.update(h.pos, h.yaw, 0, false, null, this.solid, true);
        this.say(t('THE CIRCLE FLARES - YOU ARE CAST ELSEWHERE!'));
      }
    }
    if (this.spikeCool > 0) this.spikeCool--;
    const sp = this.spikes.get(k);
    if (sp?.up && this.spikeCool === 0 && Math.abs(h.x - center(cx)) < 1.7 && Math.abs(h.z - center(cy)) < 1.7) {
      this.spikeCool = 50;
      if (h.hit(false) === 'hit') {
        g.sfx('trap');
        this.damage(d.def.spike ?? 2);
      }
    }
  }

  /** The thing in front of the hero that EXAMINE would act on. */
  private findTarget(): Target | null {
    const d = this.d, h = this.hero, s = this.game.state;
    const cx = cellOf(h.x), cy = cellOf(h.z);
    let best: Target | null = null, bestD = Infinity;
    const consider = (tg: Target, reach: number) => {
      const dx = tg.px - h.x, dz = tg.pz - h.z, dist = Math.hypot(dx, dz);
      if (dist > reach || (dist > 0.3 && (dx * h.fx + dz * h.fz) / dist < 0.45)) return;
      if (dist < bestD) (bestD = dist), (best = tg);
    };
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        const ch = d.ch(x, y);
        if (ch === 'C' && !s.flags[d.flag('chest', x, y)]) consider({ kind: 'chest', x, y, px: center(x), pz: center(y), label: '{ACT} OPEN' }, 2.1);
        else if (isBarrier(ch) && !d.passable(x, y)) consider({ kind: 'barrier', x, y, px: center(x), pz: center(y), label: ch === 'D' || ch === 'L' ? '{ACT} OPEN' : '{ACT} EXAMINE' }, 2.3);
        else if (ch === 'N') consider({ kind: 'npc', x, y, px: center(x), pz: center(y), label: '{ACT} EXAMINE' }, 2.4);
        else if (cellKind(ch) === 'face') {
          // only the side facing the hero's cell
          for (let dir = 0; dir < 4; dir++) {
            if (x + DIR_X[dir] !== cx || y + DIR_Y[dir] !== cy) continue;
            const label = ch === 'T' ? '{ACT} READ' : ch === 'X' ? '{ACT} LEAVE' : ch === 'K' ? '{ACT} ENTER' : '{ACT} PULL';
            consider({ kind: 'face', x, y, px: center(x) + DIR_X[dir] * (CELL / 2), pz: center(y) + DIR_Y[dir] * (CELL / 2), label }, 2.4);
          }
        }
      }
    }
    return best;
  }

  private interact(tg: Target): void {
    const g = this.game, s = g.state, d = this.d, k = key(tg.x, tg.y), ch = d.ch(tg.x, tg.y);
    if (tg.kind === 'chest') {
      s.flags[d.flag('chest', tg.x, tg.y)] = true;
      s.stats.chests++;
      this.chests.get(k)?.open();
      g.sfx('creak');
      const loot = d.def.chests[k];
      if (loot) this.give(loot, t('THE CHEST CREAKS OPEN.'));
      this.saveHere();
      return;
    }
    if (tg.kind === 'npc') return this.say(t(d.def.npcs?.[k] ?? ''));
    if (tg.kind === 'barrier') {
      const b = this.barriers.get(k)!;
      const open = () => {
        s.flags[d.flag('open', tg.x, tg.y)] = true;
        b.setOpen(true);
      };
      switch (b.kind) {
        case 'door':
          open();
          g.sfx('door_open');
          return;
        case 'locked':
          if (s.keys[this.id] > 0) {
            s.keys[this.id]--;
            open();
            g.sfx('unlock');
            this.say(t('THE KEY TURNS. THE LOCK FALLS AWAY.'));
          } else {
            g.sfx('locked');
            this.say(t('A HEAVY LOCK. YOU NEED A KEY.'));
          }
          return;
        case 'seal': {
          const need = d.def.seals?.[k];
          const info = need ? KEY_ITEM_INFO[need] : null;
          if (need && info && hasItem(s, need)) {
            open();
            g.sfx('shatter');
            this.say(t('THE {0} SHINES. THE SEAL CRUMBLES!', t(info.name)));
          } else {
            g.sfx('locked');
            this.say(t('A SACRED SEAL. ONLY THE {0} CAN BREAK IT.', info ? t(info.name) : '?'));
          }
          return;
        }
        case 'breakable':
          return this.say(t('ROTTEN BOARDS BAR THE WAY. STRIKE THEM WITH YOUR SWORD! ({ATTACK})'));
        case 'gate':
          return this.say(t('AN IRON GATE. IT WILL NOT BUDGE. PERHAPS A LEVER MOVES IT.'));
      }
    }
    // faces
    if (ch === 'T') return this.say(t(d.def.tablets?.[k] ?? ''));
    if (ch === 'X') {
      this.ask = { box: new YesNo(t('LEAVE THE LABYRINTH?')), yes: () => g.leaveDungeon(this.id) };
      return;
    }
    if (ch === 'K') {
      this.ask = { box: new YesNo(t('A TERRIBLE PRESENCE WAITS BEYOND. ENTER?')), yes: () => {
        this.saveHere();
        g.startBoss(this.id);
      } };
      return;
    }
    if (ch === '=' || ch === '%') {
      const group = ch === '=' ? 0 : 1;
      const f = `${this.id}:lever${group}`;
      s.flags[f] = !s.flags[f];
      for (const l of this.levers) if (l.group === group) l.lever.set(!!s.flags[f]);
      for (const [bk, b] of this.barriers) {
        if (b.kind !== 'gate') continue;
        const [x, y] = bk.split(',').map(Number);
        b.setOpen(d.passable(x, y));
      }
      g.sfx('lever');
      this.cam.shake(0.2);
      this.say(s.flags[f] ? t('THE LEVER GROANS DOWNWARD. SOMEWHERE, IRON GATES GRIND.') : t('THE LEVER SNAPS BACK UP. DISTANT GATES SHIFT AGAIN.'));
    }
  }

  private give(loot: Loot, intro: string): void {
    const g = this.game, s = g.state;
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

  private say(text: string): void {
    if (text) this.msg.set(text);
  }

  // ----------------------------------------------------------------- light

  quality(q: QualityProfile): void {
    pointShadow(this.heroLight, q);
    lanternCount(this.pool, q);
  }

  private updateLights(): void {
    const h = this.hero, s = this.game.state;
    const dark = this.d.isDark(cellOf(h.x), cellOf(h.z));
    const candle = hasItem(s, 'candle');
    const k = 0.08;
    const wantI = dark ? (candle ? 16 : 1.5) : 14;
    this.heroLight.intensity += (wantI - this.heroLight.intensity) * k;
    this.heroLight.color.lerp(new THREE.Color(dark && candle ? 0x9ec4ff : 0xffd2a0), k);
    this.heroLight.distance = dark && candle ? 9 : 12;
    this.heroLight.position.set(h.x - h.fx * 1.8, 3.3, h.z - h.fz * 1.8);
    this.hemi.intensity += ((dark ? 0.02 : this.hemiBase) - this.hemi.intensity) * k;
    this.scene3.environmentIntensity = (ENV * this.hemi.intensity) / this.hemiBase;
    if (this.fake) this.fake.opacity = hasItem(s, 'mirror') ? 0.55 + 0.25 * Math.sin(this.frame * 0.12) : 1;
    this.heroShadow.position.set(h.x, 0.03, h.z);
    if (this.frame % 20 === 1) {
      const near = this.lanterns
        .map((l) => ({ l, d: Math.hypot(l.pos.x - h.x, l.pos.z - h.z) }))
        .filter((e) => e.d < 24 && !this.d.isDark(cellOf(e.l.pos.x), cellOf(e.l.pos.z)))
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX_LANTERNS);
      this.pool.forEach((p, i) => {
        const e = near[i];
        p.userData.on = !!e;
        if (e) {
          p.position.copy(e.l.pos);
          p.color.setHex(e.l.color);
        }
      });
    }
    this.pool.forEach((p, i) => {
      const target = p.userData.on ? 22 * (0.88 + 0.12 * Math.sin(this.frame * 0.21 + i * 1.7)) : 0;
      p.intensity += (target - p.intensity) * 0.15;
    });
  }

  // ---------------------------------------------------------------- pages

  private updateMap(): void {
    const g = this.game, inp = g.input, s = g.state;
    const over = ITEMS.findIndex((_, i) => inRect(inp.mouse, ITEM_X(i) - 22, 338, 130, 26));
    if (inp.pressed('select') || inp.pressed('cancel') || inp.pressed('start') || inp.mouseRight || (inp.mouseLeft && !inRect(inp.mouse, 60, 24, 520, 400))) {
      this.mode = 'play';
      g.sfx('cancel');
    } else if (inp.mouseLeft && over >= 0) {
      s.currentItem = ITEMS[over];
      g.sfx('cursor');
    } else if (inp.repeat('left') || inp.repeat('right')) {
      const i = ITEMS.indexOf(s.currentItem);
      s.currentItem = ITEMS[(i + (inp.repeat('left') ? ITEMS.length - 1 : 1)) % ITEMS.length];
      g.sfx('cursor');
    }
  }

  // ------------------------------------------------------------------ draw

  private mapView(): MapView {
    const s = this.game.state, h = this.hero;
    return {
      d: this.d,
      seen: (x, y) => !!s.visited[`${this.id}:${x},${y}`],
      full: hasItem(s, `map_${this.id}` as never) || this.game.reveal,
      compass: hasItem(s, 'compass'),
      px: h.x,
      pz: h.z,
      heroYaw: h.yaw,
      camYaw: this.cam.yaw,
      chestOpen: (x, y) => !!s.flags[this.d.flag('chest', x, y)],
    };
  }

  drawUI(ui: UI): void {
    if (!this.ready) return;
    const s = this.game.state;
    if (this.death) return this.death.draw(ui);
    if (this.lock?.alive) {
      const p = new THREE.Vector3(this.lock.x, this.lock.kind === 'crow' ? 2 : 1.2, this.lock.z).project(this.cam.camera);
      if (p.z < 1) {
        const x = (p.x * 0.5 + 0.5) * VIEW.w - VIEW.ox, y = (-p.y * 0.5 + 0.5) * 448;
        const r = 12 + Math.sin(this.frame * 0.2) * 2;
        ui.ctx.save();
        ui.ctx.strokeStyle = COL.red;
        ui.ctx.lineWidth = 2;
        ui.ctx.beginPath();
        ui.ctx.arc(x, y, r, 0, Math.PI * 2);
        ui.ctx.stroke();
        ui.ctx.restore();
        ui.diamond(x, y - r - 6, 4, COL.red);
      }
    }
    drawHud(ui, s, s.keys[this.id], this.game.fatigue);
    if (this.game.settings.minimap) drawMinimap(ui, this.mapView());
    if (this.prompt && !this.msg.active && !this.ask) {
      const [x, y, w, h] = this.promptRect();
      ui.panel(x, y, w, h);
      ui.text(t(this.prompt.label), 320, 321, { size: 15, weight: 600, color: COL.goldLight, align: 'center' });
    }
    this.msg.draw(ui);
    this.ask?.box.draw(ui);
    const inp = this.game.input;
    if (!inp.locked && inp.mouse && inp.device === 'kb' && this.mode === 'play' && !this.ask) {
      ui.text(t('CLICK TO CONTROL THE CAMERA'), 320, 440, { size: 12, align: 'center', color: COL.gray });
    }
    if (this.mode === 'map') this.drawMapPage(ui);
  }

  /** The EXAMINE prompt box (a button for the mouse). */
  private promptRect(): [number, number, number, number] {
    const w = this.game.ui.measure(t(this.prompt?.label ?? ''), 15, 600) + 32;
    return [320 - w / 2, 300, w, 30];
  }

  private drawMapPage(ui: UI): void {
    const s = this.game.state;
    ui.veil(0.6);
    ui.panel(60, 24, 520, 400);
    ui.text(t(this.d.def.name), 320, 56, { size: 18, weight: 700, color: COL.goldLight, align: 'center', spacing: 2 });
    drawFullMap(ui, this.mapView(), 90, 70, 460, 250);
    ITEMS.forEach((id, i) => {
      const x = ITEM_X(i), sel = s.currentItem === id;
      if (sel) ui.diamond(x - 14, 352, 5, COL.red);
      ui.text(`${t(ITEM_NAMES[id])} ×${s.items[id]}`, x, 357, { size: 15, color: sel ? COL.goldLight : s.items[id] ? COL.text : COL.dim });
    });
    const keyItems = s.keyItems.map((k) => t(KEY_ITEM_INFO[k].name)).join(isZh() ? '、' : ' · ');
    ui.text(keyItems, 320, 386, { size: 12, color: COL.gray, align: 'center' });
    ui.text(t('{MOVE}: CHOOSE ITEM   {CANCEL}: CLOSE'), 320, 410, { size: 12, color: COL.dim, align: 'center' });
  }

  dispose(): void {
    this.scene3.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
    this.heroLight.dispose();
    this.fx.dispose();
    this.hero?.dispose();
    for (const f of this.foes) f.model?.dispose();
  }
}
