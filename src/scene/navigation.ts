import { Vector3 } from 'three';
import {
  APOTHEM, DOOR_WIDTH, FLOOR_HEIGHT, HALL_HALF_WIDTH, HALL_LENGTH, PITCH_X, SHAFT_RADIUS, STAIR_CENTRE,
} from './dimensions';

const SHELF_CLEARANCE = 0.75;
const RAIL_CLEARANCE = 0.45;
const WALL_CLEARANCE = 0.3;
export const EYE_HEIGHT = 1.6;
export const RING_RADIUS = 3.9;

/** Room-local coordinates: x from −pitch/2 to pitch/2 around the room's centre. */
export function local(x: number) {
  const room = Math.round(x / PITCH_X);
  return { room, lx: x - room * PITCH_X };
}

/** Whether a visitor can stand at this point of a floor. */
export function walkable(x: number, z: number): boolean {
  const { lx } = local(x);
  const ax = Math.abs(lx);
  // hallways between rooms, and the doorways into them
  if (ax >= APOTHEM) return Math.abs(z) < HALL_HALF_WIDTH - WALL_CLEARANCE;
  if (ax > APOTHEM - SHELF_CLEARANCE - 0.1 && Math.abs(z) < DOOR_WIDTH / 2 - 0.25) return true;
  // the floor ring: inside the shelves, outside the shaft's railing
  if (Math.hypot(lx, z) < SHAFT_RADIUS + RAIL_CLEARANCE) return false;
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    if (lx * Math.cos(a) + z * Math.sin(a) > APOTHEM - SHELF_CLEARANCE) return false;
  }
  return true;
}

/** Move from a point by a step, sliding along whatever stops it. */
export function slide(from: Vector3, dx: number, dz: number): Vector3 {
  const to = from.clone();
  if (walkable(from.x + dx, from.z + dz)) to.set(from.x + dx, from.y, from.z + dz);
  else if (walkable(from.x + dx, from.z)) to.x += dx;
  else if (walkable(from.x, from.z + dz)) to.z += dz;
  return to;
}

/** A path from one floor point to another in the same room, going round the shaft rather than over it. */
export function aroundShaft(from: Vector3, to: Vector3): Vector3[] {
  const { room } = local(from.x);
  const cx = room * PITCH_X;
  const a0 = Math.atan2(from.z, from.x - cx);
  const a1 = Math.atan2(to.z, to.x - cx);
  const delta = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
  const points = [from.clone()];
  const steps = Math.floor(Math.abs(delta) / (Math.PI / 5));
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (delta * i) / (steps + 1);
    points.push(new Vector3(cx + RING_RADIUS * Math.cos(a), from.y, RING_RADIUS * Math.sin(a)));
  }
  points.push(to.clone());
  return points;
}

/** Through the doorway on one side, along the hallway, into the next room. */
export function toNextGallery(from: Vector3, east: number): Vector3[] {
  const { room } = local(from.x);
  const s = Math.sign(east) || 1;
  const cx = room * PITCH_X;
  const doorIn = new Vector3(cx + s * (APOTHEM - 0.9), from.y, 0);
  const path = aroundShaft(from, doorIn);
  const nextCx = (room + s) * PITCH_X;
  path.push(
    new Vector3(cx + s * (APOTHEM + HALL_LENGTH / 2), from.y, 0),
    new Vector3(nextCx - s * (APOTHEM - 0.9), from.y, 0),
    new Vector3(nextCx - s * RING_RADIUS, from.y, 0),
  );
  return dedupe(path);
}

/**
 * Into the nearer of the two stair wells (every hallway has one) and round one full turn,
 * up or down a floor.
 */
export function stairs(from: Vector3, up: number): Vector3[] {
  const { room, lx } = local(from.x);
  const side = lx >= 0 ? 1 : -1;
  const cx = room * PITCH_X;
  const sx = side * STAIR_CENTRE[0];
  const sz = STAIR_CENTRE[1];
  const hallway = new Vector3(cx + sx, from.y, 0);
  const path = [...aroundShaft(from, new Vector3(cx + side * (APOTHEM - 0.9), from.y, 0)), hallway];
  const dir = Math.sign(up) || 1;
  const r = 0.75;
  const floorY = Math.floor((from.y + 0.15) / FLOOR_HEIGHT) * FLOOR_HEIGHT;
  const turns = 14;
  for (let i = 0; i <= turns; i++) {
    const a = Math.PI / 2 + (dir * i * 2 * Math.PI) / turns;
    const y = floorY + EYE_HEIGHT + (dir * i * FLOOR_HEIGHT) / turns;
    path.push(new Vector3(cx + sx + r * Math.cos(a), y, sz + r * Math.sin(a)));
  }
  path.push(new Vector3(cx + sx, floorY + dir * FLOOR_HEIGHT + EYE_HEIGHT, 0));
  return dedupe(path);
}

function dedupe(points: Vector3[]) {
  return points.filter((p, i) => i === 0 || p.distanceToSquared(points[i - 1]!) > 0.01);
}
