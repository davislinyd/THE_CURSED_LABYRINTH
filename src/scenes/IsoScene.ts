import * as THREE from 'three';
import { BUILD_ENEMY, EnemyKindCh1 } from '../actors/Enemies';
import { AutoInput, HeroActor } from '../actors/HeroActor';
import { VillagerModel } from '../actors/Villager';
import { BLOOD, EYE_Y, FOES, Foe } from '../combat/Foe';
import { HIT_STOP } from '../combat/HeroMachine';
import { harm, toughness } from '../core/Difficulty';
import type { Game } from '../core/Game';
import { ITEM_NAMES, ItemId, hasItem, swordDamage } from '../core/GameState';
import { Scene } from '../core/SceneManager';
import { ENCOUNTERS } from '../data/encounters';
import { DUNGEONS } from '../data/levels/dungeons';
import { HAIYA, JAR_LOOT, ROAD_S1, Villager } from '../data/levels/iso';
import { BARRIERS, ENTRANCE_DUNGEON, SHRINES, SPIRITS, TOWNS, WORLD_ENTRANCES, WORLD_MAP } from '../data/levels/world';
import { Movers } from '../engine/Interp';
import { ISO_YAW, IsoCam } from '../engine/IsoCam';
import { View } from '../engine/Renderer';
import { t } from '../i18n';
import { DeathOverlay } from '../ui/DeathOverlay';
import { drawHud } from '../ui/Hud';
import { IsoMinimap, MapIcon } from '../ui/IsoMinimap';
import { MessageBox } from '../ui/MessageBox';
import { COL, UI, inRect } from '../ui/UI';
import { YesNo } from '../ui/YesNo';
import { Fx, blobShadow } from '../world/Fx';
import { DRIFT } from '../world/Drift';
import { P2, clearWay, collide } from '../world/Grid3D';
import { FogVeil } from '../world/FogVeil';
import { FOG_BLOCK, fogBlock, fogKey, liftFog } from '../world/IsoFog';
import { IsoGrid, SUB, tileMid, tileOf, worldMid, worldRows, worldTile } from '../world/IsoMap';
import { CUT, IsoLevel, IsoTheme, buildIsoLevel } from '../world/IsoLevel';
import { Lantern } from '../world/Level3D';
import { MAX_LANTERNS, lanternCount, moonShadow } from '../engine/Lighting';
import type { QualityProfile } from '../engine/Quality';
import { PropKit, loadPropKit } from '../world/Props';

export type AreaKind = 'world' | 'village' | 'road';

type PointKind = 'village' | 'shrine' | 'entrance' | 'barrier' | 'npc' | 'goal' | 'back';

/** Something the hero can walk up to and act on. */
interface Point {
  kind: PointKind;
  x: number;
  z: number;
  ch: string;
  label: string;
  npc?: Villager;
}

interface Loot {
  kind: 'gold' | 'item';
  id?: ItemId;
  n: number;
  x: number;
  z: number;
  obj: THREE.Object3D;
  age: number;
}

interface Talisman {
  s: THREE.Sprite;
  x: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
}

/** Where a mouse click sent the hero. */
type Goal =
  | { kind: 'walk'; path: P2[]; then: Point | null; loot?: Loot }
  | { kind: 'foe'; foe: Foe; hold: boolean };

/** What lies under the mouse cursor. */
type Pick = { foe?: Foe; loot?: Loot; point?: Point };

const REACH = 2.4;
const ITEMS: ItemId[] = ['herb', 'elixir', 'talisman'];
const AREA_NAME: Record<AreaKind, string> = {
  world: 'HAIYA PLAINS',
  village: 'HAIYA VILLAGE',
  road: 'THE ROTWOOD ROAD',
};
const NPC_LABEL: Record<Villager['role'], string> = {
  talk: '{ACT} TALK',
  shop: '{ACT} SHOP',
  inn: '{ACT} REST',
};
const THEME: Record<AreaKind, IsoTheme> = { world: 'field', village: 'village', road: 'forest' };
const FOE_NAMES: Record<EnemyKindCh1, string> = {
  ghoul: 'DEAD FOOTSOLDIER',
  hopper: 'SHROUDED CORPSE',
  wisp: 'GHOST FIRE',
  crow: 'CARRION CROW',
};
const FLYING = new Set<EnemyKindCh1>(['crow', 'wisp']);
/** Minimap marks: colour and radius. */
const ICON: Record<PointKind, [string, number]> = {
  village: [COL.goldLight, 4],
  shrine: [COL.red, 3],
  entrance: ['#c0506a', 3.5],
  barrier: ['#a070d0', 3],
  npc: [COL.text, 2],
  goal: [COL.goldLight, 3.5],
  back: [COL.gold, 3],
};
/** Baseline of each shop row. */
const SHOP_Y = (i: number) => 166 + i * 34;

/**
 * The isometric areas: the world map, Haiya village and the Rotwood Road. Hack and
 * slash with the same samurai, by keyboard, gamepad or mouse (click to walk / attack,
 * right click for a strong blow).
 */
export class IsoScene implements Scene {
  readonly playTime = true;
  view: View | null = null;
  private readonly scene3 = new THREE.Scene();
  private readonly cam = new IsoCam();
  private readonly grid: IsoGrid;
  private level!: IsoLevel;
  private kit!: PropKit;
  private mini!: IsoMinimap;
  /** The fog of war in the 3D view. */
  private veil!: FogVeil;
  private hero!: HeroActor;
  private heroShadow!: THREE.Mesh;
  private readonly heroLight = new THREE.PointLight(0xffd2a0, 10, 13, 1.3);
  private readonly pool: THREE.PointLight[] = [];
  private lanterns: Lantern[] = [];
  private readonly fx = new Fx(DRIFT.iso);
  private readonly foes: Foe[] = [];
  private readonly shadows = new Map<Foe, THREE.Mesh>();
  private readonly loot: Loot[] = [];
  private readonly talismans: Talisman[] = [];
  private readonly villagers: { m: VillagerModel; v: Villager; x: number; z: number }[] = [];
  private points: Point[] = [];
  private readonly msg = new MessageBox();
  private ask: { box: YesNo; yes: () => void } | null = null;
  private shop: { cursor: number } | null = null;
  private death: DeathOverlay | null = null;
  private goal: Goal | null = null;
  /** Ground point a mouse blow or talisman is aimed at, until the action is over. */
  private aim: P2 | null = null;
  private hover: Pick | null = null;
  private prompt: Point | null = null;
  private talkIdx = new Map<Villager, number>();
  private ready = false;
  private frame = 0;
  private hitStop = 0;
  /** Foes struck by the blow that started the current hit-stop. */
  private readonly struck: Foe[] = [];
  private readonly movers = new Movers();

  constructor(private readonly game: Game, private readonly area: AreaKind) {
    const flags = game.state.flags;
    this.grid =
      area === 'world' ? new IsoGrid(worldRows(), false, (c) => !!flags[`barrier:${c}`])
        : new IsoGrid(area === 'village' ? HAIYA.map : ROAD_S1, true);
    void this.build().catch((e) => console.error(e));
  }

  get pausable(): boolean {
    return !this.msg.active && !this.ask && !this.shop && !this.death;
  }

  enter(): void {
    this.game.music(this.area === 'road' ? 'BATTLE' : 'WORLD');
    this.game.audio.setSpace(this.area === 'village' ? 0.3 : 0.5);
  }

  resume(): void {
    this.game.audio.resumeMusic();
  }

  get moving(): readonly THREE.Object3D[] {
    return this.movers.list;
  }

  // ------------------------------------------------------------------ build

  private async build(): Promise<void> {
    const g = this.game, s3 = this.scene3, grid = this.grid;
    this.kit = await loadPropKit(g.assets);
    this.level = await buildIsoLevel(grid, THEME[this.area], g.assets, this.kit, this.area === 'village' ? HAIYA.buildings : []);
    moonShadow(this.level.moon, g.gfx.quality);
    s3.environment = await g.assets.environment('moonlit_golf', g.gfx.gl);
    s3.environmentIntensity = 0.3;
    s3.background = new THREE.Color(0x020306);
    s3.add(this.level.group, this.heroLight, this.fx.group);
    this.lanterns = this.level.lanterns;
    for (let i = 0; i < MAX_LANTERNS; i++) {
      const l = new THREE.PointLight(0xffa860, 0, 11, 1.5);
      this.pool.push(l);
      s3.add(l);
    }
    lanternCount(this.pool, g.gfx.quality);
    for (const [ch, ms] of this.level.mists) for (const m of ms) m.visible = !g.state.flags[`barrier:${ch}`];
    const known = (bx: number, by: number) => !!g.state.visited[fogKey(this.area, bx, by)];
    this.mini = new IsoMinimap(grid, known);
    this.veil = new FogVeil(Math.ceil(grid.w / FOG_BLOCK), Math.ceil(grid.h / FOG_BLOCK), known);

    let start: P2;
    if (this.area === 'world') {
      const loc = g.state.location;
      start = loc.mode === 'world' ? { x: worldMid(loc.x), z: worldMid(loc.y) } : { x: worldMid(6), z: worldMid(25) };
      this.worldPoints();
      for (const sp of SPIRITS) {
        for (const [i, k] of (ENCOUNTERS[sp.group]?.[0] ?? []).entries()) {
          if (!(k in FOES)) continue;
          const f = this.spawn(k as EnemyKindCh1, worldMid(sp.x) + (i - 1) * 1.4, worldMid(sp.y) + (i % 2) * 1.2);
          f.roam = true;
        }
      }
    } else {
      const p = grid.marker('P')!;
      start = { x: tileMid(p.x), z: tileMid(p.y) };
      const back = grid.marker('X')!;
      this.points.push({ kind: 'back', x: tileMid(back.x), z: tileMid(back.y), ch: 'X', label: '{ACT} LEAVE' });
      if (this.area === 'road') {
        const goal = grid.marker('G')!;
        this.points.push({ kind: 'goal', x: tileMid(goal.x), z: tileMid(goal.y), ch: 'G', label: '{ACT} ENTER' });
        for (const m of grid.markers) if ('ghwc'.includes(m.ch)) this.spawn(({ g: 'ghoul', h: 'hopper', w: 'wisp', c: 'crow' } as const)[m.ch as 'g'], tileMid(m.x), tileMid(m.y));
      } else {
        for (const v of HAIYA.villagers) {
          const m = new VillagerModel(v.look);
          const x = tileMid(v.x), z = tileMid(v.y);
          m.root.position.set(x, 0, z);
          m.root.rotation.y = Math.atan2(16 * SUB - x, 12 * SUB - z);
          s3.add(m.root);
          const sh = blobShadow(0.9);
          sh.position.set(x, 0.03, z);
          s3.add(sh);
          this.movers.addRig(m.root);
          this.villagers.push({ m, v, x, z });
          this.points.push({ kind: 'npc', x, z, ch: 'N', label: NPC_LABEL[v.role], npc: v });
        }
      }
    }
    this.hero = new HeroActor(start.x, start.z, g.fatigue);
    this.hero.yaw = ISO_YAW;
    this.hero.root.traverse((o) => (o.castShadow = true));
    this.heroShadow = blobShadow(1.3);
    s3.add(this.hero.root, this.heroShadow, this.hero.effects);
    s3.onBeforeRender = () => this.hero.drawTrail();
    this.movers.add(this.cam.camera, this.heroShadow, this.heroLight);
    this.movers.addRig(this.hero.root);
    this.cam.update(this.hero.pos, true);
    this.see();
    this.view = { scene: s3, camera: this.cam.camera, mist: g.reveal ? null : this.veil };
    this.ready = true;
  }

  /** Villages, shrines, chapter entrances and spirit barriers of the world map. */
  private worldPoints(): void {
    const flags = this.game.state.flags;
    const seen = new Set<string>();
    WORLD_MAP.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        const ch = row[tx], x = worldMid(tx), z = worldMid(ty);
        if (ch === 'V' || ch === 'v') this.points.push({ kind: 'village', x, z, ch, label: '{ACT} ENTER' });
        else if (ch === 'S') this.points.push({ kind: 'shrine', x, z, ch: `${tx},${ty}`, label: '{ACT} PRAY' });
        else if (ENTRANCE_DUNGEON[ch]) this.points.push({ kind: 'entrance', x, z, ch, label: '{ACT} ENTER' });
        else if (BARRIERS[ch] && !flags[`barrier:${ch}`] && !seen.has(ch)) {
          seen.add(ch);
          this.points.push({ kind: 'barrier', x, z, ch, label: '{ACT} EXAMINE' });
        }
      }
    });
  }

  private spawn(kind: EnemyKindCh1, x: number, z: number): Foe {
    const model = BUILD_ENEMY[kind]();
    const f = new Foe(kind, x, z, model, toughness(this.game.state.difficulty, FOES[kind].hp));
    f.yaw = Math.random() * Math.PI * 2;
    model.root.position.set(x, 0, z);
    // meshes only: a wisp carries a point light, which would render (and keep) a cube shadow map
    model.root.traverse((o) => (o.castShadow = (o as THREE.Mesh).isMesh === true));
    const sh = blobShadow(kind === 'crow' ? 0.9 : kind === 'wisp' ? 0.8 : 1.3);
    this.shadows.set(f, sh);
    this.scene3.add(model.root, sh);
    this.movers.addRig(model.root);
    this.movers.add(sh);
    this.foes.push(f);
    return f;
  }

  // ------------------------------------------------------------------ update

  update(): void {
    if (!this.ready) return;
    this.frame++;
    const g = this.game, inp = g.input, h = this.hero;
    if (this.death) return this.death.update();
    if (this.shop) return this.updateShop();
    const modal = this.msg.active || this.ask !== null;
    if (this.msg.active) {
      if (this.msg.update(inp.held('confirm'))) g.sfx('text', { vol: 0.4 });
      if (inp.pressed('confirm') || inp.pressed('cancel') || inp.mouseLeft) this.msg.advance();
    } else if (this.ask) {
      const a = this.ask, r = a.box.update(g);
      if (r) this.ask = null;
      if (r === 'yes') return a.yes();
    } else {
      if (inp.pressed('select')) this.cycleItem(1);
      if (inp.pressed('map')) {
        g.settings.minimap = !g.settings.minimap;
        g.applySettings();
        g.sfx('page');
      }
    }
    this.pointer();
    const alive = h.state !== 'die';
    const auto = modal || !alive ? null : this.mouse();
    if (this.hitStop > 0) {
      this.hitStop--;
      this.jolt();
      if (auto) h.stall(inp, auto);
      return;
    }
    this.struck.length = 0;
    const target = this.goal?.kind === 'foe' ? this.goal.foe : null;
    h.update(inp, ISO_YAW, this.grid.solid, target, modal || !alive, auto, this.foes);
    if (h.state === 'idle' || h.state === 'run' || h.state === 'guard') this.aim = null;
    for (const e of h.machine.events) {
      if (e === 'swing') g.sfx(h.state === 'strong' || h.state === 'counter' ? 'swing_heavy' : 'swing');
      if (e === 'use') this.useItem();
      if (e === 'dust') this.fx.dust(h.x, h.z);
    }
    if (h.state === 'run' && this.frame % Math.round(20 / h.fatigue.pace) === 0) g.sfx(this.area === 'village' ? 'step_stone' : 'step_grass', { vol: 0.3 });
    this.strikeFoes();
    this.strikeJars();
    if (!modal) this.updateFoes(alive);
    this.updateTalismans();
    this.updateLoot();
    const got = this.fx.update(1 / 60, h.root.position);
    if (got.red) {
      g.state.weaponExp += got.red;
      g.sfx('soul', { vol: 0.5 });
    }
    if (got.yellow) {
      g.state.life = Math.min(g.state.maxLife, g.state.life + got.yellow);
      g.sfx('soul', { vol: 0.5, pitch: 1.3 });
    }
    for (const v of this.villagers) {
      const d = Math.hypot(h.x - v.x, h.z - v.z);
      v.m.update(this.frame / 60, d < 4 ? Math.atan2(h.x - v.x, h.z - v.z) : null);
    }
    if (!modal && alive) {
      this.prompt = this.nearPoint();
      if (this.prompt && inp.pressed('act')) this.interact(this.prompt);
    } else this.prompt = null;
    if (this.frame % 10 === 0) this.see();
    this.veil.tick();
    this.view!.mist = g.reveal ? null : this.veil;
    this.level.update(this.frame / 60);
    this.cam.update(h.pos, false);
    this.updateLights();
    if (!alive && h.machine.t > 100) {
      this.death = new DeathOverlay(g);
      g.audio.stopMusic(1.5);
    }
  }

  // ------------------------------------------------------------------ mouse

  /**
   * Diablo-style mouse. Left click walks, chases and strikes a foe, goes to use a
   * place or picks up a dropped thing; with a move key held it strikes toward the
   * cursor on the spot (hold to keep striking). Right click strikes hard toward the
   * cursor. Keys 1-3 use an item (a talisman flies toward the cursor); the wheel
   * changes the item.
   */
  private mouse(): AutoInput {
    const g = this.game, inp = g.input, h = this.hero, at = inp.mouse;
    const m = inp.move(), stepping = m.x !== 0 || m.y !== 0;
    if (stepping) this.goal = null;
    if (inp.wheel) this.cycleItem(inp.wheel);
    const slot = inp.slot();
    if (slot >= 0) g.state.currentItem = ITEMS[slot];
    const out: AutoInput = { dx: 0, dz: 0, attack: false, strong: inp.mouseRight, use: slot >= 0 };
    const ground = at && this.cam.groundAt(at.x, at.y);
    const onSpot = stepping && inp.mouseHeld;
    if (ground && (out.strong || onSpot || ITEMS[slot] === 'talisman')) this.aim = ground;
    if (out.strong) this.goal = null;
    if (inp.mouseLeft && this.onButton()) {
      this.goal = null;
      this.interact(this.prompt!);
    } else if (onSpot) out.attack = inp.mouseLeft || h.machine.ready;
    else if (inp.mouseLeft) this.click(ground);
    else if (ground && inp.mouseHeld && this.goal?.kind === 'walk' && !this.goal.then && !this.goal.loot && this.frame % 6 === 0) {
      // held down: follow the cursor, finding a new way only once it has moved off the old end
      const end = this.goal.path[this.goal.path.length - 1];
      if (!end || Math.hypot(end.x - ground.x, end.z - ground.z) > 0.75) this.walkTo(ground);
    }
    this.follow(out);
    if (this.aim) out.face = Math.atan2(this.aim.x - h.x, this.aim.z - h.z);
    return out;
  }

  /** Steer along the clicked path, or close on the clicked foe and strike it. */
  private follow(out: AutoInput): void {
    const h = this.hero, goal = this.goal;
    if (!goal) return;
    if (goal.kind === 'foe') {
      const f = goal.foe;
      if (!f.alive) {
        this.goal = null;
        return;
      }
      const dx = f.x - h.x, dz = f.z - h.z, d = Math.hypot(dx, dz);
      if (d - f.spec.radius > REACH - 0.6) {
        out.dx = dx / d;
        out.dz = dz / d;
        return;
      }
      // held on a foe: strike again each time the last blow may be cut short
      const hold = goal.hold && this.game.input.mouseHeld;
      if (!hold) this.goal = null;
      out.attack = !hold || h.machine.ready;
      return;
    }
    while (goal.path.length && Math.hypot(goal.path[0].x - h.x, goal.path[0].z - h.z) < (goal.path.length === 1 ? 0.25 : 0.6)) goal.path.shift();
    const then = goal.then;
    if (then && Math.hypot(then.x - h.x, then.z - h.z) < 2.2) {
      this.goal = null;
      return this.interact(then);
    }
    if (!goal.path.length || (goal.loot && !this.loot.includes(goal.loot))) {
      // arrived beside it (or picked it up)
      this.goal = null;
      if (then) this.interact(then);
      return;
    }
    // cut the corners of the tile-to-tile path: head straight for the farthest point in plain reach
    for (let i = Math.min(goal.path.length, 8) - 1; i > 0; i--) {
      if (!clearWay(h.pos, goal.path[i], h.radius, this.grid.solid)) continue;
      goal.path.splice(0, i);
      break;
    }
    const n = goal.path[0], dx = n.x - h.x, dz = n.z - h.z, d = Math.hypot(dx, dz) || 1;
    out.dx = dx / d;
    out.dz = dz / d;
  }

  /** A left click: on a foe, a dropped thing, a place, or the ground under the cursor. */
  private click(ground: P2 | null): void {
    const pick = this.hover;
    if (pick?.foe) {
      this.goal = { kind: 'foe', foe: pick.foe, hold: true };
      return;
    }
    if (pick?.loot) return this.walkTo(pick.loot, pick.loot);
    // an unreachable point (across water, behind a barrier) is just a place to walk toward
    const pt = pick?.point, path = pt && this.grid.path(this.hero.pos, this.standBy(pt));
    if (pt && path) {
      this.goal = { kind: 'walk', path, then: pt };
      return;
    }
    if (ground) this.walkTo(ground);
  }

  private walkTo(p: P2, loot?: Loot): void {
    const path = this.grid.path(this.hero.pos, p);
    if (path) path[path.length - 1] = p;
    this.goal = { kind: 'walk', path: path ?? [p], then: null, loot };
  }

  /** The foe, dropped thing or place under a screen point, in that order. */
  private pick(sx: number, sy: number): Pick | null {
    const near = (x: number, y: number, z: number, r: number) => {
      const p = this.cam.toScreen(x, y, z);
      return Math.hypot(p.x - sx, p.y - sy) < r;
    };
    const foe = this.foes.find((f) => f.alive && near(f.x, f.kind === 'crow' ? 2 : 1, f.z, 26));
    if (foe) return { foe };
    const loot = this.loot.find((l) => inRect({ x: sx, y: sy }, ...this.lootRect(l)) || near(l.x, 0.1, l.z, 16));
    if (loot) return { loot };
    const flags = this.game.state.flags;
    const point = this.points.find((p) => !(p.kind === 'barrier' && flags[`barrier:${p.ch}`]) && near(p.x, 1, p.z, 30));
    return point ? { point } : null;
  }

  /** What the mouse points at this tick, and the cursor for it. */
  private pointer(): void {
    const inp = this.game.input, at = inp.mouse;
    const free = !this.msg.active && !this.ask && this.hero.state !== 'die';
    this.hover = at && free ? this.pick(at.x, at.y) : null;
    inp.cursor = this.hover?.foe ? 'attack' : this.hover || this.onButton() ? 'act' : 'normal';
  }

  /** The mouse is over the EXAMINE prompt box. */
  private onButton(): boolean {
    return !!this.prompt && inRect(this.game.input.mouse, ...this.promptRect());
  }

  private cycleItem(dir: number): void {
    const s = this.game.state;
    s.currentItem = ITEMS[(ITEMS.indexOf(s.currentItem) + dir + ITEMS.length) % ITEMS.length];
    this.game.sfx('cursor');
  }

  /** An open tile beside a (solid) point to walk to. */
  private standBy(p: Point): P2 {
    const h = this.hero;
    let best: P2 = { x: p.x, z: p.z }, bd = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = tileOf(p.x) + dx, y = tileOf(p.z) + dy;
        if (this.grid.blocked(x, y)) continue;
        const d = Math.hypot(tileMid(x) - h.x, tileMid(y) - h.z);
        if (d < bd) (bd = d), (best = { x: tileMid(x), z: tileMid(y) });
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- combat

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
      if (heavy) g.scenes.impact(at, a.kind === 'counter' ? 1 : 0.7);
      if (a.kind === 'counter') g.scenes.cut();
      if (killed) this.foeDown(f, at);
    }
  }

  /** The foes just struck shudder while the world stands still. */
  private jolt(): void {
    for (const f of this.struck) f.model?.root.position.set(f.x + (Math.random() - 0.5) * 0.12, 0, f.z + (Math.random() - 0.5) * 0.12);
  }

  private foeDown(f: Foe, at: THREE.Vector3): void {
    const g = this.game;
    g.state.stats.kills++;
    g.sfx(f.kind === 'wisp' ? 'fire' : 'bone');
    this.fx.release(at, 'red', f.spec.souls);
    if (Math.random() < 0.25) this.fx.release(at, 'yellow', 1);
    const r = Math.random();
    if (r < 0.3) this.drop('gold', 3 + Math.floor(Math.random() * 6), f.x, f.z);
    else if (r < 0.4) this.drop('item', 1, f.x, f.z, 'herb');
    else if (r < 0.47) this.drop('item', 2, f.x, f.z, 'talisman');
  }

  private strikeJars(): void {
    const h = this.hero, a = h.machine.attack;
    if (!a) return;
    for (const [k, obj] of this.level.jars) {
      const [x, y] = k.split(',').map(Number);
      if (!h.inSweep({ x: tileMid(x), z: tileMid(y) }, 0.4)) continue;
      this.scene3.remove(obj);
      obj.removeFromParent();
      this.level.jars.delete(k);
      this.grid.set(x, y, '.');
      this.game.sfx('shatter');
      this.fx.spark(new THREE.Vector3(tileMid(x), 0.6, tileMid(y)), 0xd0c0a0, 1.2, 0.2);
      const l = JAR_LOOT[Math.floor(Math.random() * JAR_LOOT.length)];
      if (l.kind === 'gold') this.drop('gold', l.n, tileMid(x), tileMid(y));
      else this.drop('item', l.n, tileMid(x), tileMid(y), l.id);
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
        if (this.goal?.kind === 'foe' && this.goal.foe === f) this.goal = null;
        continue;
      }
      if (f.warn) this.fx.glint(new THREE.Vector3(f.x + Math.sin(f.yaw) * 0.25, EYE_Y[f.kind], f.z + Math.cos(f.yaw) * 0.25));
      for (const o of this.foes) {
        if (o === f || !o.alive) continue;
        const dx = f.x - o.x, dz = f.z - o.z, dd = Math.hypot(dx, dz), min = f.spec.radius + o.spec.radius;
        if (dd > 1e-4 && dd < min) {
          f.x += (dx / dd) * (min - dd) * 0.5;
          f.z += (dz / dd) * (min - dd) * 0.5;
        }
      }
      if (f.alive && !FLYING.has(f.kind)) {
        const dx = f.x - h.x, dz = f.z - h.z, dd = Math.hypot(dx, dz), min = f.spec.radius + h.radius;
        if (dd > 1e-4 && dd < min) {
          f.x += (dx / dd) * (min - dd);
          f.z += (dz / dd) * (min - dd);
        }
      }
      // a body knocked back (even as it falls) stops at the rock
      if (!FLYING.has(f.kind)) {
        const p = { x: f.x, z: f.z };
        collide(p, f.spec.radius, this.grid.solid);
        f.x = p.x;
        f.z = p.z;
      }
      f.x = Math.max(1, Math.min(this.grid.w * SUB - 1, f.x));
      f.z = Math.max(1, Math.min(this.grid.h * SUB - 1, f.z));
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
    const front = (f.x - h.x) * h.fx + (f.z - h.z) * h.fz > 0;
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
      g.state.life = Math.max(0, g.state.life - harm(g.state.difficulty, f.spec.damage));
      g.sfx('hit_heavy', { pitch: 0.9 });
      g.scenes.flash(0.6, 0, 0, 5);
      this.cam.shake(0.3);
      this.goal = null;
      if (g.state.life <= 0) {
        h.kill();
        g.state.stats.deaths++;
      }
    }
  }

  // ----------------------------------------------------------------- items

  private useItem(): void {
    const g = this.game, s = g.state, id = s.currentItem;
    if (s.items[id] <= 0) {
      g.sfx('locked');
      return this.say(t('NO {0} LEFT.', t(ITEM_NAMES[id])));
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
      return this.say(t('YOU ARE ALREADY HALE.'));
    }
    s.items[id]--;
    s.life = id === 'elixir' ? s.maxLife : Math.min(s.maxLife, s.life + 6);
    g.sfx('heal');
    g.scenes.flash(0.3, 1, 0.5, 8);
  }

  private updateTalismans(): void {
    for (let i = this.talismans.length - 1; i >= 0; i--) {
      const m = this.talismans[i];
      m.age += 1 / 60;
      m.x += m.vx / 60;
      m.z += m.vz / 60;
      m.s.position.set(m.x, 1.3 + Math.sin(m.age * 30) * 0.05, m.z);
      let done = m.age > 0.9 || this.grid.ch(tileOf(m.x), tileOf(m.z)) === '#' || this.grid.ch(tileOf(m.x), tileOf(m.z)) === 'H';
      for (const f of this.foes) {
        if (done || !f.alive || Math.hypot(f.x - m.x, f.z - m.z) > f.spec.radius + 0.5) continue;
        const at = new THREE.Vector3(f.x, 1.2, f.z);
        this.fx.spark(at, 0xff8040, 1.8, 0.3);
        this.game.sfx('fire');
        if (f.hurt(3, 2.5, m)) this.foeDown(f, at);
        done = true;
      }
      if (done) {
        this.scene3.remove(m.s);
        m.s.material.dispose();
        this.talismans.splice(i, 1);
      }
    }
  }

  private drop(kind: Loot['kind'], n: number, x: number, z: number, id?: ItemId): void {
    const k = this.kit, o = new THREE.Group();
    if (kind === 'gold') {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 10), k.gold);
        c.position.set((Math.random() - 0.5) * 0.15, 0.02 + i * 0.03, (Math.random() - 0.5) * 0.15);
        o.add(c);
      }
    } else {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.3), id === 'talisman' ? k.paper : new THREE.MeshStandardMaterial({ color: 0x3a6a2a, roughness: 0.8 }));
      c.position.y = 0.03;
      o.add(c);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: k.glow, color: kind === 'gold' ? 0xffd070 : 0xa0ffb0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    glow.scale.setScalar(0.8);
    glow.position.y = 0.25;
    o.add(glow);
    const a = Math.random() * Math.PI * 2;
    const p = { x: x + Math.cos(a) * 0.6, z: z + Math.sin(a) * 0.6 };
    collide(p, 0.2, this.grid.solid);
    o.position.set(p.x, 0, p.z);
    this.scene3.add(o);
    this.loot.push({ kind, id, n, x: p.x, z: p.z, obj: o, age: 0 });
    this.game.sfx('drop', { vol: 0.5 });
  }

  private updateLoot(): void {
    const h = this.hero, s = this.game.state;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      l.age++;
      if (l.age < 20 || Math.hypot(l.x - h.x, l.z - h.z) > 0.9 || h.state === 'die') continue;
      if (l.kind === 'gold') {
        s.gold += l.n;
        this.game.sfx('coin');
      } else {
        s.items[l.id!] += l.n;
        this.game.sfx('pickup');
      }
      this.scene3.remove(l.obj);
      this.loot.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- places

  private nearPoint(): Point | null {
    const h = this.hero;
    let best: Point | null = null, bd = 3;
    for (const p of this.points) {
      if (p.kind === 'barrier' && this.game.state.flags[`barrier:${p.ch}`]) continue;
      const d = Math.hypot(p.x - h.x, p.z - h.z) - (p.kind === 'barrier' ? 2 : 0);
      if (d < bd) (bd = d), (best = p);
    }
    return best;
  }

  private interact(p: Point): void {
    const g = this.game, s = g.state;
    switch (p.kind) {
      case 'village':
        return this.confirm(t('ENTER {0}?', t(TOWNS[p.ch].name)), () => g.enterTown(worldTile(this.hero.x), worldTile(this.hero.z)));
      case 'shrine': {
        s.life = s.maxLife;
        s.location = { mode: 'world', x: worldTile(this.hero.x), y: worldTile(this.hero.z) };
        s.checkpoint = { ...s.location };
        g.saveGame();
        g.sfx('heal');
        g.scenes.flash(1, 0.9, 0.6, 10);
        return this.say(t(SHRINES[p.ch] ?? 'A QUIET SHRINE. YOUR WOUNDS CLOSE.'));
      }
      case 'entrance': {
        const id = ENTRANCE_DUNGEON[p.ch];
        if (id === 'd1' && !s.flags['stage:s1']) return this.confirm(t('ENTER {0}?', t('THE ROTWOOD ROAD')), () => g.startRoad());
        return this.confirm(t('ENTER {0}?', t(DUNGEONS[id].name)), () => g.enterDungeon(id));
      }
      case 'barrier': {
        const b = BARRIERS[p.ch];
        if (!b.need.every((k) => hasItem(s, k))) return this.say(t(b.closed));
        s.flags[`barrier:${p.ch}`] = true;
        for (const m of this.level.mists.get(p.ch) ?? []) m.visible = false;
        this.mini.paint();
        g.sfx('warp');
        return this.say(t(b.opened));
      }
      case 'npc': {
        const v = p.npc!, town = TOWNS.V;
        if (v.role === 'shop') {
          this.shop = { cursor: 0 };
          return g.sfx('page');
        }
        if (v.role === 'inn') return this.confirm(t('REST AT THE INN FOR {0}G?', town.inn), () => this.rest(town.inn));
        const i = this.talkIdx.get(v) ?? 0;
        this.talkIdx.set(v, i + 1);
        return this.say(t(town.talk[v.lines[i % v.lines.length]]));
      }
      case 'goal':
        return this.confirm(t('ENTER {0}?', t(DUNGEONS.d1.name)), () => g.stageCleared());
      case 'back':
        if (this.area === 'road') return this.confirm(t('RETURN TO THE PLAINS?'), () => g.toWorld(WORLD_ENTRANCES.d1.x, WORLD_ENTRANCES.d1.y));
        return this.confirm(t('LEAVE {0}?', t(TOWNS.V.name)), () => g.toWorld());
    }
  }

  private rest(price: number): void {
    const g = this.game, s = g.state;
    if (s.gold < price) {
      g.sfx('locked');
      return this.say(t('INNKEEPER: YOU HAVE NOT THE COIN, FRIEND.'));
    }
    s.gold -= price;
    s.life = s.maxLife;
    s.checkpoint = { ...s.location };
    g.saveGame();
    g.sfx('heal');
    g.scenes.flash(1, 0.85, 0.6, 14);
    this.say(t('YOU SLEEP BENEATH A WARM LAMP. LIFE RESTORED. YOUR JOURNEY IS RECORDED.'));
  }

  private updateShop(): void {
    const g = this.game, inp = g.input, s = g.state, list = TOWNS.V.shop, sh = this.shop!;
    const n = list.length + 1;
    const over = Array.from({ length: n }, (_, i) => i).findIndex((i) => inRect(inp.mouse, 170, SHOP_Y(i) - 22, 310, 32));
    if (over >= 0 && inp.mouseMoved && over !== sh.cursor) {
      sh.cursor = over;
      g.sfx('cursor');
    }
    const click = inp.mouseLeft && over >= 0;
    if (click) sh.cursor = over;
    if (inp.mouseRight) {
      this.shop = null;
      g.sfx('cancel');
    } else if (inp.repeat('up')) {
      sh.cursor = (sh.cursor + n - 1) % n;
      g.sfx('cursor');
    } else if (inp.repeat('down')) {
      sh.cursor = (sh.cursor + 1) % n;
      g.sfx('cursor');
    } else if (inp.pressed('cancel') || ((inp.pressed('confirm') || click) && sh.cursor === list.length)) {
      this.shop = null;
      g.sfx('cancel');
    } else if (inp.pressed('confirm') || click) {
      const it = list[sh.cursor];
      if (s.gold < it.price) g.sfx('locked');
      else {
        s.gold -= it.price;
        s.items[it.item] += it.n;
        g.sfx('coin');
      }
    }
  }

  private confirm(text: string, yes: () => void): void {
    this.ask = { box: new YesNo(text), yes };
  }

  private say(text: string): void {
    if (text) this.msg.set(text);
  }

  // ----------------------------------------------------------------- light

  quality(q: QualityProfile): void {
    if (!this.ready) return;
    moonShadow(this.level.moon, q);
    lanternCount(this.pool, q);
  }

  private updateLights(): void {
    const h = this.hero;
    this.heroLight.position.set(h.x, 3.2, h.z);
    this.heroShadow.position.set(h.x, 0.03, h.z);
    const moon = this.level.moon;
    moon.target.position.set(h.x, 0, h.z);
    moon.position.set(h.x - 14, 26, h.z + 8);
    CUT.uHero.value.set(h.x, 1, h.z);
    CUT.uBack.value.copy(this.cam.back);
    if (this.frame % 20 === 1) {
      const near = this.lanterns
        .map((l) => ({ l, d: Math.hypot(l.pos.x - h.x, l.pos.z - h.z) }))
        .filter((e) => e.d < 22)
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
      const target = p.userData.on ? 10 * (0.88 + 0.12 * Math.sin(this.frame * 0.21 + i * 1.7)) : 0;
      p.intensity += (target - p.intensity) * 0.15;
    });
  }

  // ------------------------------------------------------------------- UI

  drawUI(ui: UI): void {
    if (!this.ready) return;
    const s = this.game.state;
    if (this.death) return this.death.draw(ui);
    // ground labels of dropped things, as in a looter's eye
    const hv = this.hover;
    for (const l of this.loot) {
      const [x, y, w, h] = this.lootRect(l), on = hv?.loot === l;
      ui.ctx.fillStyle = on ? 'rgba(48, 34, 14, 0.9)' : 'rgba(0,0,0,0.65)';
      ui.ctx.fillRect(x, y, w, h);
      if (on) {
        ui.ctx.strokeStyle = COL.gold;
        ui.ctx.lineWidth = 1;
        ui.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
      ui.text(this.lootText(l), x + w / 2, y + 11, { size: 11, weight: 600, color: l.kind === 'gold' || on ? COL.goldLight : COL.text, align: 'center' });
    }
    if (this.goal?.kind === 'foe' && this.goal.foe.alive) {
      const f = this.goal.foe, p = this.cam.toScreen(f.x, f.kind === 'crow' ? 2.6 : 2.2, f.z);
      ui.diamond(p.x, p.y, 4, COL.red);
    }
    // a place under the cursor names what a click there does
    if (hv?.point && hv.point !== this.prompt) {
      const p = this.cam.toScreen(hv.point.x, 2.4, hv.point.z), text = t(hv.point.label), w = ui.measure(text, 12, 600) + 14;
      ui.ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ui.ctx.fillRect(p.x - w / 2, p.y - 15, w, 19);
      ui.text(text, p.x, p.y, { size: 12, weight: 600, color: COL.goldLight, align: 'center' });
    }
    drawHud(ui, s, 0, this.game.fatigue);
    if (this.game.settings.minimap) this.drawMinimap(ui);
    // the foe under the cursor: its name and what is left of it
    if (hv?.foe?.alive) {
      const f = hv.foe;
      ui.text(t(FOE_NAMES[f.kind]), 320, 22, { size: 13, weight: 700, color: COL.text, align: 'center', spacing: 1 });
      ui.gauge(250, 29, 140, 6, Math.max(0, f.hp) / f.maxHp, COL.crimson, COL.red);
    }
    if (this.frame < 200) {
      const a = Math.min(1, this.frame / 30, (200 - this.frame) / 40);
      ui.ctx.globalAlpha = a;
      ui.text(t(AREA_NAME[this.area]), 320, 92, { size: 22, weight: 700, color: COL.goldLight, align: 'center', spacing: 3 });
      ui.ctx.globalAlpha = 1;
    }
    if (this.prompt && !this.msg.active && !this.ask && !this.shop) {
      const [x, y, w, h] = this.promptRect();
      ui.panel(x, y, w, h);
      ui.text(t(this.prompt.label), 320, 321, { size: 15, weight: 600, color: COL.goldLight, align: 'center' });
    }
    this.msg.draw(ui);
    this.ask?.box.draw(ui);
    if (this.shop) this.drawShop(ui);
  }

  private drawMinimap(ui: UI): void {
    const s = this.game.state, h = this.hero, icons: MapIcon[] = [];
    for (const p of this.points) {
      if (p.kind === 'barrier' && s.flags[`barrier:${p.ch}`]) continue;
      const [color, r] = ICON[p.kind];
      icons.push({ x: p.x, z: p.z, color, r });
    }
    const pose = { px: h.x, pz: h.z, heroYaw: h.yaw, camYaw: ISO_YAW, compass: true };
    this.mini.draw(ui, pose, icons, this.game.reveal, (x, z) => !!s.visited[fogKey(this.area, fogBlock(x), fogBlock(z))]);
  }

  /** Lift the fog of war around the hero. */
  private see(): void {
    const h = this.hero, seen = liftFog(this.game.state.visited, this.area, this.grid.w, this.grid.h, h.x, h.z);
    this.mini.reveal(seen);
    this.veil.reveal(seen);
  }

  private lootText(l: Loot): string {
    return l.kind === 'gold' ? t('{0} GOLD', l.n) : `${t(ITEM_NAMES[l.id!])}${l.n > 1 ? ` ×${l.n}` : ''}`;
  }

  /** The ground label of a dropped thing (clicking it picks the thing up). */
  private lootRect(l: Loot): [number, number, number, number] {
    const p = this.cam.toScreen(l.x, 0.4, l.z), w = this.game.ui.measure(this.lootText(l), 11, 600) + 10;
    return [p.x - w / 2, p.y - 24, w, 15];
  }

  /** The EXAMINE prompt box (a button for the mouse). */
  private promptRect(): [number, number, number, number] {
    const w = this.game.ui.measure(t(this.prompt?.label ?? ''), 15, 600) + 32;
    return [320 - w / 2, 300, w, 30];
  }

  private drawShop(ui: UI): void {
    const s = this.game.state, list = TOWNS.V.shop, cur = this.shop!.cursor;
    ui.veil(0.5);
    ui.panel(150, 90, 340, 250);
    ui.text(t('SHOP'), 320, 122, { size: 18, weight: 700, color: COL.goldLight, align: 'center', spacing: 2 });
    list.forEach((it, i) => {
      const y = SHOP_Y(i), sel = i === cur;
      if (sel) ui.diamond(178, y - 5, 5, COL.red);
      const name = `${t(ITEM_NAMES[it.item])}${it.n > 1 ? ` ×${it.n}` : ''}`;
      ui.text(name, 192, y, { size: 15, color: s.gold >= it.price ? (sel ? COL.goldLight : COL.text) : COL.dim });
      ui.text(`${it.price}G`, 360, y, { size: 15, color: COL.goldLight, align: 'right' });
      ui.text(t('OWN ×{0}', s.items[it.item]), 466, y, { size: 12, color: COL.gray, align: 'right' });
    });
    const dy = SHOP_Y(list.length);
    if (cur === list.length) ui.diamond(178, dy - 5, 5, COL.red);
    ui.text(t('DONE'), 192, dy, { size: 15, color: cur === list.length ? COL.goldLight : COL.text });
    ui.text(t('{0} GOLD', s.gold), 320, 322, { size: 14, color: COL.goldLight, align: 'center' });
  }

  dispose(): void {
    this.scene3.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
    this.level?.dispose();
    this.veil?.dispose();
    this.fx.dispose();
    this.hero?.dispose();
    for (const f of this.foes) f.model?.dispose();
  }
}
