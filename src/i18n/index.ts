import { ZH } from './zh';

export type Lang = 'en' | 'zh';

let lang: Lang = 'en';
let keyNames: Record<string, string> = {};

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

/** Names of the keys / buttons of the device in use, e.g. { ATTACK: 'J' }. */
export function setKeyNames(names: Record<string, string>): void {
  keyNames = names;
}

/**
 * Translate an English source string. `{0}`, `{1}`… are filled from `args`;
 * `{ATTACK}`, `{CONFIRM}`… become the keys of the current input device.
 */
export function t(en: string, ...args: (string | number)[]): string {
  const src = lang === 'zh' ? ZH[en] ?? en : en;
  return src.replace(/\{(\w+)\}/g, (m, k: string) => (k in keyNames ? keyNames[k] : /^\d+$/.test(k) ? String(args[+k] ?? '') : m));
}
