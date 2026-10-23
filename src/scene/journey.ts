import { CatmullRomCurve3, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { APOTHEM, FLOOR_HEIGHT, HALL_LENGTH, PITCH_X } from './dimensions';
import { sideFrame } from './room';

export interface Limits {
  vMax: number; // m/s
  aLat: number; // m/s², sideways acceleration allowed in turns
  aLong: number; // m/s², speeding up and slowing down
  vEnd: number; // m/s at both ends
}

export interface Plan {
  curve: CatmullRomCurve3;
  length: number;
  duration: number;
  /** Where along the curve (0–1) the camera is at a time, and how fast it's going. */
  at(time: number): { u: number; speed: number };
}

const SAMPLES = 600;

/**
 * Times a camera along a curve so it never exceeds a top speed, never corners harder than
 * the lateral limit allows (v ≤ √(a/κ)), and never speeds up or brakes harder than the
 * longitudinal limit: a forward pass caps acceleration, a backward pass caps braking.
 */
export function planPath(points: Vector3[], { vMax, aLat, aLong, vEnd }: Limits): Plan {
  const curve = new CatmullRomCurve3(points, false, 'centripetal');
  const length = curve.getLength();
  const ds = length / SAMPLES;
  const pts = Array.from({ length: SAMPLES + 1 }, (_, i) => curve.getPointAt(i / SAMPLES));
  const v = new Float64Array(SAMPLES + 1);
  const a = new Vector3();
  const b = new Vector3();
  for (let i = 0; i <= SAMPLES; i++) {
    a.subVectors(pts[i]!, pts[Math.max(0, i - 1)]!);
    b.subVectors(pts[Math.min(SAMPLES, i + 1)]!, pts[i]!);
    const turn = a.lengthSq() > 0 && b.lengthSq() > 0 ? a.angleTo(b) : 0;
    const curvature = turn / Math.max(ds, 1e-6);
    v[i] = curvature > 1e-6 ? Math.min(vMax, Math.sqrt(aLat / curvature)) : vMax;
  }
  v[0] = Math.min(v[0]!, vEnd);
  v[SAMPLES] = Math.min(v[SAMPLES]!, vEnd);
  for (let i = 1; i <= SAMPLES; i++) v[i] = Math.min(v[i]!, Math.sqrt(v[i - 1]! ** 2 + 2 * aLong * ds));
  for (let i = SAMPLES - 1; i >= 0; i--) v[i] = Math.min(v[i]!, Math.sqrt(v[i + 1]! ** 2 + 2 * aLong * ds));
  const t = new Float64Array(SAMPLES + 1);
  for (let i = 1; i <= SAMPLES; i++) t[i] = t[i - 1]! + (2 * ds) / (v[i]! + v[i - 1]!);
  const duration = t[SAMPLES]!;

  return {
    curve,
    length,
    duration,
    at(time) {
      if (time <= 0) return { u: 0, speed: v[0]! };
      if (time >= duration) return { u: 1, speed: v[SAMPLES]! };
      let lo = 0;
      let hi = SAMPLES;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (t[mid]! <= time) lo = mid;
        else hi = mid;
      }
      const f = (time - t[lo]!) / (t[hi]! - t[lo]!);
      return { u: (lo + f) / SAMPLES, speed: v[lo]! + (v[hi]! - v[lo]!) * f };
    },
  };
}

/**
 * Plans a path that lasts about `seconds`, by finding the top speed that gives that duration.
 * Cornering and braking limits stay fixed, so comfort never trades off against timing.
 */
export function planPathLasting(points: Vector3[], limits: Limits, seconds: number, vRange: [number, number] = [8, 90]): Plan {
  let [lo, hi] = vRange;
  let plan = planPath(points, { ...limits, vMax: hi });
  if (plan.duration > seconds) return plan; // as fast as allowed
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    plan = planPath(points, { ...limits, vMax: mid });
    if (plan.duration > seconds) lo = mid;
    else hi = mid;
  }
  return planPath(points, { ...limits, vMax: hi });
}

/** A camera that never rolls: horizontal heading and clamped pitch, both eased. */
export class ComfortLook {
  private yaw = 0;
  private pitch = 0;
  private started = false;

  constructor(private readonly minPitch = -0.85, private readonly maxPitch = 0.75) {}

  /** Start from wherever the camera is already looking. */
  from(camera: PerspectiveCamera) {
    const d = camera.getWorldDirection(new Vector3());
    this.yaw = Math.atan2(d.x, -d.z);
    this.pitch = Math.asin(MathUtils.clamp(d.y, -1, 1));
    this.started = true;
  }

  update(direction: Vector3, dt: number, rate = 3.2) {
    const h = Math.hypot(direction.x, direction.z);
    const wantPitch = MathUtils.clamp(Math.atan2(direction.y, h), this.minPitch, this.maxPitch);
    const wantYaw = h > 0.15 ? Math.atan2(direction.x, -direction.z) : this.yaw;
    if (!this.started) {
      this.yaw = wantYaw;
      this.pitch = wantPitch;
      this.started = true;
    }
    const k = 1 - Math.exp(-rate * dt);
    const dyaw = Math.atan2(Math.sin(wantYaw - this.yaw), Math.cos(wantYaw - this.yaw));
    this.yaw += dyaw * k;
    this.pitch += (wantPitch - this.pitch) * k;
  }

  apply(camera: PerspectiveCamera) {
    camera.rotation.set(this.pitch, -this.yaw, 0, 'YXZ');
  }
}

export const TRAVEL: Limits = { vMax: 60, aLat: 16, aLong: 14, vEnd: 0.6 };
export const WALK: Limits = { vMax: 2.4, aLat: 1.8, aLong: 1.4, vEnd: 0.05 };
/** The guided walk after a flight: brisker than wandering, so it doesn't crawl after the speed of the flight. */
export const GUIDE: Limits = { vMax: 4.2, aLat: 3.6, aLong: 3.0, vEnd: 0.05 };
const EYE = 1.6;
const RING = 3.9; // walking radius around the shaft

export interface Route {
  travel: Vector3[];
  walk: Vector3[];
  /** Room the walk ends in, in whole rooms from the world origin. */
  room: { x: number; y: number };
}

/**
 * The cinematic route to a book. The real distance is astronomical, so the camera covers a
 * few galleries and floors in the right directions: along the gallery, into a shaft, down or
 * up some floors, out at the railing of the hexagon before the target, then on foot.
 */
export function buildRoute(from: Vector3, centre: { x: number; y: number }, east: number, rooms: number, floors: number, side: number, bookPoint: Vector3): Route {
  const s = Math.sign(east) || 1;
  const drop = { x: centre.x + s * (rooms - 1), y: centre.y + floors };
  const room = { x: drop.x + s, y: drop.y };
  const x0 = centre.x * PITCH_X;
  const y0 = centre.y * FLOOR_HEIGHT;
  const dropX = drop.x * PITCH_X;
  const yDrop = drop.y * FLOOR_HEIGHT;
  const travel = [
    from.clone(),
    new Vector3(x0 + s * 1.2, y0 + 1.9, from.z * 0.4),
    new Vector3(x0 + s * (APOTHEM + HALL_LENGTH / 2), y0 + 1.75, 0),
    new Vector3(dropX - s * (PITCH_X * 0.6), y0 + 1.75, 0),
    new Vector3(dropX - s * 0.6, y0 + 1.3, 0),
    new Vector3(dropX, y0 + (floors > 0 ? 2.4 : 0.4), 0),
    new Vector3(dropX, yDrop + (floors > 0 ? 0.9 : 2.6), 0),
    new Vector3(dropX + s * 1.6, yDrop + EYE, 0),
    new Vector3(dropX + s * 3.2, yDrop + EYE, 0),
  ];

  // on foot: through the doorway and hallway, then around the floor ring to the shelf
  const roomX = room.x * PITCH_X;
  const doorAngle = s > 0 ? Math.PI : 0;
  const { out } = sideFrame(side);
  const wallAngle = Math.atan2(out.z, out.x);
  const walk = [
    new Vector3(dropX + s * 3.2, yDrop + EYE, 0),
    new Vector3(dropX + s * (APOTHEM + HALL_LENGTH / 2), yDrop + EYE, 0),
    new Vector3(roomX - s * (APOTHEM - 0.9), yDrop + EYE, 0),
  ];
  let delta = Math.atan2(Math.sin(wallAngle - doorAngle), Math.cos(wallAngle - doorAngle));
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 6)));
  for (let i = 1; i < steps; i++) {
    const a = doorAngle + (delta * i) / steps;
    walk.push(new Vector3(roomX + RING * Math.cos(a), yDrop + EYE, RING * Math.sin(a)));
  }
  walk.push(standPoint(bookPoint, side, yDrop));
  return { travel, walk, room };
}

/** Where to stand to read a book: square to its shelf, a step back, at eye height. */
export function standPoint(bookPoint: Vector3, side: number, floorY: number): Vector3 {
  const { inward } = sideFrame(side);
  return bookPoint.clone().addScaledVector(inward, 1.7).setY(floorY + 1.55);
}
