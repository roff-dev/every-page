import { Matrix4, PerspectiveCamera, Scene, Vector3 } from 'three';
import { ComfortLook, buildRoute, planPath, planPathLasting, standPoint, TRAVEL, WALK, type Plan, type Route } from './journey';
import { Halo, Trail, clearLamps, lightLamps, routeLamps } from './guide';
import { ReadingBook } from './book';
import { spineColour } from './colour';
import { bookSlots, sideFrame } from './room';
import { FLOOR_HEIGHT, PITCH_X, SHELVED_SIDES } from './dimensions';
import type { Library } from './library';

export interface JourneyTarget {
  /** +1 east, -1 west */
  east: number;
  /** Galleries to cross (cinematic, not the real distance) */
  rooms: number;
  /** Floors to climb (positive) or descend (negative) */
  floors: number;
  wall: number;
  shelf: number;
  volume: number;
  colour: readonly [number, number, number];
}

export type Phase = 'travel' | 'arrive' | 'guide' | 'stand' | 'pull' | 'open' | 'read';

export interface JourneyEvents {
  phase?(phase: Phase): void;
  /** 0–1 through the travel */
  progress?(p: number): void;
  /** Reduced motion: cover or uncover the view (0–1) */
  veil?(opacity: number): void;
  /** 0–1 through the page riffle, to tick the page counter */
  riffle?(p: number): void;
}

const slots = bookSlots();
const TARGET_HEIGHT = 0.47;
const TRAVEL_SECONDS = 8;

type Step =
  | { kind: 'travel'; plan: Plan; t: number }
  | { kind: 'arrive'; t: number }
  | { kind: 'guide'; plan: Plan; t: number }
  | { kind: 'veil'; t: number; to: 'out' | 'in' }
  | { kind: 'stand' }
  | { kind: 'pull'; t: number }
  | { kind: 'open'; t: number }
  | { kind: 'read' };

/** Moves the camera through a search: the flight, the arrival and the guided walk to the shelf. */
export class Director {
  private step: Step | null = null;
  private route: Route | null = null;
  private trail: Trail | null = null;
  private halo: Halo | null = null;
  private lamps: Vector3[] = [];
  private look = new ComfortLook();
  private book = new Vector3();
  private stand = new Vector3();
  private events: JourneyEvents = {};
  private reduced = false;
  private resolve: (() => void) | null = null;
  private guideTime = 0;
  private reading: ReadingBook | null = null;
  private slotWorld = new Matrix4();
  private inward = new Vector3();
  private revealed: (() => void) | null = null;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly scene: Scene,
    private readonly library: Library,
    /** Compiles any new materials off the critical path, so the walk never stalls on a shader. */
    private readonly prepare: () => void,
  ) {}

  get active() {
    return this.step !== null && this.step.kind !== 'stand' && this.step.kind !== 'read';
  }

  get standing() {
    return this.step?.kind === 'stand' || this.step?.kind === 'read';
  }

  /** World position of the target book's spine centre, once a journey has begun. */
  get bookPoint() {
    return this.book;
  }

  start(target: JourneyTarget, events: JourneyEvents, reduced: boolean): Promise<void> {
    this.clear();
    this.events = events;
    this.reduced = reduced;
    const centre = {
      x: Math.round(this.camera.position.x / PITCH_X),
      y: Math.floor((this.camera.position.y + 0.15) / FLOOR_HEIGHT),
    };
    const side = SHELVED_SIDES[target.wall]!;
    const slot = target.wall * 160 + target.shelf * 32 + target.volume;
    // the room is only known after the route; build once to find it, then place the book
    const room = { x: centre.x + Math.sign(target.east || 1) * target.rooms, y: centre.y + target.floors };
    this.slotWorld.makeTranslation(room.x * PITCH_X, room.y * FLOOR_HEIGHT, 0).multiply(slots[slot]!);
    this.inward.copy(sideFrame(side).inward);
    const slotOrigin = new Vector3().setFromMatrixPosition(this.slotWorld);
    this.book.copy(slotOrigin).setY(slotOrigin.y + TARGET_HEIGHT / 2);
    this.route = buildRoute(this.camera.position, centre, target.east, target.rooms, target.floors, side, this.book);
    this.stand.copy(standPoint(this.book, side, room.y * FLOOR_HEIGHT));

    const m = this.library.bookMaterial.uniforms;
    m.uTargetBook!.value.copy(slotOrigin);
    m.uTargetColour!.value.set(...target.colour);

    const floorY = room.y * FLOOR_HEIGHT;
    this.trail = new Trail(this.route.walk, floorY);
    this.trail.mesh.visible = false;
    this.scene.add(this.trail.mesh);
    // the halo sits just in front of the spine, so the shelf behind can't hide it
    this.halo = new Halo(this.book.clone().addScaledVector(sideFrame(side).inward, 0.12));
    this.halo.pixelRatio = Math.min(devicePixelRatio, 2);
    this.scene.add(this.halo.points);
    this.prepare();
    this.lamps = routeLamps((room.x - Math.sign(target.east || 1)) * PITCH_X, room.x * PITCH_X, floorY);

    this.look.from(this.camera);
    this.step = reduced
      ? { kind: 'veil', t: 0, to: 'out' }
      : { kind: 'travel', plan: planPathLasting(this.route.travel, TRAVEL, TRAVEL_SECONDS), t: 0 };
    this.events.phase?.(reduced ? 'guide' : 'travel');
    return new Promise((r) => (this.resolve = r));
  }

  /** Jump to the shelf, with the trail drawn and the lamps lit. */
  skip() {
    if (!this.step || this.step.kind === 'stand') return;
    this.events.veil?.(0);
    this.arriveAtShelf();
  }

  /** Take any book the visitor picked off its shelf and open it. */
  async browse(instance: number): Promise<{ room: { x: number; y: number }; slot: number }> {
    const { room, slot } = this.library.bookAt(instance);
    const off = this.library.roomOffset;
    this.clear();
    this.events = {};
    this.reduced = false;
    this.slotWorld.makeTranslation((room.x - off.x) * PITCH_X, (room.y - off.y) * FLOOR_HEIGHT, 0).multiply(slots[slot]!);
    this.inward.copy(sideFrame(SHELVED_SIDES[Math.floor(slot / 160)]!).inward);
    const m = this.library.bookMaterial.uniforms;
    m.uTargetBook!.value.setFromMatrixPosition(this.slotWorld);
    m.uTargetColour!.value.set(...spineColour(room, slot));
    this.step = { kind: 'stand' };
    await this.reveal();
    return { room, slot };
  }

  /** Take the volume off the shelf, bring it to the reader and open it. Resolves once it's open. */
  reveal(): Promise<void> {
    if (this.step?.kind !== 'stand') return Promise.resolve();
    this.reading = new ReadingBook(this.slotWorld, this.inward, this.library.bookMaterial.uniforms.uTargetColour!.value.toArray());
    this.scene.add(this.reading.group);
    this.library.bookMaterial.uniforms.uHideTarget!.value = 1;
    this.prepare();
    this.step = { kind: 'pull', t: 0 };
    this.events.phase?.('pull');
    return new Promise((r) => (this.revealed = r));
  }

  /** Put the volume back on its shelf. */
  shelve() {
    this.reading?.group.removeFromParent();
    this.reading?.dispose();
    this.reading = null;
    this.library.bookMaterial.uniforms.uHideTarget!.value = 0;
    if (this.step?.kind === 'read' || this.step?.kind === 'pull' || this.step?.kind === 'open') this.step = { kind: 'stand' };
  }

  /** Drop the journey's props and glow, back to the plain library. */
  clear() {
    this.shelve();
    this.trail?.mesh.removeFromParent();
    this.trail?.dispose();
    this.trail = null;
    this.halo?.points.removeFromParent();
    this.halo?.dispose();
    this.halo = null;
    clearLamps();
    const m = this.library.shellMaterial.uniforms;
    m.uFocusAmount!.value = 0;
    this.library.bookMaterial.uniforms.uFocusAmount!.value = 0;
    this.library.bookMaterial.uniforms.uTargetBook!.value.set(1e6, 0, 0);
    this.step = null;
    this.guideTime = 0;
  }

  update(dt: number, seconds: number) {
    const step = this.step;
    if (!step) return;
    this.trail?.tick(seconds);
    if (step.kind === 'stand') this.lightGuide(dt);
    // once the volume is off the shelf, its glow and halo have done their job
    if (step.kind === 'pull' || step.kind === 'open' || step.kind === 'read') {
      if (this.halo) this.halo.amount = 0;
      this.library.bookMaterial.uniforms.uFocusAmount!.value = 0;
      this.library.shellMaterial.uniforms.uFocusAmount!.value *= 0.9;
    }

    if (step.kind === 'pull') {
      step.t += dt;
      const k = Math.min(1, step.t / (this.reduced ? 0.6 : 1.6));
      this.reading!.pull(k, this.camera);
      if (k >= 1) {
        this.step = { kind: 'open', t: 0 };
        this.events.phase?.('open');
      }
    } else if (step.kind === 'open') {
      step.t += dt;
      const k = Math.min(1, step.t / (this.reduced ? 0.5 : 1.4));
      this.reading!.pull(1, this.camera);
      this.reading!.open(k, !this.reduced);
      this.events.riffle?.(Math.min(1, Math.max(0, (k - 0.35) / 0.65)));
      if (k >= 1) {
        this.step = { kind: 'read' };
        this.events.phase?.('read');
        this.revealed?.();
        this.revealed = null;
      }
    }

    if (step.kind === 'travel') {
      step.t += dt;
      const { u } = step.plan.at(step.t);
      this.camera.position.copy(step.plan.curve.getPointAt(u));
      this.look.update(step.plan.curve.getTangentAt(u), dt);
      this.look.apply(this.camera);
      this.events.progress?.(Math.min(1, step.t / step.plan.duration));
      if (u >= 1) {
        this.step = { kind: 'arrive', t: 0 };
        this.events.phase?.('arrive');
      }
    } else if (step.kind === 'arrive') {
      step.t += dt;
      // a breath at the railing while the first lamps come up
      this.lightGuide(dt);
      if (step.t > 0.9) {
        this.step = { kind: 'guide', plan: planPath(this.route!.walk, WALK), t: 0 };
        this.events.phase?.('guide');
      }
    } else if (step.kind === 'guide') {
      step.t += dt;
      this.lightGuide(dt);
      const { u } = step.plan.at(step.t);
      this.camera.position.copy(step.plan.curve.getPointAt(u));
      const ahead = step.plan.curve.getTangentAt(u);
      // turn towards the book over the last stretch
      const towards = this.book.clone().sub(this.camera.position).normalize();
      const blend = Math.min(1, Math.max(0, (u - 0.55) / 0.45));
      this.look.update(ahead.lerp(towards, blend * blend * (3 - 2 * blend)).normalize(), dt, 2.4);
      this.look.apply(this.camera);
      if (u >= 1) this.arriveAtShelf();
    } else if (step.kind === 'veil') {
      step.t += dt;
      if (step.to === 'out') {
        this.events.veil?.(Math.min(1, step.t / 0.7));
        if (step.t > 0.75) {
          this.placeAtShelf();
          this.step = { kind: 'veil', t: 0, to: 'in' };
        }
      } else {
        this.events.veil?.(Math.max(0, 1 - step.t / 0.7));
        this.lightGuide(dt);
        if (step.t > 0.75) this.arriveAtShelf();
      }
    }
  }

  private lightGuide(dt: number) {
    this.guideTime += dt;
    const g = this.guideTime;
    lightLamps(this.lamps, g);
    if (this.trail) {
      this.trail.mesh.visible = true;
      this.trail.drawn = this.reduced ? 1.05 : Math.min(1.05, g * 0.55);
    }
    // the volume glows, breathing slowly, so it's unmistakable from across the room
    const glow = Math.min(1, g * 0.5) * (0.85 + 0.15 * Math.sin(g * 2.2));
    this.library.shellMaterial.uniforms.uFocus!.value.copy(this.book);
    this.library.shellMaterial.uniforms.uFocusAmount!.value = glow * 1.1;
    this.library.bookMaterial.uniforms.uFocus!.value.copy(this.book);
    this.library.bookMaterial.uniforms.uFocusAmount!.value = glow * 2.2;
    if (this.halo) this.halo.amount = glow;
  }

  private placeAtShelf() {
    this.camera.position.copy(this.stand);
    this.camera.lookAt(this.book);
    this.look.from(this.camera);
  }

  private arriveAtShelf() {
    this.placeAtShelf();
    this.guideTime = Math.max(this.guideTime, 4);
    this.lightGuide(0);
    this.step = { kind: 'stand' };
    this.events.phase?.('stand');
    this.resolve?.();
    this.resolve = null;
  }
}
