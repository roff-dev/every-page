import { MathUtils, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { ComfortLook, planPath, WALK, type Plan } from './journey';
import { EYE_HEIGHT, aroundShaft, slide, stairs, toNextGallery, walkable } from './navigation';
import { FLOOR_HEIGHT, PITCH_X } from './dimensions';
import type { Library } from './library';

export interface BookPick {
  /** Instance index in the library's book mesh */
  instance: number;
}

export interface WanderEvents {
  book?(pick: BookPick): void;
  hover?(pick: BookPick | null, x: number, y: number): void;
  /** The visitor has stepped into another room or floor */
  moved?(): void;
}

const WALK_SPEED = 1.6;
const LOOK_PER_PIXEL = { mouse: 0.0032, touch: 0.0052 };
const PITCH_LIMIT = MathUtils.degToRad(60);
const TAP_PIXELS = 8;
const TAP_MS = 350;
const STAIR: typeof WALK = { vMax: 3.0, aLat: 4.5, aLong: 2.2, vEnd: 0.05 };

/** First-person wandering: drag to look, tap or click to go somewhere, keys to walk. */
export class Wanderer {
  active = false;
  private yaw = 0;
  private pitch = 0;
  private spin = new Vector2();
  private keys = new Set<string>();
  private glide: { plan: Plan; t: number; look: ComfortLook } | null = null;
  private pointer: { id: number; x: number; y: number; at: number; dragged: boolean; type: string } | null = null;
  private ray = new Raycaster();
  private lastRoom = '';
  private hoverAt = 0;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly library: Library,
    private readonly events: WanderEvents,
  ) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', () => (this.pointer = null));
    addEventListener('keydown', this.keyDown);
    addEventListener('keyup', (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  start() {
    const d = this.camera.getWorldDirection(new Vector3());
    this.yaw = Math.atan2(d.x, -d.z);
    this.pitch = MathUtils.clamp(Math.asin(d.y), -PITCH_LIMIT, PITCH_LIMIT);
    // settle onto the nearest standing point at eye height
    const floorY = Math.floor((this.camera.position.y + 0.15) / FLOOR_HEIGHT) * FLOOR_HEIGHT;
    const p = this.camera.position;
    if (!walkable(p.x, p.z)) p.set(Math.round(p.x / PITCH_X) * PITCH_X + 3.9, p.y, 0);
    p.y = floorY + EYE_HEIGHT;
    this.active = true;
    this.lastRoom = this.roomKey();
  }

  stop() {
    this.active = false;
    this.glide = null;
    this.keys.clear();
  }

  east(dir: number) {
    this.glideAlong(toNextGallery(this.camera.position, dir), WALK);
  }

  floor(dir: number) {
    this.glideAlong(stairs(this.camera.position, dir), STAIR);
  }

  update(dt: number) {
    if (!this.active) return;
    if (this.glide) {
      const g = this.glide;
      g.t += dt;
      const { u } = g.plan.at(g.t);
      this.camera.position.copy(g.plan.curve.getPointAt(u));
      g.look.update(g.plan.curve.getTangentAt(u), dt, 2.6);
      g.look.apply(this.camera);
      if (u >= 1) {
        const d = this.camera.getWorldDirection(new Vector3());
        this.yaw = Math.atan2(d.x, -d.z);
        this.pitch = Math.asin(MathUtils.clamp(d.y, -1, 1));
        this.glide = null;
      }
    } else {
      // look inertia, damped with a quarter-second time constant
      this.yaw += this.spin.x * dt;
      this.pitch = MathUtils.clamp(this.pitch + this.spin.y * dt, -PITCH_LIMIT, PITCH_LIMIT);
      this.spin.multiplyScalar(Math.exp(-dt / 0.25));
      const k = this.keys;
      const forward = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
      const strafe = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
      const turn = (k.has('arrowright') ? 1 : 0) - (k.has('arrowleft') ? 1 : 0);
      this.yaw += turn * 1.6 * dt;
      if (forward || strafe) {
        const step = WALK_SPEED * dt;
        const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        const to = slide(this.camera.position, (fx * forward - fz * strafe) * step, (fz * forward + fx * strafe) * step);
        this.camera.position.copy(to);
      }
      this.camera.rotation.set(this.pitch, -this.yaw, 0, 'YXZ');
    }
    const room = this.roomKey();
    if (room !== this.lastRoom) {
      this.lastRoom = room;
      this.events.moved?.();
    }
  }

  private roomKey() {
    return `${Math.round(this.camera.position.x / PITCH_X)},${Math.floor((this.camera.position.y + 0.15) / FLOOR_HEIGHT)}`;
  }

  private glideAlong(points: Vector3[], limits: typeof WALK) {
    if (!this.active || points.length < 2) return;
    const look = new ComfortLook(-1.0, 1.0);
    look.from(this.camera);
    this.glide = { plan: planPath(points, limits), t: 0, look };
  }

  private down = (e: PointerEvent) => {
    if (!this.active) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), dragged: false, type: e.pointerType };
    this.spin.set(0, 0);
  };

  private move = (e: PointerEvent) => {
    if (!this.active) return;
    const p = this.pointer;
    if (p && p.id === e.pointerId) {
      if (!p.dragged && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_PIXELS) p.dragged = true;
      if (p.dragged && !this.glide) {
        const k = e.pointerType === 'mouse' ? LOOK_PER_PIXEL.mouse : LOOK_PER_PIXEL.touch;
        // drag the world: moving right turns the view left
        const dyaw = -e.movementX * k;
        const dpitch = e.movementY * k;
        this.yaw += dyaw;
        this.pitch = MathUtils.clamp(this.pitch + dpitch, -PITCH_LIMIT, PITCH_LIMIT);
        this.spin.set(dyaw * 60, dpitch * 60);
      }
      return;
    }
    if (e.pointerType === 'mouse' && this.events.hover) {
      const now = performance.now();
      if (now - this.hoverAt < 90) return;
      this.hoverAt = now;
      this.events.hover(this.pickBook(e), e.clientX, e.clientY);
    }
  };

  private up = (e: PointerEvent) => {
    const p = this.pointer;
    this.pointer = null;
    if (!this.active || !p || p.id !== e.pointerId) return;
    if (p.dragged || performance.now() - p.at > TAP_MS) return;
    const book = this.pickBook(e);
    if (book) {
      this.events.book?.(book);
      return;
    }
    // tapping the floor walks there, round the shaft if needed
    const floorY = Math.floor((this.camera.position.y + 0.15) / FLOOR_HEIGHT) * FLOOR_HEIGHT;
    this.aim(e);
    const hit = this.ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -floorY), new Vector3());
    if (hit && hit.distanceTo(this.camera.position) < 14 && walkable(hit.x, hit.z)) {
      hit.y = floorY + EYE_HEIGHT;
      this.glideAlong(aroundShaft(this.camera.position, hit), WALK);
    }
  };

  private keyDown = (e: KeyboardEvent) => {
    if (!this.active || (e.target as HTMLElement).closest?.('input, textarea, [role="dialog"]')) return;
    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      this.keys.add(key);
      this.glide = null;
      e.preventDefault();
    }
  };

  private aim(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
  }

  private pickBook(e: PointerEvent): BookPick | null {
    this.aim(e);
    this.ray.far = 6;
    const hit = this.ray.intersectObject(this.library.books, false)[0];
    this.ray.far = Infinity;
    return hit?.instanceId === undefined ? null : { instance: hit.instanceId };
  }
}
