import { describe, expect, it } from 'vitest';
import type { Manifest } from '../src/engine/Assets';
import manifestJson from '../public/assets/manifest.json?raw';
import credits from '../CREDITS.md?raw';

const manifest = JSON.parse(manifestJson) as Manifest;
const PUBLIC = new Set(Object.keys(import.meta.glob('../public/**/*', { query: '?url', eager: true })).map((k) => k.slice('../public/'.length)));
/** Asset paths are relative to public/assets/. */
const exists = (path: string) => PUBLIC.has(new URL(path, 'http://x/assets/').pathname.slice(1));
const LICENSES = ['CC0-1.0', 'OFL-1.1'];

describe('asset manifest', () => {
  it('gives every source a known licence with its text shipped', () => {
    for (const [key, s] of Object.entries(manifest.sources)) {
      if (s.license === 'original') continue; // the project's own work
      expect(LICENSES, key).toContain(s.license);
      expect(s.author && s.url, key).toBeTruthy();
      expect(exists(`../licenses/${s.licenseFile}`), `${key}: ${s.licenseFile}`).toBe(true);
    }
  });

  it('records the source and origin of every asset, and its files exist', () => {
    const entries = Object.entries(manifest.assets);
    expect(entries.length).toBeGreaterThan(100);
    for (const [key, a] of entries) {
      expect(manifest.sources[a.source], `${key}: source ${a.source}`).toBeDefined();
      expect(a.origin, key).toMatch(a.source === 'original' ? /^scripts\/blender\// : /^https:\/\//);
      expect(a.files.length, key).toBeGreaterThan(0);
      for (const f of a.files) expect(exists(f), `${key}: ${f}`).toBe(true);
    }
  });

  it('maps every instrument sample to a playable note', () => {
    const instruments = Object.entries(manifest.assets).filter(([, a]) => a.kind === 'instrument');
    expect(instruments.length).toBeGreaterThan(10);
    for (const [key, a] of instruments) {
      expect(a.samples?.length, key).toBe(a.files.length);
      for (const s of a.samples!) {
        expect(s.n, `${key}: ${s.f}`).toBeGreaterThanOrEqual(21);
        expect(s.n, `${key}: ${s.f}`).toBeLessThanOrEqual(108);
        expect(s.v).toBeGreaterThan(0);
        expect(s.v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('credits every source and Poly Haven asset', () => {
    for (const s of Object.values(manifest.sources)) expect(credits).toContain(s.title);
    for (const a of Object.values(manifest.assets)) if (a.source === 'polyhaven') expect(credits).toContain(a.origin);
  });
});
