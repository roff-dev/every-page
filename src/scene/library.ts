import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Points, SphereGeometry, Vector2 } from 'three';
import { bookSlots, buildRoom } from './room';
import { glowMaterial, lampMaterial, libraryMaterial } from './materials';
import { BOOKS_PER_ROOM, FLOOR_HEIGHT, LAMP_HEIGHT, LAMP_Z, PITCH_X } from './dimensions';
import type { Tier } from './quality';

/** Give the browser a turn, so building the scene never blocks input for long. */
export const yieldToMain = () =>
  new Promise<void>((resolve) => {
    const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (s?.yield) s.yield().then(resolve);
    else setTimeout(resolve, 0);
  });

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
  books!: InstancedMesh;
  /** Instance index of the first book in the centre room. */
  centreBookBase = 0;
  private centre = new Vector2(Number.NaN, Number.NaN);
  private parts: { dispose(): void }[] = [];
  private bookRoomOffsets: [number, number][] = [];
  /** Whole rooms between world coordinates and the library's own (see setRoomOffset) */
  readonly roomOffset = new Vector2();

  private constructor(private tier: Tier) {}

  static async create(tier: Tier): Promise<Library> {
    const library = new Library(tier);
    await library.build();
    return library;
  }

  async setTier(tier: Tier) {
    this.tier = tier;
    const old = this.group.children.slice();
    const oldParts = this.parts;
    this.parts = [];
    await this.build(old);
    for (const p of oldParts) p.dispose();
    this.centre.set(Number.NaN, Number.NaN);
  }

  /** Builds the new block, then swaps it in for `replacing` in one go. */
  private async build(replacing: readonly Group['children'][number][] = []) {
    const { roomsX: nx, roomsY: ny, bookRoomsY: by, glow } = this.tier;
    const near: Matrix4[] = [], far: Matrix4[] = [], lamps: Matrix4[] = [], glowPositions: number[] = [];
    const bookRooms: Matrix4[] = [];
    const offsets: [number, number][] = [];
    for (let dy = -ny; dy <= ny; dy++) {
      for (let dx = -nx; dx <= nx; dx++) {
        const m = new Matrix4().makeTranslation(dx * PITCH_X, dy * FLOOR_HEIGHT, 0);
        const close = Math.abs(dx) <= 1 && Math.abs(dy) <= by;
        (close ? near : far).push(m);
        if (close) {
          if (dx === 0 && dy === 0) this.centreBookBase = bookRooms.length * BOOKS_PER_ROOM;
          bookRooms.push(m);
          offsets.push([dx, dy]);
        }
        for (const z of [LAMP_Z, -LAMP_Z]) {
          lamps.push(new Matrix4().makeTranslation(dx * PITCH_X, dy * FLOOR_HEIGHT + LAMP_HEIGHT, z));
          glowPositions.push(dx * PITCH_X, dy * FLOOR_HEIGHT + LAMP_HEIGHT, z);
        }
      }
    }
    const added: Group['children'][number][] = [];
    const instanced = (geometry: BufferGeometry, material: InstancedMesh['material'], matrices: Matrix4[]) => {
      const mesh = new InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.frustumCulled = false;
      added.push(mesh);
      this.parts.push(geometry);
      return mesh;
    };

    instanced(buildRoom({ distant: false }), this.shellMaterial, near);
    await yieldToMain();
    if (far.length) instanced(buildRoom({ distant: true }), this.shellMaterial, far);
    await yieldToMain();
    const slots = bookSlots();
    const books: Matrix4[] = [];
    for (const room of bookRooms) for (const s of slots) books.push(room.clone().multiply(s));
    this.books = instanced(bookGeometry(), this.bookMaterial, books);
    instanced(new SphereGeometry(0.3, 32, 20), lampMaterial(), lamps);
    if (glow) {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(glowPositions, 3));
      const points = new Points(g, glowMaterial());
      points.frustumCulled = false;
      added.push(points);
      this.parts.push(g);
    }
    this.bookRoomOffsets = offsets;
    this.group.remove(...replacing);
    this.group.add(...added);
  }

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
  /** Which room (in the library's own whole-room coordinates) and slot a book instance is. */
  bookAt(instance: number): { room: { x: number; y: number }; slot: number } {
    const [dx, dy] = this.bookRoomOffsets[Math.floor(instance / BOOKS_PER_ROOM)]!;
    return {
      room: { x: this.centre.x + dx + this.roomOffset.x, y: this.centre.y + dy + this.roomOffset.y },
      slot: instance % BOOKS_PER_ROOM,
    };
  }

  /** The room the camera is in, in the library's own whole-room coordinates. */
  get room() {
    return { x: this.centre.x + this.roomOffset.x, y: this.centre.y + this.roomOffset.y };
  }

  setRoomOffset(x: number, y: number) {
    this.roomOffset.set(x, y);
    this.shellMaterial.uniforms.uRoomOffset!.value.set(x, y);
    this.bookMaterial.uniforms.uRoomOffset!.value.set(x, y);
  }
}
