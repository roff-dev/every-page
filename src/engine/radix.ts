import { PAGE_LENGTH, RADIX } from './constants';

const R = BigInt(RADIX);
const powers = new Map<number, bigint>();

function pow29(k: number): bigint {
  let v = powers.get(k);
  if (v === undefined) {
    v = R ** BigInt(k);
    powers.set(k, v);
  }
  return v;
}

/**
 * Base-29 digits (most significant first) to a BigInt. Splits in half recursively so the
 * multiplications stay balanced, and folds 9 digits at a time into a double (29^9 < 2^53).
 */
export function digitsToBigInt(d: Uint8Array, lo = 0, hi = d.length): bigint {
  const n = hi - lo;
  if (n <= 64) {
    let v = 0n;
    for (let i = lo; i < hi; ) {
      const take = Math.min(9, hi - i);
      let chunk = 0;
      for (let j = 0; j < take; j++) chunk = chunk * RADIX + d[i + j]!;
      v = v * pow29(take) + BigInt(chunk);
      i += take;
    }
    return v;
  }
  const mid = lo + (n >> 1);
  return digitsToBigInt(d, lo, mid) * pow29(hi - mid) + digitsToBigInt(d, mid, hi);
}

/** BigInt to a fixed-length array of base-29 digits, most significant first. */
export function bigIntToDigits(v: bigint, length = PAGE_LENGTH): Uint8Array {
  if (v < 0n) throw new RangeError('negative value');
  const s = v.toString(RADIX);
  const out = new Uint8Array(length);
  const offset = length - s.length;
  if (offset < 0) throw new RangeError('value does not fit');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[offset + i] = c <= 57 ? c - 48 : c - 87;
  }
  return out;
}
