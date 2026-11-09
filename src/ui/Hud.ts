import type { Fatigue } from '../combat/Fatigue';
import { GameState, ITEM_NAMES, ItemId, MAX_WEAPON_LEVEL, WEAPON_EXP, weaponLevel } from '../core/GameState';
import { t } from '../i18n';
import { Dungeon } from '../world/DungeonMap';
import { CELL, cellKind, isBarrier } from '../world/Grid3D';
import { COL, UI } from './UI';

/** Belt order: keys 1, 2, 3. */
const BELT: ItemId[] = ['herb', 'elixir', 'talisman'];
const SLOT_W = 76;

/** Life, stamina (and run mode), sword level, items and keys, along the screen's left edge. */
export function drawHud(ui: UI, s: GameState, keys: number, fatigue: Fatigue): void {
  ui.ctx.save();
  ui.ctx.translate(ui.left, 0);
  const w = s.maxLife * 9;
  ui.diamond(22, 26, 6, COL.lifeHi);
  ui.gauge(34, 20, w, 12, s.life / s.maxLife, COL.life, COL.lifeHi);
  // stamina: what is left before the hero is worn out, blinking red while they are
  const blink = fatigue.spent && ui.frame % 30 < 15;
  ui.diamond(22, 40, 3.5, fatigue.spent ? COL.red : COL.gold);
  ui.gauge(34, 38, 100, 4, 1 - fatigue.level, blink ? COL.crimson : COL.gold, blink ? COL.red : COL.goldLight);
  if (fatigue.spent) ui.text(t('EXHAUSTED'), 142, 44, { size: 11, weight: 700, color: COL.red });
  else if (fatigue.running) ui.text(t('RUN'), 142, 44, { size: 11, weight: 700, color: COL.goldLight });
  const lv = weaponLevel(s.weaponExp);
  const lo = WEAPON_EXP[lv - 1], hi = WEAPON_EXP[lv] ?? lo;
  ui.text(t('SWORD LV{0}', lv), 34, 62, { size: 12, color: COL.goldLight, weight: 700 });
  ui.gauge(110, 54, 84, 6, lv >= MAX_WEAPON_LEVEL ? 1 : (s.weaponExp - lo) / Math.max(1, hi - lo), COL.crimson, COL.red);
  ui.text(t('{0} GOLD', s.gold), 34, 80, { size: 12, color: COL.goldLight });
  // the item belt: keys 1-3, the item in hand lit
  BELT.forEach((id, i) => {
    const x = 18 + i * (SLOT_W + 6), on = id === s.currentItem, n = s.items[id];
    ui.panel(x, 392, SLOT_W, 38, on ? COL.goldLight : COL.goldDim);
    ui.text(String(i + 1), x + 10, 416, { size: 11, weight: 700, color: on ? COL.goldLight : COL.gray });
    ui.text(t(ITEM_NAMES[id]), x + 22, 410, { size: 12, color: !n ? COL.dim : on ? COL.text : COL.gray });
    ui.text(`×${n}`, x + 22, 424, { size: 11, color: !n ? COL.dim : on ? COL.goldLight : COL.gray });
  });
  if (keys > 0) {
    // an iron key: ring and shaft
    const g = ui.ctx, kx = 18 + 3 * (SLOT_W + 6) + 10;
    g.save();
    g.strokeStyle = COL.goldLight;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(kx, 411, 4, 0, Math.PI * 2);
    g.moveTo(kx + 4, 411);
    g.lineTo(kx + 14, 411);
    g.moveTo(kx + 11, 411);
    g.lineTo(kx + 11, 415);
    g.stroke();
    g.restore();
    ui.text(`×${keys}`, kx + 18, 416, { size: 14, color: COL.goldLight });
  }
  ui.ctx.restore();
}

/** Where a minimap is centred and how it is turned. */
export interface MiniPose {
  /** Hero position (metres) and facing; the camera yaw turns the minimap. */
  px: number;
  pz: number;
  heroYaw: number;
  camYaw: number;
  compass: boolean;
}

export interface MapView extends MiniPose {
  d: Dungeon;
  /** Visited cells, "x,y". */
  seen: (x: number, y: number) => boolean;
  full: boolean;
  chestOpen: (x: number, y: number) => boolean;
}

/** Draw the grid in world metres under the current transform. */
function cells(ui: UI, v: MapView, x0: number, y0: number, x1: number, y1: number): void {
  const g = ui.ctx;
  for (let y = Math.max(0, y0); y <= Math.min(v.d.h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(v.d.w - 1, x1); x++) {
      const ch = v.d.ch(x, y);
      const known = v.seen(x, y) || v.full;
      if (!known || cellKind(ch) === 'wall') continue;
      const X = x * CELL, Y = y * CELL;
      if (cellKind(ch) === 'face') {
        g.fillStyle = ch === 'K' ? COL.red : ch === 'X' ? '#dfe8ff' : COL.goldDim;
        g.fillRect(X + 1, Y + 1, CELL - 2, CELL - 2);
        continue;
      }
      g.fillStyle = v.d.isDark(x, y) ? 'rgba(90, 96, 120, 0.55)' : 'rgba(205, 190, 150, 0.55)';
      g.fillRect(X, Y, CELL, CELL);
      if (isBarrier(ch) && !v.d.passable(x, y)) {
        g.fillStyle = ch === 'S' ? COL.red : ch === 'L' ? COL.goldLight : '#9a7a50';
        g.fillRect(X + 0.6, Y + 0.6, CELL - 1.2, CELL - 1.2);
      } else if (ch === 'C' && !v.chestOpen(x, y)) {
        g.fillStyle = COL.goldLight;
        g.fillRect(X + 1.2, Y + 1.2, CELL - 2.4, CELL - 2.4);
      } else if (ch === 'O') {
        g.fillStyle = COL.blue;
        g.beginPath();
        g.arc(X + 2, Y + 2, 1.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

function arrow(ui: UI, x: number, y: number, ang: number, r: number): void {
  const g = ui.ctx;
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = COL.red;
  g.strokeStyle = COL.goldLight;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, -r);
  g.lineTo(r * 0.7, r * 0.7);
  g.lineTo(0, r * 0.3);
  g.lineTo(-r * 0.7, r * 0.7);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

const MINI = { x: 566, y: 78, r: 58 };

/**
 * Round minimap in the top right corner, turned so the camera's forward is up.
 * `paint` draws in world metres (`scale` pixels each), `reach` metres around the hero.
 */
export function miniFrame(ui: UI, v: MiniPose, scale: number, paint: (reach: number) => void): void {
  const g = ui.ctx, { y, r } = MINI, x = MINI.x + ui.right - 640;
  const a = v.camYaw, c = Math.cos(a), s = Math.sin(a);
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = 'rgba(6, 5, 9, 0.72)';
  g.fill();
  g.clip();
  g.translate(x, y);
  // screen = (dot(d, right), -dot(d, forward)) with forward (sin a, cos a), right (-cos a, sin a)
  g.transform(-c * scale, -s * scale, s * scale, -c * scale, 0, 0);
  g.translate(-v.px, -v.pz);
  paint(r / scale);
  g.restore();
  arrow(ui, x, y, a - v.heroYaw, 6);
  g.save();
  g.strokeStyle = COL.gold;
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  if (v.compass) {
    // world north is -z
    ui.text('N', x - s * (r - 9), y + c * (r - 9) + 5, { size: 13, weight: 700, color: COL.goldLight, align: 'center' });
  }
}

/** The labyrinth's minimap. */
export function drawMinimap(ui: UI, v: MapView): void {
  miniFrame(ui, v, 2.6, (reach) => {
    const span = Math.ceil(reach / CELL) + 1;
    const cx = Math.floor(v.px / CELL), cy = Math.floor(v.pz / CELL);
    cells(ui, v, cx - span, cy - span, cx + span, cy + span);
  });
}

/** The whole labyrinth, north up, for the map page. */
export function drawFullMap(ui: UI, v: MapView, x: number, y: number, w: number, h: number): void {
  const g = ui.ctx;
  const scale = Math.min(w / (v.d.w * CELL), h / (v.d.h * CELL));
  const ox = x + (w - v.d.w * CELL * scale) / 2, oy = y + (h - v.d.h * CELL * scale) / 2;
  g.save();
  g.translate(ox, oy);
  g.scale(scale, scale);
  cells(ui, v, 0, 0, v.d.w - 1, v.d.h - 1);
  g.restore();
  arrow(ui, ox + v.px * scale, oy + v.pz * scale, Math.PI - v.heroYaw, 7);
}
