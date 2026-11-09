import type { SfxName } from '../audio/SoundEffects';
import { Boss, BOSS_THEME, createBoss } from '../combat/Bosses';
import type { Game } from '../core/Game';
import { ITEM_NAMES, weaponLevel } from '../core/GameState';
import { Scene } from '../core/SceneManager';
import { ARENA_MAP, BOSS_MAP, ENCOUNTERS, encounterTheme } from '../data/encounters';
import { StageId, STAGES } from '../data/levels/stages';
import { COIN, EXPLOSION, HEART, JAR, POOF, SCROLL } from '../data/sprites/actors';
import { Arena, drawShot, Enemy, EnemyKind, Shot, shotBox, SPAWN_KIND } from '../entities/Enemy';
import { overlap, Player } from '../entities/Player';
import { measure } from '../graphics/Font';
import { C } from '../graphics/Palette';
import { PixelRenderer } from '../graphics/PixelRenderer';
import { spr } from '../graphics/Sprite';
import { drawBackdrop, drawTile, STAGE_THEMES, tileSprite } from '../graphics/StageTiles';
import { drawHUD } from '../ui/HUD';
import { isZh, t } from '../i18n';
import type { BossId, ThemeId } from '../world/DungeonMap';
import { moveBody, Spawn, STAGE_ROWS, StageMap, TILE } from '../world/StageMap';

export type ActionMode =
  | { kind: 'stage'; stage: StageId }
  | { kind: 'encounter'; group: string; cell: string }
  | { kind: 'boss'; boss: BossId };

const TOP = 32; // status bar height
const DEATH_Y = STAGE_ROWS * TILE + 48;

const LANTERN = spr([
  '....111111....',
  '...12222221...',
  '..1222222221..',
  '.111111111111.',
  '....122221....',
  '....133331....',
  '....131131....',
  '....133331....',
  '...11111111...',
  '..1222222221..',
  '....122221....',
  '....122221....',
  '....122221....',
  '....122221....',
  '...12222221...',
  '..1222222221..',
  '..1111111111..',
]);

type PickKind = 'coin' | 'heart' | 'scroll' | 'herb';
interface Pickup { kind: PickKind; x: number; y: number; vy: number; t: number; }
interface Jar { x: number; y: number; alive: boolean; }
interface Lantern { x: number; y: number; t: number; }
interface Fx { kind: 'poof' | 'boom' | 'spark' | 'text'; x: number; y: number; t: number; text?: string; }

/** Small deterministic PRNG so drops repeat exactly for the same play. */
class Rng {
  constructor(private s: number) {}
  next(): number {
    this.s ^= this.s << 13;
    this.s ^= this.s >>> 17;
    this.s ^= this.s << 5;
    return ((this.s >>> 0) % 1000) / 1000;
  }
}

export class ActionScene implements Scene, Arena {
  map: StageMap;
  player: Player;
  frame = 0;
  private readonly theme: ThemeId;
  private camX = 0;
  private enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private pickups: Pickup[] = [];
  private jars: Jar[] = [];
  private lanterns: Lantern[] = [];
  private fx: Fx[] = [];
  private goalX = -1;
  private boss: Boss | null = null;
  private waves: EnemyKind[][] = [];
  private waveIdx = 0;
  private waveDelay = 0;
  private spawnState: ('idle' | 'alive' | 'dead')[] = [];
  private inView: boolean[] = [];
  private enemySpawns: Spawn[] = [];
  private phase: 'intro' | 'play' | 'clear' | 'dying' | 'bossdeath' = 'play';
  private t = 0;
  private quake = 0;
  private rng: Rng;
  private reward = 0;
  private bossHit = -1;
  private armorHit = -1;

  constructor(private readonly game: Game, private readonly mode: ActionMode) {
    let rows: string[];
    if (mode.kind === 'stage') {
      const st = STAGES[mode.stage];
      rows = st.map;
      this.theme = st.theme;
    } else if (mode.kind === 'encounter') {
      rows = ARENA_MAP;
      this.theme = encounterTheme(mode.group);
      this.waves = ENCOUNTERS[mode.group] ?? [['ghoul']];
    } else {
      rows = BOSS_MAP;
      this.theme = BOSS_THEME[mode.boss];
      this.boss = createBoss(mode.boss);
      this.phase = 'intro';
    }
    this.map = new StageMap(rows);
    let px = 40, py = 10 * TILE;
    for (const sp of this.map.spawns) {
      if (sp.ch === 'P') [px, py] = [sp.x, sp.y];
      else if (sp.ch === 'G') this.goalX = sp.x;
      else if (sp.ch === 'J') this.jars.push({ x: sp.x, y: sp.y, alive: true });
      else if (sp.ch === 'F') this.lanterns.push({ x: sp.x, y: sp.y, t: sp.col * 7 });
      else if (SPAWN_KIND[sp.ch]) this.enemySpawns.push(sp);
    }
    this.spawnState = this.enemySpawns.map(() => 'idle');
    this.inView = this.enemySpawns.map(() => false);
    this.player = new Player(px, py);
    const seed = mode.kind === 'stage' ? mode.stage.charCodeAt(1) : mode.kind === 'boss' ? mode.boss.length : mode.group.length + mode.cell.length;
    this.rng = new Rng(0x9e3779b9 ^ (seed * 2654435761));
  }

  readonly playTime = true;

  get pausable(): boolean {
    return this.phase === 'play' || this.phase === 'intro';
  }

  enter(): void {
    this.game.music(this.mode.kind === 'boss' ? 'BOSS' : 'BATTLE');
    if (this.mode.kind === 'boss') this.game.sfx('bossAppear');
  }

  resume(): void {
    this.game.audio.resumeMusic();
  }

  // ---- Arena interface for enemies and bosses ----

  shoot(s: Shot): void {
    this.shots.push(s);
  }

  sfx(n: SfxName): void {
    this.game.sfx(n);
  }

  shake(frames: number): void {
    this.quake = Math.max(this.quake, frames);
  }

  // ---- Update ----

  update(): void {
    this.frame++;
    this.t++;
    if (this.quake > 0) this.quake--;
    const g = this.game, s = g.state, p = this.player;

    switch (this.phase) {
      case 'intro':
        if (this.t > 70) this.setPhase('play');
        p.update(g.input, this.map);
        return;
      case 'clear':
        p.body.vx = 0;
        moveBody(this.map, p.body);
        this.updateFx();
        if (this.t === 1) g.music('VICTORY');
        if (this.t > 170) this.finish();
        return;
      case 'bossdeath': {
        this.updateFx();
        p.body.vx = 0;
        moveBody(this.map, p.body);
        const c = this.boss!.centre();
        if (this.t < 120 && this.t % 6 === 0) {
          this.fx.push({ kind: 'boom', x: c.x + (this.rng.next() - 0.5) * 48, y: c.y + (this.rng.next() - 0.5) * 40, t: 0 });
          g.sfx('explode');
          this.shake(4);
        }
        if (this.t === 120) {
          g.sfx('bossDie');
          g.music('VICTORY');
        }
        if (this.t > 300) g.bossDefeated((this.mode as { boss: BossId }).boss);
        return;
      }
      case 'dying':
        p.update(g.input, this.map);
        this.updateFx();
        if (this.t === 1) {
          g.audio.stopMusic();
          g.sfx('playerHurt');
        }
        if (this.t === 30) g.sfx('fall');
        if (this.t > 150) g.gameOver();
        return;
    }

    // ---- play ----
    p.update(g.input, this.map);
    const b = p.body;
    b.x = Math.max(8, Math.min(this.map.widthPx - 8, b.x));
    if (p.wantsItem) this.useItem();
    if (p.state === 'dead') return this.setPhase('dying');
    if (b.y > DEATH_Y || (b.y > (STAGE_ROWS - 1) * TILE + 4 && this.map.tile(Math.floor(b.x / TILE), STAGE_ROWS - 1) === '~')) {
      s.life = 0;
      p.setState('dead');
      return this.setPhase('dying');
    }
    if (p.onSpikes(this.map)) this.hurtPlayer(2, b.x + p.facing);

    if (this.mode.kind === 'stage') {
      this.camX = Math.max(0, Math.min(this.map.widthPx - 256, Math.round(b.x) - 120));
      this.spawnEnemies();
      if (this.goalX >= 0 && b.x >= this.goalX - 2) {
        this.reward = 0;
        return this.setPhase('clear');
      }
    } else if (this.mode.kind === 'encounter') this.runWaves();

    for (const e of this.enemies) e.update(this);
    this.boss?.update(this);
    this.updateLanterns();
    this.updateShots();
    this.updatePickups();
    this.combat();
    this.updateFx();
    this.cullEnemies();

    if (this.boss && this.boss.finished) {
      this.shots = [];
      this.setPhase('bossdeath');
    }
  }

  private setPhase(ph: ActionScene['phase']): void {
    this.phase = ph;
    this.t = 0;
  }

  private finish(): void {
    const g = this.game, m = this.mode;
    if (m.kind === 'stage') g.stageCleared(m.stage);
    else if (m.kind === 'encounter') {
      if (m.group.startsWith('w')) {
        g.spiritsBeaten.add(m.cell);
        g.toWorld();
      } else {
        const loc = g.state.location;
        if (loc.mode === 'dungeon') g.state.flags[`${loc.id}:enc:${m.cell}`] = true;
        g.returnToDungeon();
      }
    }
  }

  private spawnEnemies(): void {
    this.enemySpawns.forEach((sp, i) => {
      const vis = sp.x > this.camX - 12 && sp.x < this.camX + 268;
      if (vis && !this.inView[i] && this.spawnState[i] === 'idle') {
        const e = new Enemy(SPAWN_KIND[sp.ch], sp.x, sp.y, i, i);
        if (e.def.fly) e.body.y = sp.y - 4;
        this.enemies.push(e);
        this.spawnState[i] = 'alive';
      }
      this.inView[i] = vis;
    });
  }

  private runWaves(): void {
    if (this.enemies.length > 0) return;
    if (this.waveIdx >= this.waves.length) {
      this.reward = 10 + this.waves.length * 5;
      this.game.state.gold = Math.min(9999, this.game.state.gold + this.reward);
      this.setPhase('clear');
      return;
    }
    if (this.waveDelay++ < 40) return;
    this.waveDelay = 0;
    const wave = this.waves[this.waveIdx++];
    wave.forEach((k, i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const x = side > 0 ? 232 - (i >> 1) * 20 : 24 + (i >> 1) * 20;
      const e = new Enemy(k, x, 10 * TILE, -1, i + this.waveIdx * 3);
      if (e.def.fly) e.body.y = 72 + i * 10;
      else e.body.y = 10 * TILE;
      e.homeY = e.body.y;
      this.enemies.push(e);
      this.fx.push({ kind: 'poof', x, y: e.body.y - e.def.h / 2, t: 0 });
    });
    this.game.sfx('warp');
  }

  private cullEnemies(): void {
    const keep: Enemy[] = [];
    for (const e of this.enemies) {
      const b = e.body;
      const off = this.mode.kind === 'stage' && (b.x < this.camX - 72 || b.x > this.camX + 328 || b.y < -80);
      const fell = b.y > DEATH_Y;
      if (e.dead || fell) {
        if (e.spawnId >= 0) this.spawnState[e.spawnId] = 'dead';
        continue;
      }
      if (off) {
        if (e.spawnId >= 0) this.spawnState[e.spawnId] = 'idle';
        continue;
      }
      if (this.mode.kind !== 'stage') b.x = Math.max(8, Math.min(248, b.x));
      keep.push(e);
    }
    this.enemies = keep;
  }

  private updateLanterns(): void {
    for (const l of this.lanterns) {
      if (Math.abs(l.x - this.player.x) > 200) continue;
      l.t++;
      if (l.t % 110 === 0) {
        const d = this.player.x < l.x ? -1 : 1;
        this.shoot({ kind: 'fire', x: l.x + d * 6, y: l.y - 20, vx: d * 1.6, vy: 0, dmg: 2, friendly: false, life: 160 });
        this.sfx('shoot');
      }
    }
  }

  private updateShots(): void {
    for (const sh of this.shots) {
      sh.x += sh.vx;
      sh.y += sh.vy;
      if (sh.gravity) sh.vy += sh.gravity;
      sh.life--;
      if (sh.kind === 'wave' && !this.map.floor(Math.floor(sh.x / TILE), Math.floor((sh.y + 6) / TILE))) sh.life = 0;
      if (sh.kind !== 'wave' && sh.kind !== 'orb' && this.map.solidPx(sh.x, sh.y)) {
        sh.life = 0;
        if (sh.kind === 'talisman') this.fx.push({ kind: 'spark', x: sh.x, y: sh.y, t: 0 });
      }
    }
    this.shots = this.shots.filter((sh) => sh.life > 0 && sh.y < DEATH_Y && sh.x > this.camX - 32 && sh.x < this.camX + 288);
  }

  private updatePickups(): void {
    const s = this.game.state, pb = this.player.hurtbox();
    for (const k of this.pickups) {
      k.t++;
      const tx = Math.floor(k.x / TILE);
      if (!this.map.floor(tx, Math.floor((k.y + 1) / TILE)) || k.vy < 0) {
        k.vy = Math.min(3, k.vy + 0.2);
        const ny = k.y + k.vy;
        if (k.vy > 0 && this.map.floor(tx, Math.floor(ny / TILE))) {
          k.y = Math.floor(ny / TILE) * TILE;
          k.vy = 0;
        } else k.y = ny;
      }
      if (overlap(pb, { x: k.x - 5, y: k.y - 8, w: 10, h: 8 })) {
        k.t = 9999;
        switch (k.kind) {
          case 'coin':
            s.gold = Math.min(9999, s.gold + 5);
            this.sfx('coin');
            break;
          case 'heart':
            s.life = Math.min(s.maxLife, s.life + 2);
            this.sfx('heal');
            break;
          case 'scroll':
            s.items.talisman = Math.min(99, s.items.talisman + 2);
            this.sfx('pickup');
            break;
          case 'herb':
            s.items.herb = Math.min(99, s.items.herb + 1);
            this.sfx('pickup');
            break;
        }
      }
    }
    this.pickups = this.pickups.filter((k) => k.t < 540 && k.y < DEATH_Y);
  }

  private drop(x: number, y: number, table: [PickKind, number][]): void {
    let r = this.rng.next();
    for (const [kind, w] of table) {
      if (r < w) {
        this.pickups.push({ kind, x, y, vy: -2, t: 0 });
        return;
      }
      r -= w;
    }
  }

  private hurtPlayer(dmg: number, fromX: number): void {
    const s = this.game.state;
    if (this.player.hurt(dmg, fromX, s)) {
      this.sfx('playerHurt');
      this.shake(4);
    }
  }

  private gainExp(n: number): void {
    const s = this.game.state;
    const before = weaponLevel(s.weaponExp);
    s.weaponExp += n;
    const after = weaponLevel(s.weaponExp);
    if (after > before) {
      this.sfx('levelUp');
      this.fx.push({ kind: 'text', x: this.player.x, y: this.player.y - 56, t: 0, text: t('SWORD LV{0}', after) });
    }
  }

  private killEnemy(e: Enemy): void {
    const s = this.game.state;
    s.stats.kills++;
    this.sfx('enemyDie');
    const c = e.hurtbox();
    this.fx.push({ kind: 'poof', x: c.x + c.w / 2, y: c.y + c.h / 2, t: 0 });
    this.gainExp(e.def.exp);
    if (e.kind === 'oni') this.drop(e.body.x, e.body.y - 4, [['heart', 0.6], ['coin', 0.4]]);
    else this.drop(e.body.x, e.body.y - 4, [['coin', 0.25], ['heart', 0.08], ['scroll', 0.05]]);
  }

  private combat(): void {
    const s = this.game.state, p = this.player;
    const sword = p.swordBox(s);
    const pb = p.hurtbox();
    const dmg = p.damage(s);

    for (const e of this.enemies) {
      if (e.dead) continue;
      const hb = e.hurtbox();
      if (sword && !e.intangible && e.lastSwing !== p.swing && overlap(sword, hb)) {
        e.lastSwing = p.swing;
        e.hit(dmg, p.x);
        if (e.dead) this.killEnemy(e);
        else this.sfx('enemyHurt');
        continue;
      }
      if (e.intangible) continue;
      const ab = e.attackbox();
      if (overlap(pb, hb) || (ab && overlap(pb, ab))) this.hurtPlayer(e.def.dmg, e.body.x);
    }

    for (const j of this.jars) {
      if (j.alive && sword && overlap(sword, { x: j.x - 6, y: j.y - 11, w: 12, h: 11 })) {
        j.alive = false;
        this.sfx('doorBreak');
        this.fx.push({ kind: 'poof', x: j.x, y: j.y - 6, t: 0 });
        this.drop(j.x, j.y - 6, [['heart', 0.35], ['coin', 0.35], ['scroll', 0.2], ['herb', 0.1]]);
      }
    }

    for (const sh of this.shots) {
      if (sh.life <= 0) continue;
      const box = shotBox(sh);
      if (sh.friendly) {
        for (const e of this.enemies) {
          if (e.dead || e.intangible || sh.hits?.has(e)) continue;
          if (overlap(box, e.hurtbox())) {
            (sh.hits ??= new Set()).add(e);
            e.hit(sh.dmg, sh.x - sh.vx);
            if (e.dead) this.killEnemy(e);
            else this.sfx('enemyHurt');
            if (!sh.pierce) sh.life = 0;
          }
        }
        if (this.boss && !sh.hits?.has(this.boss)) {
          if (this.boss.hurtboxes().some((h) => overlap(box, h))) {
            (sh.hits ??= new Set()).add(this.boss);
            this.boss.hit(sh.dmg);
            this.sfx('enemyHurt');
            sh.life = 0;
          } else if (this.boss.armorboxes().some((h) => overlap(box, h))) {
            this.sfx('clang');
            this.fx.push({ kind: 'spark', x: sh.x, y: sh.y, t: 0 });
            sh.life = 0;
          }
        }
        continue;
      }
      // the sword can cut fire, bones and orbs out of the air
      if (sword && sh.kind !== 'wave' && overlap(sword, box)) {
        sh.life = 0;
        this.sfx('clang');
        this.fx.push({ kind: 'spark', x: sh.x, y: sh.y, t: 0 });
        continue;
      }
      if (overlap(pb, box)) {
        this.hurtPlayer(sh.dmg, sh.x - sh.vx * 4);
        if (sh.kind !== 'wave') sh.life = 0;
      }
    }

    const boss = this.boss;
    if (boss) {
      if (sword && this.bossHit !== p.swing && boss.hurtboxes().some((h) => overlap(sword, h))) {
        this.bossHit = p.swing;
        boss.hit(dmg);
        this.sfx('enemyHurt');
        const c = boss.centre();
        this.fx.push({ kind: 'spark', x: (sword.x + sword.w / 2 + c.x) / 2, y: sword.y + 10, t: 0 });
      } else if (sword && this.armorHit !== p.swing && this.bossHit !== p.swing && boss.armorboxes().some((h) => overlap(sword, h))) {
        this.armorHit = p.swing;
        this.sfx('clang');
        this.fx.push({ kind: 'spark', x: sword.x + (p.facing > 0 ? sword.w : 0), y: sword.y + 12, t: 0 });
      }
      if (boss.attackboxes().some((h) => overlap(pb, h))) this.hurtPlayer(boss.contactDmg, boss.centre().x);
    }
  }

  private useItem(): void {
    const g = this.game, s = g.state, p = this.player;
    const id = s.currentItem;
    if (s.items[id] <= 0) {
      g.sfx('locked');
      return;
    }
    if (id === 'talisman') {
      s.items.talisman--;
      g.sfx('throw');
      this.shoot({ kind: 'talisman', x: p.x + p.facing * 10, y: p.y - 30, vx: p.facing * 4, vy: 0, dmg: 3, friendly: true, life: 60, pierce: true });
      return;
    }
    if (s.life >= s.maxLife) {
      g.sfx('locked');
      return;
    }
    s.items[id]--;
    s.life = id === 'elixir' ? s.maxLife : Math.min(s.maxLife, s.life + 6);
    g.sfx('heal');
    this.fx.push({ kind: 'text', x: p.x, y: p.y - 56, t: 0, text: t(ITEM_NAMES[id]) });
  }

  private updateFx(): void {
    for (const f of this.fx) f.t++;
    this.fx = this.fx.filter((f) => f.t < (f.kind === 'text' ? 60 : f.kind === 'boom' ? 20 : 14));
  }

  // ---- Draw ----

  draw(r: PixelRenderer): void {
    const s = this.game.state;
    const shakeX = this.quake > 0 ? (this.quake & 2 ? 2 : -2) : 0;
    const cam = this.camX - shakeX;
    drawBackdrop(r, this.theme, this.camX, TOP);
    this.drawTiles(r, cam);
    this.drawProps(r, cam);
    // rotate enemy priority each frame so overloaded scanlines flicker instead of dropping one enemy
    const n = this.enemies.length;
    for (let i = 0; i < n; i++) this.enemies[(i + this.frame) % n].draw(r, cam, TOP, this.frame);
    if (this.boss && !(this.phase === 'bossdeath' && this.t > 110)) this.boss.draw(r, TOP, this.frame);
    this.player.draw(r, cam, TOP, s);
    for (const sh of this.shots) drawShot(r, sh, cam, TOP, this.frame, sh.kind === 'fire' && this.mode.kind === 'boss' && this.mode.boss === 'rotroot' ? [0x08, 0x1a, 0x2a] : undefined);
    this.drawFx(r, cam);
    drawHUD(r, s, this.hudOptions());
    this.drawBanner(r);
  }

  private hudOptions() {
    if (this.boss) return { boss: { name: this.boss.name, hp: this.boss.hp, max: this.boss.max } };
    if (this.mode.kind === 'stage') {
      const sub = STAGES[this.mode.stage].subtitle;
      return { area: isZh() ? t(sub) : sub.replace(/^THE /, '') };
    }
    return { area: t('AMBUSH') };
  }

  private drawTiles(r: PixelRenderer, cam: number): void {
    const th = STAGE_THEMES[this.theme];
    const c0 = Math.floor(cam / TILE), c1 = c0 + 17;
    const metal = [0x00, 0x10, 0x30];
    const mireFrame = (this.frame >> 4) & 1;
    for (let tx = c0; tx <= c1; tx++) {
      for (let ty = 0; ty < STAGE_ROWS; ty++) {
        const ch = this.map.tile(tx, ty);
        if (ch === '.') continue;
        const x = tx * TILE - cam, y = ty * TILE + TOP;
        switch (ch) {
          case '#': {
            const above = this.map.tile(tx, ty - 1);
            const exposed = above !== '#' && above !== '^';
            drawTile(r, tileSprite(this.theme, exposed ? 'top' : 'fill'), x, y, exposed ? th.top : th.ground, th.ground);
            break;
          }
          case '^':
            drawTile(r, tileSprite(this.theme, 'spike'), x, y, metal, th.ground);
            break;
          case '=':
            drawTile(r, tileSprite(this.theme, 'plat'), x, y, th.plat, th.ground);
            break;
          case '~':
            drawTile(r, tileSprite(this.theme, mireFrame ? 'mire1' : 'mire0'), x, y, th.mire, th.ground);
            break;
          case 'C': {
            const st = this.map.crumbleStage(tx, ty);
            const jitter = st > 16 ? (this.frame & 2 ? 1 : -1) : 0;
            drawTile(r, tileSprite(this.theme, st > 8 ? 'crack' : 'crumble'), x + jitter, y, th.plat, th.ground);
            break;
          }
        }
      }
    }
  }

  private drawProps(r: PixelRenderer, cam: number): void {
    if (this.goalX >= 0) this.drawGate(r, Math.round(this.goalX - cam), 10 * TILE + TOP);
    for (const l of this.lanterns) {
      const glow = (this.frame >> 3) & 1 ? 0x27 : 0x16;
      r.sprite(LANTERN, Math.round(l.x - cam) - 7, l.y + TOP - LANTERN.h, [C.BLACK, 0x00, glow]);
    }
    for (const j of this.jars) if (j.alive) r.sprite(JAR, Math.round(j.x - cam) - 6, j.y + TOP - JAR.h, [C.BLACK, 0x07, 0x27]);
    for (const k of this.pickups) {
      if (k.t > 420 && this.frame & 2) continue;
      const x = Math.round(k.x - cam), y = Math.round(k.y) + TOP;
      if (k.kind === 'coin') r.sprite(COIN[(this.frame >> 3) & 1], x - 3, y - 6, [C.BLACK, 0x28, 0x38]);
      else if (k.kind === 'heart') r.sprite(HEART, x - 3, y - 6, [C.BLACK, 0x16]);
      else if (k.kind === 'scroll') r.sprite(SCROLL, x - 4, y - 5, [C.BLACK, 0x37, 0x16]);
      else r.sprite(HEART, x - 3, y - 6, [C.BLACK, 0x2a]);
    }
  }

  /** Vermilion torii marking the end of a stage. */
  private drawGate(r: PixelRenderer, x: number, ground: number): void {
    const red = 0x16, dark = 0x06;
    for (const px of [x - 18, x + 14]) {
      r.rect(px - 1, ground - 44, 6, 44, C.BLACK);
      r.rect(px, ground - 44, 4, 44, red);
      r.vline(px + 3, ground - 44, ground - 1, dark);
    }
    r.rect(x - 25, ground - 38, 50, 5, C.BLACK);
    r.rect(x - 24, ground - 37, 48, 3, red);
    r.rect(x - 29, ground - 49, 58, 6, C.BLACK);
    r.rect(x - 28, ground - 48, 56, 4, red);
    r.hline(x - 28, x + 27, ground - 45, dark);
    r.rect(x - 31, ground - 51, 4, 3, C.BLACK);
    r.rect(x + 27, ground - 51, 4, 3, C.BLACK);
    r.rect(x - 3, ground - 44, 6, 6, dark);
  }

  private drawFx(r: PixelRenderer, cam: number): void {
    for (const f of this.fx) {
      const x = Math.round(f.x - cam), y = Math.round(f.y) + TOP;
      switch (f.kind) {
        case 'poof':
          r.sprite(POOF[(f.t >> 2) & 1], x - 4, y - 4, [C.WHITE, 0x10]);
          break;
        case 'boom': {
          const e = EXPLOSION[Math.min(EXPLOSION.length - 1, f.t >> 3)];
          r.sprite(e, x - (e.w >> 1), y - (e.h >> 1), [0x06, 0x16, 0x28]);
          break;
        }
        case 'spark':
          for (let i = 0; i < 4; i++) {
            const d = f.t + 1;
            r.pset(x + (i & 1 ? d : -d), y + (i & 2 ? d : -d), f.t & 2 ? C.WHITE : 0x28);
          }
          break;
        case 'text':
          r.textShadow(f.text!, x - (measure(f.text!) >> 1), y - (f.t >> 2), C.WHITE);
          break;
      }
    }
  }

  private drawBanner(r: PixelRenderer): void {
    const s = this.game.state;
    if (this.phase === 'intro' && this.boss) {
      if ((this.t >> 3) & 1 || this.t > 40) {
        r.window(24, 92, 208, 28, C.RED);
        r.textCenter(t(this.boss.title), 102, C.WHITE);
      }
    } else if (this.phase === 'clear') {
      const msg = this.mode.kind === 'stage' ? t('THE ROAD IS OPEN') : t('VICTORY');
      r.window(48, 88, 160, this.reward ? 40 : 28, C.WHITE);
      r.textCenter(msg, 98, C.GOLD);
      if (this.reward) r.textCenter(t('{0} GOLD', this.reward), 112, C.WHITE);
    } else if (this.phase === 'bossdeath' && this.t > 130) {
      r.window(32, 88, 192, 40, C.WHITE);
      r.textCenter(t('{0} IS VANQUISHED', t(this.boss!.name)), 98, C.GOLD);
      const seal = this.mode.kind === 'boss' && this.mode.boss !== 'meiou' ? t('A SEAL IS YOURS') : t('THE CURSE BREAKS');
      r.textCenter(seal, 112, C.WHITE);
    } else if (this.phase === 'dying' && this.t > 60 && s.life <= 0) {
      r.textCenter(t('YOU HAVE FALLEN'), 100, C.RED);
    }
  }
}
