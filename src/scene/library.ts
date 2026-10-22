import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Points, SphereGeometry, Vector2 } from 'three';
import { bookSlots, buildRoom } from './room';
import { glowMaterial, lampMaterial, libraryMaterial } from './materials';
import { BOOKS_PER_ROOM, FLOOR_HEIGHT, LAMP_HEIGHT, LAMP_Z, PITCH_X } from './dimensions';
import type { Tier } from './quality';

const slots = bookSlots();

function bookGeometry() {
  const g = new BoxGeometry(1, 1, 1);
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new Float32BufferAttribute(new Array(n * 3).fill(1), 3));
  g.setAttribute('detail', new Float32BufferAttribute(new Array(n * 3).fill(0), 3));
  return g;
}

/**
 * A block of rooms around the camera. Rooms are laid out once around the origin; as the camera
 * crosses into another room the whole block moves by a whole room, and the shaders re-dress
 * every book from world room coordinates, so streaming costs nothing per frame.
 */
export class Library {
  readonly group = new Group();
  readonly shellMaterial = libraryMaterial();
  readonly bookMaterial = libraryMaterial({ books: true });
  private centre = new Vector2(Number.NaN, Number.NaN);
  private parts: { dispose(): void }[] = [];
  /** Instance index of the first book in the centre room. */
  centreBookBase = 0;

  constructor(private tier: Tier) {
    this.build();
  }

  setTier(tier: Tier) {
    this.tier = tier;
    for (const p of this.parts) p.dispose();
    this.group.clear();
    this.parts = [];
    this.build();
    this.centre.set(Number.NaN, Number.NaN);
  }

  private build() {
    const { roomsX: nx, roomsY: ny, bookRoomsY: by, glow } = this.tier;
    const near: Matrix4[] = [], far: Matrix4[] = [], lamps: Matrix4[] = [], glowPositions: number[] = [];
    const bookRooms: Matrix4[] = [];
    for (let dy = -ny; dy <= ny; dy++) {
      for (let dx = -nx; dx <= nx; dx++) {
        const m = new Matrix4().makeTranslation(dx * PITCH_X, dy * FLOOR_HEIGHT, 0);
        const close = Math.abs(dx) <= 1 && Math.abs(dy) <= Math.max(by, 0);
        (close ? near : far).push(m);
        if (close) {
          if (dx === 0 && dy === 0) this.centreBookBase = bookRooms.length * BOOKS_PER_ROOM;
          bookRooms.push(m);
        }
        for (const z of [LAMP_Z, -LAMP_Z]) {
          lamps.push(new Matrix4().makeTranslation(dx * PITCH_X, dy * FLOOR_HEIGHT + LAMP_HEIGHT, z));
          glowPositions.push(dx * PITCH_X, dy * FLOOR_HEIGHT + LAMP_HEIGHT, z);
        }
      }
    }
    const instanced = (geometry: BufferGeometry, material: InstancedMesh['material'], matrices: Matrix4[]) => {
      const mesh = new InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.parts.push(geometry);
      return mesh;
    };
    instanced(buildRoom({ distant: false }), this.shellMaterial, near);
    if (far.length) instanced(buildRoom({ distant: true }), this.shellMaterial, far);
    const books: Matrix4[] = [];
    for (const room of bookRooms) for (const s of slots) books.push(room.clone().multiply(s));
    this.books = instanced(bookGeometry(), this.bookMaterial, books);
    instanced(new SphereGeometry(0.3, 32, 20), lampMaterial(), lamps);
    if (glow) {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(glowPositions, 3));
      const points = new Points(g, glowMaterial());
      points.frustumCulled = false;
      this.group.add(points);
      this.parts.push(g);
    }
  }

  books!: InstancedMesh;

  /** Keep the block centred on the camera. Returns true when it moved. */
  follow(x: number, y: number): boolean {
    const cx = Math.round(x / PITCH_X);
    const cy = Math.floor((y + 0.15) / FLOOR_HEIGHT);
    if (cx === this.centre.x && cy === this.centre.y) return false;
    this.centre.set(cx, cy);
    this.group.position.set(cx * PITCH_X, cy * FLOOR_HEIGHT, 0);
    return true;
  }

  /** Whole rooms between world coordinates and the library's own, so a floating-origin shift keeps every book the same. */
  setRoomOffset(x: number, y: number) {
    this.shellMaterial.uniforms.uRoomOffset!.value.set(x, y);
    this.bookMaterial.uniforms.uRoomOffset!.value.set(x, y);
  }
}
