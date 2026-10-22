import { normalise } from './alphabet';
import { HEXAGON_COUNT, PAGE_LENGTH } from './constants';
import { exists, type Location } from './location';

/**
 * Every state worth sharing is an anchor plus an optional page offset, so links stay short.
 * The query lives in the hash, which browsers never send to the server.
 */
export type Anchor =
  | { kind: 'query'; text: string; variant: number }
  | { kind: 'random'; seed: bigint }
  | { kind: 'address'; location: Location };

export interface Link {
  anchor: Anchor;
  /** Pages from the anchor's page, in library order. */
  offset: bigint;
}

const SPACE = '_'; // not in the alphabet, so it stands for a space unambiguously

export function formatLink({ anchor, offset }: Link): string {
  let hash: string;
  if (anchor.kind === 'query') {
    hash = 'q=' + anchor.text.replaceAll(' ', SPACE);
    if (anchor.variant) hash += `&k=${anchor.variant}`;
  } else if (anchor.kind === 'random') {
    hash = 'r=' + anchor.seed.toString(36);
  } else {
    const { hexagon, wall, shelf, volume, page } = anchor.location;
    hash = `a=${hexagon.toString(36)}.${wall + 1}.${shelf + 1}.${volume + 1}.${page + 1}`;
  }
  if (offset) hash += `&d=${offset}`;
  return '#' + hash;
}

/** Reads a hash. Anything malformed gives null, and the page simply opens as usual. */
export function parseLink(hash: string): Link | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const offset = parseOffset(params.get('d'));
  if (offset === null) return null;

  const q = params.get('q');
  if (q !== null) {
    const text = q.replaceAll(SPACE, ' ');
    const n = normalise(text);
    if (!n.text || n.text !== text || n.text.length > PAGE_LENGTH) return null;
    const k = params.get('k');
    const variant = k === null ? 0 : Number(k);
    if (!Number.isSafeInteger(variant) || variant < 0) return null;
    return { anchor: { kind: 'query', text, variant }, offset };
  }

  const r = params.get('r');
  if (r !== null) {
    if (!/^[0-9a-z]{1,13}$/.test(r)) return null;
    const seed = parseBase36(r);
    if (seed === null || seed >= 1n << 64n) return null;
    return { anchor: { kind: 'random', seed }, offset };
  }

  const a = params.get('a');
  if (a !== null) {
    const m = /^([0-9a-z]{1,3100})\.(\d)\.(\d)\.(\d{1,2})\.(\d{1,3})$/.exec(a);
    if (!m) return null;
    const hexagon = parseBase36(m[1]!);
    if (hexagon === null || hexagon >= HEXAGON_COUNT) return null;
    const location = { hexagon, wall: +m[2]! - 1, shelf: +m[3]! - 1, volume: +m[4]! - 1, page: +m[5]! - 1 };
    if (!exists(location)) return null;
    return { anchor: { kind: 'address', location }, offset };
  }
  return null;
}

function parseOffset(d: string | null): bigint | null {
  if (d === null || d === '') return 0n;
  d = d.replace(/^ /, '+'); // a typed '+' arrives as a space
  if (!/^[+-]?\d{1,4700}$/.test(d)) return null;
  return BigInt(d.replace(/^\+/, ''));
}

function parseBase36(s: string): bigint | null {
  let v = 0n;
  for (const c of s) {
    const d = parseInt(c, 36);
    if (Number.isNaN(d)) return null;
    v = v * 36n + BigInt(d);
  }
  return v;
}
