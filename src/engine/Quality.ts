/**
 * Rendering quality profiles. Everything that costs GPU time hangs off one of these, so a
 * scene asks the profile instead of testing a flag: resolution, shadows, post-processing,
 * material detail, clutter and effect counts.
 */
export type QualityId = 'performance' | 'balanced' | 'high' | 'ultra';
export const QUALITIES: QualityId[] = ['performance', 'balanced', 'high', 'ultra'];

/** Render scale: AUTO adapts to the frame rate; the others are shares of the quality profile's resolution. */
export type Resolution = 'auto' | '100' | '75' | '50';
export const RESOLUTIONS: Resolution[] = ['auto', '100', '75', '50'];
/** The setting of builds before the quality profiles; still written, so those builds read a valid value. */
export type Effects = 'high' | 'low';

export interface QualityProfile {
  id: QualityId;
  /** Cap on the display's pixel ratio for the canvas (the finish pass runs at this size). */
  outputDpr: number;
  /** Pixel budget of the internal render targets (scene, ink, bloom, SMAA). */
  maxPixels: number;
  /** Lowest share of each axis the AUTO render scale may drop to. */
  minScale: number;
  /** Moon shadow map size, and the half-width (metres) of ground it covers. */
  moonShadow: number;
  moonRange: number;
  /** Cube shadow map size of the light behind the hero in caves (0: none; six faces a frame). */
  pointShadow: number;
  /** Shadow blur radius (texels). */
  shadowRadius: number;
  /** Lantern lights lit at once. */
  lights: number;
  /** Bloom strength (0: the pass is skipped). */
  bloom: number;
  smaa: boolean;
  /** Ink ambient occlusion taps (0: off). */
  aoTaps: 0 | 8 | 16;
  /** Brush lines at creases too (normals rebuilt from depth), not only at depth jumps. */
  creases: boolean;
  /** Plates out of register, specks and scratches of the worn print. */
  worn: boolean;
  grain: number;
  anisotropy: number;
  /** Macro colour variation, detail normals and wetness in ground and rock materials. */
  detail: boolean;
  /** Rim light that parts bodies from a dark background. */
  rim: boolean;
  /** Share of ground clutter (grass, pebbles, leaves) placed. */
  clutter: number;
  /** Share of ambient motes and hit particles. */
  particles: number;
  /** Environment reflection strength, relative. */
  env: number;
}

export const PROFILES: Record<QualityId, QualityProfile> = {
  performance: {
    id: 'performance', outputDpr: 1, maxPixels: 1280 * 720, minScale: 0.5,
    moonShadow: 1024, moonRange: 16, pointShadow: 0, shadowRadius: 1.5, lights: 3,
    bloom: 0, smaa: false, aoTaps: 0, creases: false, worn: false, grain: 0,
    anisotropy: 2, detail: false, rim: true, clutter: 0.3, particles: 0.5, env: 0.8,
  },
  balanced: {
    id: 'balanced', outputDpr: 1.5, maxPixels: 1600 * 900, minScale: 0.6,
    moonShadow: 2048, moonRange: 20, pointShadow: 512, shadowRadius: 2, lights: 4,
    bloom: 0.45, smaa: true, aoTaps: 8, creases: false, worn: true, grain: 0.03,
    anisotropy: 4, detail: true, rim: true, clutter: 0.6, particles: 0.75, env: 1,
  },
  high: {
    id: 'high', outputDpr: 2, maxPixels: 1920 * 1080, minScale: 0.6,
    moonShadow: 4096, moonRange: 22, pointShadow: 1024, shadowRadius: 2.5, lights: 6,
    bloom: 0.55, smaa: true, aoTaps: 8, creases: true, worn: true, grain: 0.035,
    anisotropy: 8, detail: true, rim: true, clutter: 1, particles: 1, env: 1,
  },
  ultra: {
    id: 'ultra', outputDpr: 3, maxPixels: 3840 * 2160, minScale: 0.6,
    moonShadow: 4096, moonRange: 26, pointShadow: 2048, shadowRadius: 3, lights: 8,
    bloom: 0.6, smaa: true, aoTaps: 16, creases: true, worn: true, grain: 0.035,
    anisotropy: 16, detail: true, rim: true, clutter: 1.4, particles: 1.5, env: 1.1,
  },
};

/** The profile chosen before there were profiles: EFFECTS LOW was the cheap path, HIGH the full one. */
export function qualityFromLegacy(effects: unknown): QualityId {
  return effects === 'low' ? 'performance' : 'high';
}

export function isQuality(v: unknown): v is QualityId {
  return typeof v === 'string' && (QUALITIES as string[]).includes(v);
}

export interface RenderSize {
  /** Canvas (drawing buffer) size: what the finish pass fills. */
  outW: number;
  outH: number;
  /** Internal render target size: the scene and the passes before the finish. */
  inW: number;
  inH: number;
}

/**
 * Three sizes are kept apart: the logical screen (640 x 448 units, for the interface), the
 * CSS size of the fitted canvas, and the GPU sizes worked out here. The canvas takes the
 * display's pixel ratio up to the profile's cap; the internal targets take a `share` of it
 * (AUTO or the player's choice) within the profile's pixel budget.
 */
export function renderSize(cssW: number, cssH: number, dpr: number, q: QualityProfile, share: number): RenderSize {
  const r = Math.max(0.5, Math.min(q.outputDpr, dpr || 1));
  const outW = Math.max(320, Math.min(3840, Math.round(cssW * r)));
  const outH = Math.max(1, Math.round((outW * cssH) / cssW));
  const budget = Math.min(1, Math.sqrt(q.maxPixels / (outW * outH)));
  // even widths, so half-size bloom levels divide cleanly
  const inW = Math.max(320, Math.round((outW * budget * share) / 2) * 2);
  const inH = Math.max(1, Math.round((inW * cssH) / cssW));
  return { outW, outH, inW, inH };
}
