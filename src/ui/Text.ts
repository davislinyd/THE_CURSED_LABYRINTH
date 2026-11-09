const NO_START = '，。、！？：；」』）…─';
const NO_END = '「『（';

/** Characters that may break anywhere (CJK ideographs, kana, full-width punctuation). */
export function isCJK(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef) || c === 0x2026 || c === 0x2500;
}

/** Wrap mixed Latin / Chinese text to a width: Latin breaks at spaces, Chinese anywhere (with kinsoku). */
export function wrapText(text: string, width: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    // tokens: Latin words, single spaces, single Chinese characters with their punctuation attached
    const tokens: string[] = [];
    for (const ch of para) {
      const last = tokens[tokens.length - 1];
      const lastCh = last ? last[last.length - 1] : '';
      if (ch === ' ') tokens.push(' ');
      else if (isCJK(ch)) {
        if (last && last !== ' ' && (NO_START.includes(ch) || NO_END.includes(lastCh))) tokens[tokens.length - 1] += ch;
        else tokens.push(ch);
      } else if (last && last !== ' ' && (!isCJK(lastCh) || NO_END.includes(lastCh))) tokens[tokens.length - 1] += ch;
      else tokens.push(ch);
    }
    let line = '';
    for (const tok of tokens) {
      if (tok === ' ' && !line) continue;
      if (line && measure(line + tok) > width) {
        out.push(line.trimEnd());
        line = tok === ' ' ? '' : tok;
      } else line += tok;
    }
    out.push(line.trimEnd());
  }
  return out;
}
