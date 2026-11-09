import * as THREE from 'three';

/** Deterministic PRNG (mulberry32) so procedural scenery is the same every run. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft radial glow: white core fading out (for moons, flames, embers). */
export function glowTexture(size = 128, stops: [number, string][] = [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return toTexture(c);
}

/** A thin crescent, white on clear and bulging toward -Y of the canvas (+Y on a sprite): the flash of a cut. */
export function crescentTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  const arc = (thick: number) => {
    g.beginPath();
    const N = 48, at = (u: number) => Math.PI * (1.14 + 0.72 * u);
    for (let i = 0; i <= N; i++) g.lineTo(128 + Math.cos(at(i / N)) * 118, 84 + Math.sin(at(i / N)) * 70);
    for (let i = N; i >= 0; i--) {
      const u = i / N, k = 1 - thick * Math.sin(Math.PI * u) ** 1.5;
      g.lineTo(128 + Math.cos(at(u)) * 118 * (1 - (1 - k) * 0.3), 84 + Math.sin(at(u)) * 70 * k);
    }
    g.closePath();
    g.fill();
  };
  g.shadowColor = '#ffffff';
  g.shadowBlur = 10;
  g.fillStyle = 'rgba(255,255,255,0.5)';
  arc(0.2);
  g.shadowBlur = 3;
  g.fillStyle = '#ffffff';
  arc(0.08);
  return toTexture(c);
}

/** A four-pointed glint with a soft core. */
export function starTexture(size = 64): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  const h = size / 2;
  const core = g.createRadialGradient(h, h, 0, h, h, h * 0.45);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#ffffff';
  for (const [w, l] of [[0.07, 1], [0.035, 0.6]] as const) {
    for (const rot of l === 1 ? [0, Math.PI / 2] : [Math.PI / 4, -Math.PI / 4]) {
      g.save();
      g.translate(h, h);
      g.rotate(rot);
      g.beginPath();
      g.moveTo(-h * l, 0);
      g.lineTo(0, -h * w);
      g.lineTo(h * l, 0);
      g.lineTo(0, h * w);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
  return toTexture(c);
}

/** A splash of liquid seen from above (alpha only): a blot with a ragged rim and a few drops thrown clear. */
export function stainTexture(seed: number, size = 128): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  const r = rng(seed), h = size / 2;
  const blot = (x: number, y: number, rad: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.75, `rgba(255,255,255,${a * 0.9})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  };
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = r() * h * 0.28;
    blot(h + Math.cos(a) * d, h + Math.sin(a) * d, h * (0.2 + r() * 0.22), 0.8);
  }
  for (let i = 0; i < 10; i++) {
    const a = r() * Math.PI * 2, d = h * (0.5 + r() * 0.42);
    blot(h + Math.cos(a) * d, h + Math.sin(a) * d, h * (0.03 + r() * 0.06), 0.9);
  }
  return toTexture(c, false);
}

/** Washi paper: blotchy tone and short fibres around mid-grey, tiling in both directions (data, not colour). */
export function washiTexture(size = 512): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  const r = rng(1789);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  // draw `fn` shifted by whole tiles so anything crossing an edge wraps round
  const wrap = (fn: (dx: number, dy: number) => void) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) fn(dx, dy);
  };
  for (let i = 0; i < 220; i++) {
    const x = r() * size, y = r() * size, rad = 18 + r() * 60, v = r() < 0.5 ? 0 : 255, a = 0.035 + r() * 0.04;
    wrap((dx, dy) => {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      grad.addColorStop(0, `rgba(${v},${v},${v},${a})`);
      grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = grad;
      g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    });
  }
  g.lineCap = 'round';
  for (let i = 0; i < 2400; i++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI * 2, len = 5 + r() * 22, bend = (r() - 0.5) * 8;
    const v = r() < 0.55 ? 255 : 0;
    g.strokeStyle = `rgba(${v},${v},${v},${0.07 + r() * 0.13})`;
    g.lineWidth = 0.5 + r() * 0.7;
    wrap((dx, dy) => {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.quadraticCurveTo(x + dx + Math.cos(a) * len * 0.5 - Math.sin(a) * bend, y + dy + Math.sin(a) * len * 0.5 + Math.cos(a) * bend, x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len);
      g.stroke();
    });
  }
  const t = toTexture(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A wispy cloud bank made of many soft blobs. */
export function cloudTexture(seed: number, w = 256, h = 96): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  const r = rng(seed);
  for (let i = 0; i < 70; i++) {
    const x = w * (0.1 + r() * 0.8), y = h * (0.35 + r() * 0.35), rad = 10 + r() * 28;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(255,255,255,${0.1 + r() * 0.12})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return toTexture(c);
}

/** Tileable value-noise texture in two colours (ground, stone). */
export function noiseTexture(seed: number, a: string, b: string, size = 256, scale = 8): THREE.CanvasTexture {
  const [c, g] = canvas(size);
  const r = rng(seed);
  const n = scale, grid: number[] = [];
  for (let i = 0; i < n * n; i++) grid.push(r());
  const at = (x: number, y: number) => grid[((y % n) + n) % n * n + (((x % n) + n) % n)];
  const img = g.createImageData(size, size);
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, f = 1;
      for (let o = 0; o < 4; o++) {
        const fx = (x / size) * n * f, fy = (y / size) * n * f;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
        const bot = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
        v += (top * (1 - sy) + bot * sy) * amp;
        amp *= 0.5;
        f *= 2;
      }
      const i = (y * size + x) * 4;
      img.data[i] = (ca.r + (cb.r - ca.r) * v) * 255;
      img.data[i + 1] = (ca.g + (cb.g - ca.g) * v) * 255;
      img.data[i + 2] = (ca.b + (cb.b - ca.b) * v) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Lacquered lamellar armour (kozane): rows of plates tied with coloured
 * lacing. Returns the colour map and a matching bump map.
 */
export function lamellarTextures(plate: string, lace: string, rows = 6, cols = 12, size = 256): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const [c, g] = canvas(size);
  const [bc, bg] = canvas(size);
  const rh = size / rows, cw = size / cols;
  bg.fillStyle = '#000';
  bg.fillRect(0, 0, size, size);
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    // plate row: lacquer with a highlight along its top edge
    const grad = g.createLinearGradient(0, y, 0, y + rh);
    grad.addColorStop(0, '#5a5048');
    grad.addColorStop(0.12, plate);
    grad.addColorStop(0.85, plate);
    grad.addColorStop(1, '#050404');
    g.fillStyle = grad;
    g.fillRect(0, y, size, rh);
    const bgrad = bg.createLinearGradient(0, y, 0, y + rh);
    bgrad.addColorStop(0, '#fff');
    bgrad.addColorStop(0.8, '#999');
    bgrad.addColorStop(1, '#000');
    bg.fillStyle = bgrad;
    bg.fillRect(0, y + 1, size, rh - 2);
    // vertical lacing between the rows (odoshi)
    for (let k = 0; k < cols; k++) {
      const x = k * cw + cw * 0.5;
      g.fillStyle = lace;
      g.fillRect(x - cw * 0.16, y + rh * 0.55, cw * 0.32, rh * 0.5);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x - cw * 0.16, y + rh * 0.55, cw * 0.08, rh * 0.5);
      bg.fillStyle = '#ccc';
      bg.fillRect(x - cw * 0.16, y + rh * 0.55, cw * 0.32, rh * 0.5);
    }
    // a row of small rivets
    g.fillStyle = 'rgba(201,165,92,0.6)';
    for (let k = 0; k < cols; k++) g.fillRect(k * cw + cw * 0.5 - 1, y + rh * 0.25, 2, 2);
  }
  const map = toTexture(c);
  const bump = toTexture(bc, false);
  for (const t of [map, bump]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}
