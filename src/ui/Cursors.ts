export type CursorKind = 'normal' | 'act' | 'attack';

type Paint = (g: CanvasRenderingContext2D) => void;

/** An ink-brush arrow pointing up-left, its tip at (3, 2). */
const arrow = (fill: string, edge: string): Paint => (g) => {
  g.beginPath();
  g.moveTo(3, 2);
  g.lineTo(3, 24);
  g.lineTo(9, 19);
  g.lineTo(14, 29);
  g.lineTo(18, 27);
  g.lineTo(13, 17.5);
  g.lineTo(21, 17);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 1.6;
  g.lineJoin = 'round';
  g.strokeStyle = edge;
  g.stroke();
};

/** A crimson strike mark: a broken ring with four ticks, centred. */
const strike: Paint = (g) => {
  g.lineCap = 'round';
  for (const [w, col] of [[4.2, '#140d08'], [2, '#d4321f']] as const) {
    g.lineWidth = w;
    g.strokeStyle = col;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.35;
      g.beginPath();
      g.arc(16, 16, 9, a, a + 1.05);
      g.stroke();
      const b = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.beginPath();
      g.moveTo(16 + Math.cos(b) * 4, 16 + Math.sin(b) * 4);
      g.lineTo(16 + Math.cos(b) * 7, 16 + Math.sin(b) * 7);
      g.stroke();
    }
  }
};

/** CSS cursor values, plain and (for sharp HiDPI cursors) as an image-set. */
function css(paint: Paint, hx: number, hy: number): string[] {
  const url = (scale: number) => {
    const c = document.createElement('canvas');
    c.width = c.height = 32 * scale;
    const g = c.getContext('2d')!;
    g.scale(scale, scale);
    paint(g);
    return c.toDataURL();
  };
  const x1 = url(1);
  return [`url(${x1}) ${hx} ${hy}, auto`, `image-set(url(${x1}) 1x, url(${url(2)}) 2x) ${hx} ${hy}, auto`];
}

/** The game's mouse cursors, drawn once at start-up (original designs). */
export function makeCursors(): Record<CursorKind, string[]> {
  return {
    normal: css(arrow('#140d08', '#e9d6a6'), 3, 2),
    act: css(arrow('#c9a55c', '#140d08'), 3, 2),
    attack: css(strike, 16, 16),
  };
}
