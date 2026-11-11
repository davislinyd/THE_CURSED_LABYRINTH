import { describe, expect, it } from 'vitest';
import { bootOptions } from '../src/core/Game';
import { DynamicResolution } from '../src/engine/DynamicResolution';
import { Samples } from '../src/engine/PerfMonitor';
import { PROFILES, QUALITIES, renderSize } from '../src/engine/Quality';
import { DEFAULT_SETTINGS, migrateSettings } from '../src/persistence/SaveManager';

describe('quality profiles', () => {
  it('cost never falls from one profile to the next', () => {
    const rising = ['outputDpr', 'maxPixels', 'moonShadow', 'pointShadow', 'lights', 'bloom', 'aoTaps', 'anisotropy', 'clutter', 'particles'] as const;
    for (let i = 1; i < QUALITIES.length; i++) {
      const a = PROFILES[QUALITIES[i - 1]], b = PROFILES[QUALITIES[i]];
      for (const k of rising) expect(b[k], `${b.id}.${k}`).toBeGreaterThanOrEqual(a[k]);
    }
  });

  it('keeps the cheapest profile free of the costly passes', () => {
    const p = PROFILES.performance;
    expect([p.bloom, p.pointShadow, p.aoTaps, p.smaa, p.creases, p.worn]).toEqual([0, 0, 0, false, false, false]);
  });
});

describe('render sizes', () => {
  it('caps a Retina canvas at the profile and the internal targets at its pixel budget', () => {
    const hi = renderSize(1440, 900, 2, PROFILES.high, 1);
    expect([hi.outW, hi.outH]).toEqual([2880, 1800]);
    expect(hi.inW * hi.inH).toBeLessThanOrEqual(1920 * 1080 * 1.01);
    expect(hi.inW / hi.inH).toBeCloseTo(1440 / 900, 2);
    const perf = renderSize(1440, 900, 2, PROFILES.performance, 1);
    expect(perf.outW).toBe(1440);
    expect(perf.inW * perf.inH).toBeLessThanOrEqual(1280 * 720 * 1.01);
  });

  it('renders a 1080p display at 1080p on HIGH, and a share of it on request', () => {
    const full = renderSize(1920, 1080, 1, PROFILES.high, 1);
    expect([full.inW, full.inH]).toEqual([1920, 1080]);
    const half = renderSize(1920, 1080, 1, PROFILES.high, 0.5);
    expect([half.outW, half.inW, half.inH]).toEqual([1920, 960, 540]);
  });

  it('never goes below a usable size', () => {
    const tiny = renderSize(200, 140, 1, PROFILES.performance, 0.5);
    expect(tiny.inW).toBeGreaterThanOrEqual(320);
    expect(tiny.inH).toBeGreaterThan(0);
  });
});

describe('settings of earlier builds', () => {
  it('maps EFFECTS LOW / HIGH to a profile and keeps everything else', () => {
    const low = migrateSettings({ bgmVolume: 3, effects: 'low', resolution: '75' });
    expect([low.quality, low.effects, low.bgmVolume, low.resolution]).toEqual(['performance', 'low', 3, '75']);
    expect(migrateSettings({ effects: 'high' }).quality).toBe('high');
  });

  it('gives fresh installs the defaults', () => {
    expect(migrateSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('repairs unknown values and keeps the legacy field in step', () => {
    const s = migrateSettings({ quality: 'cinematic' as never, resolution: 'hd' as never, effects: 'low' });
    expect([s.quality, s.resolution]).toEqual(['performance', 'auto']);
    expect(migrateSettings({ quality: 'ultra', effects: 'low' }).effects).toBe('high');
    expect(migrateSettings({ quality: 'balanced' }).quality).toBe('balanced');
  });
});

describe('dynamic resolution', () => {
  const run = (d: DynamicResolution, ms: number, frames: number, t0 = 0, gpu: number | null = null) => {
    let changes = 0, t = t0;
    for (let i = 0; i < frames; i++) if (d.sample(ms, (t += ms), gpu)) changes++;
    return { changes, t };
  };

  it('holds at full scale while frames are on time, and ignores hitches', () => {
    const d = new DynamicResolution(0.6);
    expect(run(d, 16.7, 2000).changes).toBe(0);
    expect(d.sample(400, 1e6)).toBe(false);
    expect(d.scale).toBe(1);
  });

  it('steps down under sustained load, in small steps, never below the floor', () => {
    const d = new DynamicResolution(0.6);
    run(d, 22, 60);
    expect(d.scale).toBeCloseTo(0.94, 5);
    run(d, 22, 5000);
    expect(d.scale).toBe(0.6);
  });

  it('drops two steps at once when far too slow', () => {
    const d = new DynamicResolution(0.6);
    run(d, 40, 60);
    expect(d.scale).toBeCloseTo(0.88, 5);
  });

  it('climbs back after a long smooth run, but not to a scale that just failed', () => {
    const d = new DynamicResolution(0.6);
    let { t } = run(d, 22, 120);
    const low = d.scale;
    expect(low).toBeCloseTo(0.88, 5);
    // 0.94 was too slow less than a minute ago: stay
    ({ t } = run(d, 16, 1400, t));
    expect(d.scale).toBeCloseTo(low, 5);
    run(d, 16, 700, t + 61000);
    expect(d.scale).toBeCloseTo(0.94, 5);
  });

  it('does not climb while the GPU reports no headroom', () => {
    const d = new DynamicResolution(0.6);
    const { t } = run(d, 22, 60);
    run(d, 16, 3000, t + 61000, 15);
    expect(d.scale).toBeCloseTo(0.94, 5);
    run(d, 16, 700, t + 200000, 6);
    expect(d.scale).toBe(1);
  });

  it('starts over at the top when the profile changes', () => {
    const d = new DynamicResolution(0.6);
    run(d, 30, 400);
    d.reset(0.5);
    expect([d.scale, d.min]).toEqual([1, 0.5]);
  });
});

describe('frame statistics', () => {
  it('reports nothing rather than zero before any sample', () => {
    const s = new Samples(8);
    expect(s.mean()).toBeNaN();
    expect(s.percentiles([50])[0]).toBeNaN();
  });

  it('gives mean and nearest-rank percentiles over the last samples only', () => {
    const s = new Samples(100);
    for (let i = 1; i <= 100; i++) s.push(i);
    expect(s.mean()).toBeCloseTo(50.5, 5);
    expect(s.percentiles([50, 95, 99])).toEqual([50, 95, 99]);
    for (let i = 0; i < 100; i++) s.push(7);
    expect(s.percentiles([99])[0]).toBe(7);
    expect(s.count).toBe(100);
  });
});

describe('address options', () => {
  it('reads a benchmark request and rejects unknown values', () => {
    expect(bootOptions('?bench=boss&quality=ultra&seconds=5&res=75')).toEqual({ bench: 'boss', quality: 'ultra', seconds: 5, resolution: '75' });
    expect(bootOptions('?bench=moon&quality=max&res=1')).toEqual({});
    expect(bootOptions('?perf')).toEqual({ perf: true });
    expect(bootOptions('')).toEqual({});
  });
});
