import {
  CatmullRomCurve3, CylinderGeometry, Matrix4, Path, Quaternion, Shape, ShapeGeometry, TubeGeometry, Vector3,
} from 'three';
import { Builder, Surface, type Rgb } from './builder';
import {
  APOTHEM, BOOK_DEPTH, BOOKS_PER_SHELF, DOOR_HEIGHT, DOOR_WIDTH, FLOOR_HEIGHT, HALL_HALF_WIDTH, HALL_LENGTH,
  LAMP_HEIGHT, LAMP_Z, SHAFT_RADIUS, SHELF_BOTTOM, SHELF_GAP, SHELF_WIDTH, SHELVED_SIDES, SHELVES, SIDE, SLAB,
  STAIR_CENTRE, STAIR_RADIUS, STAIR_STEPS, WALL_TOP,
} from './dimensions';

const C = {
  floor: [0.62, 0.40, 0.27], plaster: [0.93, 0.80, 0.62], ceiling: [0.90, 0.76, 0.58],
  wood: [0.50, 0.29, 0.17], woodLight: [0.64, 0.40, 0.24], shelfBack: [0.30, 0.17, 0.11],
  brass: [0.86, 0.64, 0.33], hall: [0.89, 0.74, 0.56], glass: [0.80, 0.78, 0.72],
} satisfies Record<string, Rgb>;

const UP = new Vector3(0, 1, 0);
const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);
/** Vertex k of the hexagon (vertices sit at 30° + 60°k). */
const corner = (r: number, k: number, y: number) => {
  const a = Math.PI / 6 + (k * Math.PI) / 3;
  return v3(r * Math.cos(a), y, r * Math.sin(a));
};

/** Frame of hexagon side k: `out` points away from the room; (along, up, inward) is right-handed. */
export function sideFrame(k: number) {
  const a = (k * Math.PI) / 3;
  const out = v3(Math.cos(a), 0, Math.sin(a));
  return { out, inward: out.clone().negate(), along: v3(-Math.sin(a), 0, Math.cos(a)) };
}

/** A wall panel in the plane through `origin`, spanning `width` along `along`, with an arched opening. */
function archedWall(b: Builder, origin: Vector3, along: Vector3, facing: Vector3, width: number, height: number, door: { w: number; h: number } | null, col: Rgb) {
  const s = new Shape();
  s.moveTo(-width / 2, 0).lineTo(width / 2, 0).lineTo(width / 2, height).lineTo(-width / 2, height).closePath();
  if (door) {
    const r = door.w / 2;
    const hole = new Path();
    hole.moveTo(-r, 0).lineTo(r, 0).lineTo(r, door.h - r).absarc(0, door.h - r, r, 0, Math.PI, false).lineTo(-r, 0);
    s.holes.push(hole);
  }
  const m = new Matrix4().makeBasis(along, UP, facing).setPosition(origin);
  b.addGeometry(new ShapeGeometry(s, 24), m, col);
}

/** Trim around an arched opening, both faces. */
function archTrim(b: Builder, origin: Vector3, along: Vector3, facing: Vector3, w: number, h: number) {
  const r = w / 2 + 0.04;
  const pts: Vector3[] = [v3(-r, 0, 0), v3(-r, h - r, 0)];
  for (let i = 1; i < 12; i++) {
    const a = Math.PI - (i * Math.PI) / 12;
    pts.push(v3(r * Math.cos(a), h - r + r * Math.sin(a), 0));
  }
  pts.push(v3(r, h - r, 0), v3(r, 0, 0));
  const tube = new TubeGeometry(new CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 64, 0.07, 8, false);
  const m = new Matrix4().makeBasis(along, UP, facing).setPosition(origin);
  b.addGeometry(tube, m, C.woodLight);
}

export function buildRoom({ distant }: { distant: boolean }) {
  const b = new Builder();

  // floor ring around the shaft, with the slab's underside as the ceiling of the room below
  for (let k = 0; k < 6; k++) {
    const k0 = k - 1;
    b.quad(corner(SHAFT_RADIUS, k0, 0), corner(SHAFT_RADIUS, k, 0), corner(SIDE, k, 0), corner(SIDE, k0, 0), C.floor);
    b.quad(corner(SIDE, k0, -SLAB), corner(SIDE, k, -SLAB), corner(SHAFT_RADIUS, k, -SLAB), corner(SHAFT_RADIUS, k0, -SLAB), C.ceiling);
    b.quad(corner(SHAFT_RADIUS, k0, -SLAB), corner(SHAFT_RADIUS, k0, 0), corner(SHAFT_RADIUS, k, 0), corner(SHAFT_RADIUS, k, -SLAB), C.wood);
  }

  // brass railing: round posts and a round rail
  if (!distant) {
    const post = new CylinderGeometry(0.03, 0.03, 0.9, 8);
    for (let k = 0; k < 6; k++) {
      const a = corner(SHAFT_RADIUS + 0.1, k - 1, 0), c = corner(SHAFT_RADIUS + 0.1, k, 0);
      for (let t = 0; t < 1; t += 1 / 5) {
        const p = a.clone().lerp(c, t);
        b.addGeometry(post, new Matrix4().makeTranslation(p.x, 0.45, p.z), C.brass);
      }
    }
  }
  const railPts: Vector3[] = [];
  for (let k = 0; k <= 6; k++) railPts.push(corner(SHAFT_RADIUS + 0.1, k, 0.92));
  b.addGeometry(new TubeGeometry(new CatmullRomCurve3(railPts, false, 'catmullrom', 0.05), 72, 0.045, distant ? 4 : 8, false), new Matrix4(), C.brass);

  for (let k = 0; k < 6; k++) {
    const { out, inward, along } = sideFrame(k);
    const base = out.clone().multiplyScalar(APOTHEM);
    const doorway = k === 0 || k === 3;
    archedWall(b, base, along, inward, SIDE, WALL_TOP, doorway ? { w: DOOR_WIDTH, h: DOOR_HEIGHT } : null, C.plaster);
    if (doorway) {
      archTrim(b, base.clone().addScaledVector(inward, 0.02), along, inward, DOOR_WIDTH, DOOR_HEIGHT);
      archTrim(b, base.clone().addScaledVector(out, 0.02), along.clone().negate(), out, DOOR_WIDTH, DOOR_HEIGHT);
      // the room's back of this wall, seen from the hallway
      archedWall(b, base.clone().addScaledVector(out, 0.01), along.clone().negate(), out, SIDE, WALL_TOP, { w: DOOR_WIDTH, h: DOOR_HEIGHT }, C.hall);
    }
    // skirting and cornice
    b.box(base.clone().addScaledVector(inward, 0.03).setY(0.06), along, UP, inward, SIDE, 0.12, 0.06, C.wood, 0.01);
    b.box(base.clone().addScaledVector(inward, 0.04).setY(WALL_TOP - 0.06), along, UP, inward, SIDE, 0.12, 0.08, C.woodLight, 0.02);
    if (doorway) continue;

    const top = SHELF_BOTTOM + SHELVES * SHELF_GAP;
    const back = base.clone().addScaledVector(inward, 0.03);
    const sw = SHELF_WIDTH / 2;
    const bp = (u: number, y: number) => back.clone().addScaledVector(along, u).setY(y);
    b.quad(bp(-sw, SHELF_BOTTOM - 0.1), bp(sw, SHELF_BOTTOM - 0.1), bp(sw, top), bp(-sw, top), C.shelfBack);
    const centre = base.clone().addScaledVector(inward, BOOK_DEPTH / 2 + 0.04);
    for (let i = 0; i <= SHELVES; i++) {
      b.box(centre.clone().setY(SHELF_BOTTOM + i * SHELF_GAP - 0.035), along, UP, inward, SHELF_WIDTH + 0.16, 0.07, BOOK_DEPTH + 0.1, C.wood, 0.02);
    }
    for (const s of [-1, 1]) {
      b.box(centre.clone().addScaledVector(along, s * (sw + 0.06)).setY((SHELF_BOTTOM + top) / 2 - 0.05), along, UP, inward, 0.12, top - SHELF_BOTTOM + 0.12, BOOK_DEPTH + 0.12, C.wood, 0.025);
    }
    // a rounded crown over each case
    b.box(centre.clone().setY(top + 0.08), along, UP, inward, SHELF_WIDTH + 0.4, 0.1, BOOK_DEPTH + 0.2, C.woodLight, 0.04);

    if (distant) {
      // far rooms: one quad per shelf, spines painted by the shader
      const front = base.clone().addScaledVector(inward, BOOK_DEPTH * 0.75);
      const fp = (u: number, y: number) => front.clone().addScaledVector(along, u).setY(y);
      const wall = SHELVED_SIDES.indexOf(k as 1 | 2 | 4 | 5);
      for (let s = 0; s < SHELVES; s++) {
        const y0 = SHELF_BOTTOM + s * SHELF_GAP, y1 = y0 + SHELF_GAP - 0.07;
        const id = (wall * SHELVES + s) * BOOKS_PER_SHELF;
        b.quad(fp(-sw, y0), fp(sw, y0), fp(sw, y1), fp(-sw, y1), [1, 1, 1], [
          [id, 0, Surface.BookStrip], [id + BOOKS_PER_SHELF, 0, Surface.BookStrip],
          [id + BOOKS_PER_SHELF, 1, Surface.BookStrip], [id, 1, Surface.BookStrip],
        ]);
      }
    }
  }

  buildHallway(b, distant);

  // lamp rods
  if (!distant) {
    const rod = new CylinderGeometry(0.015, 0.015, WALL_TOP - LAMP_HEIGHT - 0.3, 6);
    for (const z of [LAMP_Z, -LAMP_Z]) b.addGeometry(rod, new Matrix4().makeTranslation(0, (WALL_TOP + LAMP_HEIGHT + 0.3) / 2, z), C.brass);
  }
  return b.build();
}

function buildHallway(b: Builder, distant: boolean) {
  const x0 = APOTHEM, x1 = APOTHEM + HALL_LENGTH, w = HALL_HALF_WIDTH;
  b.quad(v3(x0, 0, -w), v3(x0, 0, w), v3(x1, 0, w), v3(x1, 0, -w), C.floor);
  b.quad(v3(x0, WALL_TOP, w), v3(x0, WALL_TOP, -w), v3(x1, WALL_TOP, -w), v3(x1, WALL_TOP, w), C.ceiling);
  const mid = (x0 + x1) / 2;
  const alongX = v3(1, 0, 0);
  // mirror side (+z): plain wall with a framed glass
  archedWall(b, v3(mid, 0, w), alongX.clone().negate(), v3(0, 0, -1), HALL_LENGTH, WALL_TOP, null, C.hall);
  // stair side (-z): an arched opening into the stair well
  archedWall(b, v3(mid, 0, -w), alongX, v3(0, 0, 1), HALL_LENGTH, WALL_TOP, { w: 1.5, h: 2.7 }, C.hall);
  if (distant) return;

  archTrim(b, v3(mid, 0, -w + 0.02), alongX, v3(0, 0, 1), 1.5, 2.7);
  const frame = v3(mid, 1.55, w - 0.03);
  b.box(frame, alongX.clone().negate(), UP, v3(0, 0, -1), 1.0, 1.9, 0.05, C.woodLight, 0.02);
  const glass = new ShapeGeometry(new Shape().moveTo(-0.42, -0.85).lineTo(0.42, -0.85).lineTo(0.42, 0.85).lineTo(-0.42, 0.85).closePath());
  b.addGeometry(glass, new Matrix4().makeBasis(alongX.clone().negate(), UP, v3(0, 0, -1)).setPosition(frame.clone().setZ(w - 0.06)), C.glass, Surface.Mirror);

  // stair well: a cylinder open towards the hallway, a newel post, and one turn of wedge steps per floor
  const [cx, cz] = STAIR_CENTRE;
  const R = STAIR_RADIUS + 0.12;
  const open = Math.PI * 0.42;
  const segs = 28;
  for (let i = 0; i < segs; i++) {
    const a0 = Math.PI / 2 + open + (i / segs) * (2 * Math.PI - 2 * open);
    const a1 = Math.PI / 2 + open + ((i + 1) / segs) * (2 * Math.PI - 2 * open);
    const p = (a: number, y: number) => v3(cx + R * Math.cos(a), y, cz + R * Math.sin(a));
    b.quad(p(a1, -SLAB), p(a0, -SLAB), p(a0, WALL_TOP), p(a1, WALL_TOP), C.plaster);
  }
  b.addGeometry(new CylinderGeometry(0.1, 0.1, FLOOR_HEIGHT, 12), new Matrix4().makeTranslation(cx, FLOOR_HEIGHT / 2 - SLAB, cz), C.wood);
  const rise = FLOOR_HEIGHT / STAIR_STEPS;
  const q = new Quaternion();
  for (let i = 0; i < STAIR_STEPS; i++) {
    const a = (i / STAIR_STEPS) * Math.PI * 2;
    const r = STAIR_RADIUS / 2 + 0.05;
    q.setFromAxisAngle(UP, -a);
    const m = new Matrix4().compose(v3(cx + r * Math.cos(a), i * rise - SLAB + 0.05, cz + r * Math.sin(a)), q, v3(1, 1, 1));
    const ux = v3(1, 0, 0).applyQuaternion(q), uz = v3(0, 0, 1).applyQuaternion(q);
    b.box(new Vector3().setFromMatrixPosition(m), ux, UP, uz, STAIR_RADIUS - 0.05, 0.08, 0.42, C.woodLight, 0.02);
  }
}

/** Per-book transforms for one room: unit height, standing on its shelf. Colour and height come from the shader. */
export function bookSlots(): Matrix4[] {
  const out: Matrix4[] = [];
  const step = SHELF_WIDTH / BOOKS_PER_SHELF;
  for (const k of SHELVED_SIDES) {
    const { out: o, inward, along } = sideFrame(k);
    const base = o.clone().multiplyScalar(APOTHEM).addScaledVector(inward, BOOK_DEPTH / 2 + 0.05);
    const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(along, UP, inward));
    for (let s = 0; s < SHELVES; s++) {
      for (let v = 0; v < BOOKS_PER_SHELF; v++) {
        const p = base.clone().addScaledVector(along, -SHELF_WIDTH / 2 + step * (v + 0.5)).setY(SHELF_BOTTOM + s * SHELF_GAP);
        out.push(new Matrix4().compose(p, q, v3(step * 0.9, 1, BOOK_DEPTH)));
      }
    }
  }
  return out;
}
