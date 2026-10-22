import { ALPHABET, PAGE_LENGTH } from './constants';

const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]));

// Letters that canonical decomposition leaves whole
const FOLDS: Record<string, string> = {
  ß: 'ss', ẞ: 'ss', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe', ø: 'o', Ø: 'o',
  ł: 'l', Ł: 'l', đ: 'd', Đ: 'd', þ: 'th', Þ: 'th', ð: 'd', Ð: 'd', ı: 'i',
};
const TO_SPACE = /[\s\-‐-―/\\_]/u;
const TO_STOP = /[!?;:¡¿…]/u;
const DROPPED_QUIETLY = /['"‘’‚‛“”„‟`´«»‹›]/u;

export type Change =
  | { kind: 'altered'; from: string; to: string; at: number } // at = index in the normalised text
  | { kind: 'removed'; char: string };

export interface Normalised {
  text: string;
  changes: Change[];
  /** Distinct characters the alphabet can't hold, in order of first appearance */
  removed: string[];
  truncated: boolean;
}

/** Rewrite any input into the library's 29 symbols, recording every change for the visitor. */
export function normalise(input: string): Normalised {
  let text = '';
  const changes: Change[] = [];
  const removed: string[] = [];
  let truncated = false;

  for (const ch of input) {
    let out: string;
    const lower = ch.toLowerCase();
    if (INDEX.has(lower) && lower !== ' ') out = lower;
    else if (TO_SPACE.test(ch)) out = ' ';
    else if (TO_STOP.test(ch)) out = '.';
    else if (DROPPED_QUIETLY.test(ch)) out = '';
    else if (FOLDS[ch] !== undefined) out = FOLDS[ch];
    else {
      const stripped = ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
      out = [...stripped].every((c) => INDEX.has(c)) ? stripped : '';
      if (out === '') {
        if (!removed.includes(ch)) removed.push(ch);
        changes.push({ kind: 'removed', char: ch });
        continue;
      }
    }
    if (text.length + out.length > PAGE_LENGTH) {
      truncated = true;
      break;
    }
    // Lowercasing and dropping quote marks are expected, so they aren't reported
    if (out !== '' && out !== lower) changes.push({ kind: 'altered', from: ch, to: out, at: text.length });
    text += out;
  }
  return { text, changes, removed, truncated };
}

export function textToDigits(text: string): Uint8Array {
  const d = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const v = INDEX.get(text[i]!);
    if (v === undefined) throw new RangeError(`not in the alphabet: ${text[i]}`);
    d[i] = v;
  }
  return d;
}

export function digitsToText(d: Uint8Array): string {
  let s = '';
  for (let i = 0; i < d.length; i++) s += ALPHABET[d[i]!];
  return s;
}
