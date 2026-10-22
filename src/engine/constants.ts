export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz ,.';
export const RADIX = 29;
export const LINES = 40;
export const COLUMNS = 80;
export const PAGE_LENGTH = LINES * COLUMNS;
export const HALF = PAGE_LENGTH / 2;

export const PAGES_PER_VOLUME = 410;
export const VOLUMES_PER_SHELF = 32;
export const SHELVES_PER_WALL = 5;
export const WALLS = 4;
export const VOLUMES_PER_HEXAGON = VOLUMES_PER_SHELF * SHELVES_PER_WALL * WALLS;
export const PAGES_PER_HEXAGON = VOLUMES_PER_HEXAGON * PAGES_PER_VOLUME;

export const PAGE_COUNT = BigInt(RADIX) ** BigInt(PAGE_LENGTH);
export const HEXAGON_COUNT = (PAGE_COUNT + BigInt(PAGES_PER_HEXAGON) - 1n) / BigInt(PAGES_PER_HEXAGON);
/** Hexagons per floor: moving up or down a floor is a step of this many hexagons. */
export const GALLERY_WIDTH = 1n << 7764n;
