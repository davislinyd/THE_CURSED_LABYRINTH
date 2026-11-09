import { KeyItemId } from '../core/GameState';
import { DungeonDef, key } from './DungeonMap';

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  states: number;
  chestsReachable: number;
  chestsTotal: number;
}

interface VState {
  picked: number; // bitmask over key chests
  opened: number; // bitmask over locked doors
  levers: number; // bit 0: '=' group, bit 1: '%' group
}

const N4 = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Exhaustive state-space check of a hand-made dungeon: every combination of
 * keys picked, locked doors opened and lever positions the player can reach.
 * Fails if the boss door is unreachable or if any reachable state is a
 * soft-lock (e.g. a key spent on the wrong door with no way back).
 */
export function validateDungeon(def: DungeonDef, assumed: KeyItemId[] = []): ValidationReport {
  const errors: string[] = [];
  const h = def.map.length, w = def.map[0].length;
  const ch = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : def.map[y][x]);

  let start: [number, number] | null = null;
  const keyChests: string[] = [];
  const locks: string[] = [];
  const chests: string[] = [];
  for (let y = 0; y < h; y++) {
    if (def.map[y].length !== w) errors.push(`row ${y} width ${def.map[y].length} != ${w}`);
    for (let x = 0; x < w; x++) {
      const c = ch(x, y);
      const k = key(x, y);
      if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && '.@CE^O?FDBLSGgHh'.includes(c))
        errors.push(`open cell ${c} on border at ${k}`);
      if (c === '@') start = [x, y];
      if (c === 'C') {
        chests.push(k);
        const loot = def.chests[k];
        if (!loot) errors.push(`chest ${k} has no loot`);
        else if (loot.kind === 'key') keyChests.push(k);
      }
      if (c === 'L') locks.push(k);
      if (c === 'E' && !def.encounters[k]) errors.push(`encounter ${k} has no group`);
      if (c === 'T' && !def.tablets?.[k]) errors.push(`tablet ${k} has no text`);
      if (c === 'N' && !def.npcs?.[k]) errors.push(`spirit ${k} has no text`);
      if (c === 'O' && !def.warps?.[k]) errors.push(`warp ${k} has no target`);
      if (c === '?' && !def.hidden?.[k]) errors.push(`hidden ${k} has no loot`);
      if (c === 'S' && !def.seals?.[k]) errors.push(`seal door ${k} has no requirement`);
    }
  }
  for (const k of Object.keys(def.chests)) {
    const [x, y] = k.split(',').map(Number);
    if (ch(x, y) !== 'C') errors.push(`loot defined for ${k} but cell is '${ch(x, y)}'`);
  }
  for (const k of Object.keys(def.encounters)) {
    const [x, y] = k.split(',').map(Number);
    if (ch(x, y) !== 'E') errors.push(`encounter defined for ${k} but cell is '${ch(x, y)}'`);
  }
  if (!start) {
    errors.push('no start');
    return { ok: false, errors, states: 0, chestsReachable: 0, chestsTotal: chests.length };
  }

  const gateOpen = (c: string, levers: number) =>
    c === 'G' ? !(levers & 1) : c === 'g' ? !!(levers & 1) : c === 'H' ? !(levers & 2) : c === 'h' ? !!(levers & 2) : false;

  const passable = (x: number, y: number, s: VState): boolean => {
    const c = ch(x, y);
    if ('.@CE^O?FDB'.includes(c)) return true;
    if (c === 'L') return !!(s.opened & (1 << locks.indexOf(key(x, y))));
    if (c === 'S') return assumed.includes(def.seals![key(x, y)]);
    if ('GgHh'.includes(c)) return gateOpen(c, s.levers);
    return false;
  };

  const region = (s: VState): Set<string> => {
    const seen = new Set<string>();
    const q: [number, number][] = [start!];
    seen.add(key(...start!));
    while (q.length) {
      const [x, y] = q.shift()!;
      const k = key(x, y);
      if (ch(x, y) === 'O') {
        const t = def.warps![k];
        const tk = key(t.x, t.y);
        if (!seen.has(tk) && passable(t.x, t.y, s)) {
          seen.add(tk);
          q.push([t.x, t.y]);
        }
        continue;
      }
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy, nk = key(nx, ny);
        if (!seen.has(nk) && passable(nx, ny, s)) {
          seen.add(nk);
          q.push([nx, ny]);
        }
      }
    }
    return seen;
  };

  const adjacentTo = (r: Set<string>, pred: (c: string) => boolean): string[] => {
    const out = new Set<string>();
    for (const k of r) {
      const [x, y] = k.split(',').map(Number);
      if (ch(x, y) === 'O') continue;
      for (const [dx, dy] of N4) if (pred(ch(x + dx, y + dy))) out.add(key(x + dx, y + dy));
    }
    return [...out];
  };

  const sk = (s: VState) => `${s.picked}|${s.opened}|${s.levers}`;
  const pop = (n: number) => n.toString(2).replace(/0/g, '').length;

  const states = new Map<string, VState>();
  const edges = new Map<string, string[]>();
  const goal = new Set<string>();
  const chestSeen = new Set<string>();
  const s0: VState = { picked: 0, opened: 0, levers: 0 };
  const queue = [s0];
  states.set(sk(s0), s0);
  while (queue.length) {
    const s = queue.shift()!;
    const id = sk(s);
    const r = region(s);
    for (const k of r) if (ch(...(k.split(',').map(Number) as [number, number])) === 'C') chestSeen.add(k);
    if (adjacentTo(r, (c) => c === 'K').length) goal.add(id);
    const next: VState[] = [];
    keyChests.forEach((k, i) => {
      if (r.has(k) && !(s.picked & (1 << i))) next.push({ ...s, picked: s.picked | (1 << i) });
    });
    if (pop(s.picked) > pop(s.opened)) {
      for (const k of adjacentTo(r, (c) => c === 'L')) {
        const i = locks.indexOf(k);
        if (!(s.opened & (1 << i))) next.push({ ...s, opened: s.opened | (1 << i) });
      }
    }
    if (adjacentTo(r, (c) => c === '=').length) next.push({ ...s, levers: s.levers ^ 1 });
    if (adjacentTo(r, (c) => c === '%').length) next.push({ ...s, levers: s.levers ^ 2 });
    const out: string[] = [];
    for (const n of next) {
      const nk = sk(n);
      out.push(nk);
      if (!states.has(nk)) {
        states.set(nk, n);
        queue.push(n);
      }
    }
    edges.set(id, out);
  }

  // Reverse reachability to the goal.
  const canWin = new Set(goal);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, out] of edges) {
      if (!canWin.has(id) && out.some((o) => canWin.has(o))) {
        canWin.add(id);
        changed = true;
      }
    }
  }
  if (!canWin.has(sk(s0))) errors.push('boss door unreachable from start');
  for (const id of states.keys()) if (!canWin.has(id)) errors.push(`soft-lock state ${id}`);
  const r0 = region(s0);
  if (!adjacentTo(r0, (c) => c === 'X').length) errors.push('exit not reachable from start');
  for (const k of chests) if (!chestSeen.has(k)) errors.push(`chest ${k} unreachable`);
  for (const [k, t] of Object.entries(def.warps ?? {}))
    if (!'.@CE^?'.includes(ch(t.x, t.y))) errors.push(`warp ${k} lands on '${ch(t.x, t.y)}'`);

  return { ok: errors.length === 0, errors, states: states.size, chestsReachable: chestSeen.size, chestsTotal: chests.length };
}
