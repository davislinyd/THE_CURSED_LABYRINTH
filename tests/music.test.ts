import { describe, expect, it } from 'vitest';
import { TICKS_WHOLE, parseMML } from '../src/audio/MML';
import { SONGS, SongName } from '../src/audio/MusicData';

describe('chiptune songs', () => {
  for (const name of Object.keys(SONGS) as SongName[]) {
    const song = SONGS[name];
    const chs = [song.sq1, song.sq2, song.tri, song.noise].map(parseMML);

    it(`${name}: the four channels stay in step`, () => {
      for (const ch of chs) expect(ch.events.length).toBeGreaterThan(0);
      // same intro and same loop body, so looping never drifts the channels apart
      for (const ch of chs) {
        expect(ch.loopTick).toBe(chs[0].loopTick);
        expect(ch.length).toBe(chs[0].length);
      }
    });

    it(`${name}: every bar line opens a full 4/4 bar`, () => {
      chs.forEach((ch, i) => {
        const expected = Array.from({ length: ch.length / TICKS_WHOLE }, (_, k) => k * TICKS_WHOLE);
        expect(ch.bars, `channel ${i}`).toEqual(expected);
      });
    });
  }
});
