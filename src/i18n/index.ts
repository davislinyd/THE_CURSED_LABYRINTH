import { ZH } from './zh';

export type Lang = 'en' | 'zh';

let lang: Lang = 'en';

export function setLang(l: Lang): void {
  lang = l;
}

export function isZh(): boolean {
  return lang === 'zh';
}

/** First-run default: Traditional Chinese for any zh-* browser, English otherwise. */
export function browserLang(): Lang {
  return typeof navigator !== 'undefined' && /^zh/i.test(navigator.language) ? 'zh' : 'en';
}

/** Real keyboard names, so on-screen prompts match the keys (and the touch pad labels). */
export const KEY_NAMES: Record<string, string> = { A: 'X', B: 'Z', START: 'ENTER', SELECT: 'SHIFT' };

/**
 * Translate an English source string. `{0}`, `{1}`… are filled from `args`;
 * `{A}` `{B}` `{START}` `{SELECT}` become the keyboard keys.
 */
export function t(en: string, ...args: (string | number)[]): string {
  const src = lang === 'zh' ? ZH[en] ?? en : en;
  return src.replace(/\{(\w+)\}/g, (m, k: string) => (k in KEY_NAMES ? KEY_NAMES[k] : /^\d+$/.test(k) ? String(args[+k] ?? '') : m));
}
