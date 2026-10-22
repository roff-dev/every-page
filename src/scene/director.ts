import { Matrix4, PerspectiveCamera, Scene, Vector3 } from 'three';
import { ComfortLook, buildRoute, planPath, planPathLasting, standPoint, TRAVEL, WALK, type Plan, type Route } from './journey';
import { Halo, Trail, clearLamps, lightLamps, routeLamps } from './guide';
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

export type Phase = 'travel' | 'arrive' | 'guide' | 'stand';

export interface JourneyEvents {
  phase?(phase: Phase): void;
  /** 0–1 through the travel */
  progress?(p: number): void;
  /** Reduced motion: cover or uncover the view (0–1) */
  veil?(opacity: number): void;
}

const slots = bookSlots();
const TARGET_HEIGHT = 0.47;
const TRAVEL_SECONDS = 8;

type Step =
  | { kind: 'travel'; plan: Plan; t: number }
  | { kind: 'arrive'; t: number }
  | { kind: 'guide'; plan: Plan; t: number }
  | { kind: 'veil'; t: number; to: 'out' | 'in' }
  | { kind: 'stand' };

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

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly scene: Scene,
    private readonly library: Library,
    /** Compiles any new materials off the critical path, so the walk never stalls on a shader. */
    private readonly prepare: () => void,
  ) {}

  get active() {
    return this.step !== null && this.step.kind !== 'stand';
  }

  get standing() {
    return this.step?.kind === 'stand';
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
    const slotOrigin = new Vector3().setFromMatrixPosition(
      new Matrix4().makeTranslation(room.x * PITCH_X, room.y * FLOOR_HEIGHT, 0).multiply(slots[slot]!),
    );
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

  /** Drop the journey's props and glow, back to the plain library. */
  clear() {
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
