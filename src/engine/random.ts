/** sfc32: small, fast, well-distributed 32-bit generator. Returns unsigned 32-bit integers. */
export function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}

export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Seeded string hash used to place search text. Changing it would move every search result. */
export function hashString(s: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

const CONSONANTS = 'bcdfghjklmnprstvz';
const VOWELS = 'aeiou';

/**
 * Letters for a volume's spine. Borges says they "do not indicate or prefigure" what the pages say,
 * so they come from the volume's number alone.
 */
export function spineTitle(volumeKey: bigint): string {
  const w = (n: bigint) => Number((volumeKey >> n) & 0xffffffffn) >>> 0;
  const next = sfc32(w(0n), w(32n), w(64n) ^ 0x5bd1e995, w(96n) ^ 0x27d4eb2f);
  for (let i = 0; i < 12; i++) next();
  const words = 1 + (next() % 3);
  const out: string[] = [];
  for (let i = 0; i < words; i++) {
    const length = 3 + (next() % 7);
    let word = '';
    let vowel = (next() & 1) === 1;
    for (let j = 0; j < length; j++) {
      const pool = vowel ? VOWELS : CONSONANTS;
      word += pool[next() % pool.length];
      if (next() % 5 !== 0) vowel = !vowel;
    }
    out.push(word);
  }
  return out.join(' ');
}
