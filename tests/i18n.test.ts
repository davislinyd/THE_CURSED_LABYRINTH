import { describe, expect, it } from 'vitest';
import { DIR_NAMES, ITEM_NAMES, KEY_ITEM_INFO } from '../src/core/GameState';
import { DUNGEONS } from '../src/data/levels/dungeons';
import { STAGES } from '../src/data/levels/stages';
import { BARRIERS, SHRINES, TOWNS } from '../src/data/levels/world';
import { glyph, measure, wrapPx, zhGlyph } from '../src/graphics/Font';
import { setLang, t } from '../src/i18n';
import { ZH } from '../src/i18n/zh';

const SOURCES = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const src = (name: string) => SOURCES[`../src/${name}`];
const LIT = /'((?:[^'\\\n]|\\.)*)'/g;
const unescape = (s: string) => s.replace(/\\(.)/g, '$1');
const literals = (text: string) => [...text.matchAll(LIT)].map((m) => unescape(m[1]));
/** The literals inside `const NAME = [ ... ];` in a source file. */
const arrayLiterals = (file: string, name: string) => {
  const m = src(file).match(new RegExp(`const ${name}\\b[^=]*=\\s*([\\s\\S]*?)(?:\\];|\\n\\};)`));
  if (!m) throw new Error(`${name} not found in ${file}`);
  return literals(m[1]);
};
/** Text that is shown to the player (key placeholders and symbols alone need no translation). */
const needsText = (s: string) => /[A-Z]{2,}/.test(s.replace(/\{\w+\}/g, ''));

function displayed(): string[] {
  const out: string[] = [];
  // every t('literal') call
  for (const [path, text] of Object.entries(SOURCES)) {
    if (path.includes('/i18n/') || path.endsWith('fontZh.ts')) continue;
    for (const m of text.matchAll(/\bt\('((?:[^'\\\n]|\\.)*)'/g)) out.push(unescape(m[1]));
  }
  // menus and tables translated through t(variable)
  out.push(...arrayLiterals('scenes/TitleScene.ts', 'MENU'));
  out.push(...arrayLiterals('ui/PauseMenu.ts', 'ITEMS'));
  out.push(...arrayLiterals('ui/Options.ts', 'ROWS'));
  out.push(...arrayLiterals('ui/Controls.ts', 'ROWS'));
  out.push(...arrayLiterals('ui/Inventory.ts', 'ITEM_DESC').filter(needsText));
  out.push(...arrayLiterals('scenes/IntroScene.ts', 'PAGES'));
  out.push(...arrayLiterals('scenes/EndingScene.ts', 'STORY'));
  out.push(...[...src('scenes/EndingScene.ts').matchAll(/\['([A-Z ]+)', /g)].map((m) => m[1]));
  out.push(...[...src('combat/Bosses.ts').matchAll(/readonly (?:name|title) = '([^']+)'/g)].map((m) => m[1]));
  out.push('OFF', 'LIGHT', 'MEDIUM', 'ON');
  // game data
  out.push(...Object.values(ITEM_NAMES), ...DIR_NAMES);
  for (const k of Object.values(KEY_ITEM_INFO)) out.push(k.name, k.desc);
  for (const d of Object.values(DUNGEONS)) out.push(d.name, ...Object.values(d.tablets ?? {}), ...Object.values(d.npcs ?? {}));
  for (const s of Object.values(STAGES)) out.push(s.title, s.subtitle);
  for (const b of Object.values(BARRIERS)) out.push(b.opened, b.closed);
  for (const tw of Object.values(TOWNS)) out.push(tw.name, ...tw.talk);
  out.push(...Object.values(SHRINES));
  return [...new Set(out)].filter((s) => needsText(s) || DIR_NAMES.includes(s as never));
}

const drawable = (ch: string) => !!zhGlyph(ch) || glyph(ch, false) !== glyph('?', false) || ch === '?';

describe('Traditional Chinese text', () => {
  it('has a translation for every displayed English string', () => {
    const shown = displayed();
    expect(shown.length).toBeGreaterThan(200); // the scan itself works
    expect(shown.filter((s) => !(s in ZH))).toEqual([]);
  });

  it('keeps the same placeholders as the English source', () => {
    const marks = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const [en, zh] of Object.entries(ZH)) expect(marks(zh), en).toBe(marks(en));
  });

  it('can draw every character of the Chinese text', () => {
    const chars = new Set([...Object.values(ZH).join('').replace(/\{\w+\}/g, ''), ...'繁體中文']);
    expect([...chars].filter((c) => !drawable(c))).toEqual([]);
  });

  it('can draw every character of the English text', () => {
    const chars = new Set(displayed().join('').replace(/\{\w+\}/g, ''));
    expect([...chars].filter((c) => !drawable(c))).toEqual([]);
  });

  it('fills key names and arguments', () => {
    setLang('zh');
    expect(t('{A}: YES    {B}: NO')).toBe('X：是　　Z：否');
    expect(t('FOUND {0} ×{1}.', t('HERB'), 3)).toBe('得到了藥草 ×3。');
    setLang('en');
    expect(t('PRESS {START}')).toBe('PRESS ENTER');
    expect(t('FOUND {0} GOLD.', 30)).toBe('FOUND 30 GOLD.');
  });
});

describe('mixed-script wrapping', () => {
  it('breaks Chinese anywhere but keeps closing punctuation off the line start', () => {
    const lines = wrapPx('燈'.repeat(10) + '。', 120);
    expect(lines).toEqual(['燈'.repeat(9), '燈。']);
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(120);
  });

  it('breaks Latin text at spaces', () => {
    expect(wrapPx('THE KEY TURNS. THE LOCK FALLS AWAY.', 15 * 8)).toEqual(['THE KEY TURNS.', 'THE LOCK FALLS', 'AWAY.']);
  });
});
