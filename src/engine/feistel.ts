import { HALF, PAGE_LENGTH, RADIX } from './constants';
import { fmix32, sfc32 } from './random';

// Fractional digits of π: constants nobody chose.
const ROUND_KEYS = [0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344, 0xa4093822, 0x299f31d0];
const ROUNDS = ROUND_KEYS.length;

const SIX_DIGITS = RADIX ** 6; // 594,823,321
const SIX_DIGIT_LIMIT = SIX_DIGITS * 7; // largest multiple below 2^32, for bias-free rejection

/**
 * The round function: hash one half (any change to any digit changes the seed),
 * then expand the seed into a half-page of uniform base-29 digits.
 * It never needs inverting; a Feistel network is a bijection whatever this returns.
 */
function round(src: Uint8Array, key: number, out: Uint8Array): void {
  let h1 = key;
  let h2 = key ^ 0x9e3779b9;
  let h3 = key ^ 0x7f4a7c15;
  let h4 = key ^ 0x94d049bb;
  for (let i = 0; i < HALF; i += 4) {
    const k = src[i]! | (src[i + 1]! << 5) | (src[i + 2]! << 10) | (src[i + 3]! << 15) | (i << 20);
    let k1 = Math.imul(k, 0xcc9e2d51);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, 0x1b873593);
    h1 ^= k1; h1 = (h1 << 19) | (h1 >>> 13); h1 = (h1 + h2) | 0; h1 = (Math.imul(h1, 5) + 0x561ccd1b) | 0;
    h2 ^= Math.imul(k1, 0x85ebca6b); h2 = (h2 << 17) | (h2 >>> 15); h2 = (h2 + h3) | 0; h2 = (Math.imul(h2, 5) + 0x0bcaa747) | 0;
    h3 ^= Math.imul(k1, 0xc2b2ae35); h3 = (h3 << 15) | (h3 >>> 17); h3 = (h3 + h4) | 0; h3 = (Math.imul(h3, 5) + 0x96cd1c35) | 0;
    h4 ^= Math.imul(k1, 0x27d4eb2f); h4 = (h4 << 13) | (h4 >>> 19); h4 = (h4 + h1) | 0; h4 = (Math.imul(h4, 5) + 0x32ac3b17) | 0;
  }
  h1 = (h1 + h2 + h3 + h4) | 0; h2 = (h2 + h1) | 0; h3 = (h3 + h1) | 0; h4 = (h4 + h1) | 0;
  h1 = fmix32(h1); h2 = fmix32(h2); h3 = fmix32(h3); h4 = fmix32(h4);
  h1 = (h1 + h2 + h3 + h4) | 0; h2 = (h2 + h1) | 0; h3 = (h3 + h1) | 0; h4 = (h4 + h1) | 0;

  const next = sfc32(h1, h2, h3, h4);
  for (let i = 0; i < 12; i++) next();
  let o = 0;
  while (o < HALF) {
    let x = next();
    if (x >= SIX_DIGIT_LIMIT) continue;
    x %= SIX_DIGITS;
    for (let j = 0; j < 6 && o < HALF; j++) {
      out[o++] = x % RADIX;
      x = (x / RADIX) | 0;
    }
  }
}

const scratch = new Uint8Array(HALF);

/** Location digits to page digits. Each round: (L, R) → (R, L ⊞ F(R)), ⊞ = digit-wise addition mod 29. */
export function scramble(digits: Uint8Array): Uint8Array {
  let left = digits.slice(0, HALF);
  let right = digits.slice(HALF, PAGE_LENGTH);
  for (let r = 0; r < ROUNDS; r++) {
    round(right, ROUND_KEYS[r]!, scratch);
    for (let i = 0; i < HALF; i++) {
      const s = left[i]! + scratch[i]!;
      left[i] = s >= RADIX ? s - RADIX : s;
    }
    [left, right] = [right, left];
  }
  const out = new Uint8Array(PAGE_LENGTH);
  out.set(left, 0);
  out.set(right, HALF);
  return out;
}

/** Page digits back to location digits: the same rounds, run backwards with subtraction. */
export function unscramble(digits: Uint8Array): Uint8Array {
  let left = digits.slice(0, HALF);
  let right = digits.slice(HALF, PAGE_LENGTH);
  for (let r = ROUNDS - 1; r >= 0; r--) {
    round(left, ROUND_KEYS[r]!, scratch);
    for (let i = 0; i < HALF; i++) {
      const s = right[i]! - scratch[i]!;
      right[i] = s < 0 ? s + RADIX : s;
    }
    [left, right] = [right, left];
  }
  const out = new Uint8Array(PAGE_LENGTH);
  out.set(left, 0);
  out.set(right, HALF);
  return out;
}
