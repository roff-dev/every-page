import {
  GALLERY_WIDTH, HEXAGON_COUNT, PAGE_COUNT, PAGES_PER_HEXAGON, PAGES_PER_VOLUME,
  SHELVES_PER_WALL, VOLUMES_PER_SHELF, WALLS,
} from './constants';
import { bigIntToDigits, digitsToBigInt } from './radix';
import { scramble, unscramble } from './feistel';

/** Every field is 0-based; the interface adds one. */
export interface Location {
  hexagon: bigint;
  wall: number;
  shelf: number;
  volume: number;
  page: number;
}

const PER_HEX = BigInt(PAGES_PER_HEXAGON);

export function toIndex({ hexagon, wall, shelf, volume, page }: Location): bigint {
  const within = ((wall * SHELVES_PER_WALL + shelf) * VOLUMES_PER_SHELF + volume) * PAGES_PER_VOLUME + page;
  return hexagon * PER_HEX + BigInt(within);
}

export function fromIndex(index: bigint): Location {
  if (index < 0n || index >= PAGE_COUNT) throw new RangeError('outside the library');
  let r = Number(index % PER_HEX);
  const page = r % PAGES_PER_VOLUME; r = (r / PAGES_PER_VOLUME) | 0;
  const volume = r % VOLUMES_PER_SHELF; r = (r / VOLUMES_PER_SHELF) | 0;
  const shelf = r % SHELVES_PER_WALL;
  const wall = (r / SHELVES_PER_WALL) | 0;
  return { hexagon: index / PER_HEX, wall, shelf, volume, page };
}

export function exists(loc: Location): boolean {
  return (
    loc.hexagon >= 0n && loc.hexagon < HEXAGON_COUNT &&
    loc.wall >= 0 && loc.wall < WALLS && loc.shelf >= 0 && loc.shelf < SHELVES_PER_WALL &&
    loc.volume >= 0 && loc.volume < VOLUMES_PER_SHELF && loc.page >= 0 && loc.page < PAGES_PER_VOLUME &&
    toIndex(loc) < PAGE_COUNT
  );
}

/** The page written at an index. */
export function pageAt(index: bigint): Uint8Array {
  return scramble(bigIntToDigits(index));
}

/** Where a page is written. */
export function indexOf(page: Uint8Array): bigint {
  return digitsToBigInt(unscramble(page));
}

/** Step along the galleries; the library wraps around on itself. */
export function neighbour(hexagon: bigint, east: number, up: number): bigint {
  const step = BigInt(east) + BigInt(up) * GALLERY_WIDTH;
  return (((hexagon + step) % HEXAGON_COUNT) + HEXAGON_COUNT) % HEXAGON_COUNT;
}

/** Signed distance from one hexagon to another, as whole floors and remaining galleries. */
export function distance(from: bigint, to: bigint): { floors: bigint; galleries: bigint } {
  const d = to - from;
  const floors = d / GALLERY_WIDTH;
  return { floors, galleries: d - floors * GALLERY_WIDTH };
}
