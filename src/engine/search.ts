import { PAGE_LENGTH, PAGE_COUNT, RADIX } from './constants';
import { textToDigits } from './alphabet';
import { digitsToBigInt } from './radix';
import { hashString, sfc32 } from './random';
import { fromIndex, indexOf, type Location } from './location';

export interface Found {
  location: Location;
  index: bigint;
  /** Character position of the text on its page */
  offset: number;
}

/**
 * Build the one page that holds `text` for this variant (random filler, text at a
 * seeded offset), then run the mapping backwards to find where that page is shelved.
 * `text` must already be normalised.
 */
export function search(text: string, variant = 0): Found {
  if (text.length < 1 || text.length > PAGE_LENGTH) throw new RangeError('text must be 1–3,200 characters');
  const key = variant === 0 ? text : `${text}\u0000${variant}`;
  const next = sfc32(hashString(key, 1), hashString(key, 2), hashString(key, 3), text.length);
  const page = new Uint8Array(PAGE_LENGTH);
  for (let i = 0; i < PAGE_LENGTH; i++) page[i] = next() % RADIX;
  const offset = next() % (PAGE_LENGTH - text.length + 1);
  page.set(textToDigits(text), offset);
  const index = indexOf(page);
  return { location: fromIndex(index), index, offset };
}

/** A random place in the library from a 64-bit seed, so a random volume can be shared in a few characters. */
export function indexFromSeed(seed: bigint): bigint {
  const lo = Number(seed & 0xffffffffn) >>> 0;
  const hi = Number((seed >> 32n) & 0xffffffffn) >>> 0;
  const next = sfc32(lo, hi, lo ^ 0x9e3779b9, hi ^ 0x7f4a7c15);
  for (let i = 0; i < 12; i++) next();
  const d = new Uint8Array(PAGE_LENGTH);
  for (let i = 0; i < PAGE_LENGTH; i++) d[i] = next() % RADIX;
  return digitsToBigInt(d) % PAGE_COUNT;
}
