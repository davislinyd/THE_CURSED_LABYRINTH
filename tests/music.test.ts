import { describe, expect, it } from 'vitest';
import type { Manifest } from '../src/engine/Assets';
import manifestJson from '../public/assets/manifest.json?raw';
import { TICKS_WHOLE, parseMML } from '../src/audio/MML';
import { SONGS, SongName } from '../src/audio/MusicData';
import { compileSong } from '../src/audio/MusicPlayer';
import { INSTRUMENTS } from '../src/audio/Sampler';

const manifest = JSON.parse(manifestJson) as Manifest;
/** Sampled range of each instrument; notes may be stretched a little past it. */
const range = (id: string) => {
  const notes = manifest.assets[`inst/${id}`].samples!.map((s) => s.n);
  return [Math.min(...notes) - 5, Math.max(...notes) + 5];
};

describe('MML', () => {
  it('reads chords, instruments, drums and repeats', () => {
    const ch = parseMML('@koto l8 {o3 d f a}4 >c [t r]2 r | P30 y10 d2', { t: 'taiko_f' }, 'harp');
    expect(ch.events.map((e) => [e.tick, e.notes, e.drum, e.inst])).toEqual([
      [0, [50, 53, 57], '', 'koto'],
      [24, [72], '', 'koto'],
      [36, [], 'taiko_f', 'koto'],
      [60, [], 'taiko_f', 'koto'],
      [96, [74], '', 'koto'],
    ]);
    expect(ch.events[4]).toMatchObject({ scoop: 30, vib: 10, len: 48 });
    expect(ch.bars).toEqual([96]);
  });

  it('refuses drum letters that are MML commands', () => {
    expect(() => parseMML('c', { a: 'taiko_f' })).toThrow();
  });
});

describe('songs', () => {
  for (const name of Object.keys(SONGS) as SongName[]) {
    const def = SONGS[name];
    const song = compileSong(def);

    it(`${name}: all tracks share the intro, loop and length`, () => {
      for (const ch of song.channels) {
        expect(ch.events.length).toBeGreaterThan(0);
        expect(ch.loopTick).toBe(song.channels[0].loopTick);
        expect(ch.length).toBe(song.channels[0].length);
      }
    });

    it(`${name}: every bar line opens a full bar`, () => {
      const bar = (TICKS_WHOLE * (def.meter ?? 4)) / 4;
      song.channels.forEach((ch, i) => {
        expect(ch.bars, `track ${i}`).toEqual(Array.from({ length: ch.length / bar }, (_, k) => k * bar));
      });
    });

    it(`${name}: uses only sampled instruments, in their range`, () => {
      song.channels.forEach((ch, i) => {
        for (const ev of ch.events) {
          if (ev.drum) {
            expect(manifest.assets[`perc/${ev.drum}`], `track ${i}: ${ev.drum}`).toBeDefined();
            continue;
          }
          const id = ev.inst || def.tracks[i].inst;
          expect(INSTRUMENTS[id], `track ${i}: ${id}`).toBeDefined();
          const [lo, hi] = range(id);
          for (const n of ev.notes) {
            expect(n, `track ${i} ${id} at tick ${ev.tick}`).toBeGreaterThanOrEqual(lo);
            expect(n, `track ${i} ${id} at tick ${ev.tick}`).toBeLessThanOrEqual(hi);
          }
        }
      });
    });
  }

  it('has a spec for every sampled instrument', () => {
    const sampled = Object.keys(manifest.assets).filter((k) => k.startsWith('inst/')).map((k) => k.slice(5));
    expect(Object.keys(INSTRUMENTS).sort()).toEqual(sampled.sort());
  });
});
