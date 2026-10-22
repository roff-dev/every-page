// Metres. One room module repeats forever along x (galleries) and y (floors).
export const SIDE = 6; // hexagon side = circumradius
export const APOTHEM = SIDE * Math.cos(Math.PI / 6);
export const HALL_LENGTH = 2.2;
export const HALL_HALF_WIDTH = 1.45;
export const PITCH_X = 2 * APOTHEM + HALL_LENGTH;
export const FLOOR_HEIGHT = 4.4;
export const SLAB = 0.3;
export const WALL_TOP = FLOOR_HEIGHT - SLAB;
export const SHAFT_RADIUS = 2.3;
export const DOOR_WIDTH = 1.7;
export const DOOR_HEIGHT = 2.9;

export const SHELF_WIDTH = 5.0;
export const SHELF_BOTTOM = 0.35;
export const SHELF_GAP = 0.62;
export const BOOK_DEPTH = 0.24;
export const SHELVES = 5;
export const BOOKS_PER_SHELF = 32;
export const BOOKS_PER_ROOM = 4 * SHELVES * BOOKS_PER_SHELF;

/** Hexagon sides that carry shelves, in wall order 0–3. Sides 0 and 3 are the doorways. */
export const SHELVED_SIDES = [1, 2, 4, 5] as const;

export const LAMP_HEIGHT = FLOOR_HEIGHT - 1.35;
export const LAMP_Z = 3.5;

export const STAIR_CENTRE: readonly [number, number] = [APOTHEM + HALL_LENGTH / 2, -(HALL_HALF_WIDTH + 1.05)];
export const STAIR_RADIUS = 1.05;
export const STAIR_STEPS = 16;
