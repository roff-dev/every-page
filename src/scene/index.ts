import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { Library, yieldToMain } from './library';
import { Director, type JourneyEvents, type JourneyTarget } from './director';
import { Wanderer, type WanderEvents } from './wander';
import { FOG } from './materials';
import { FrameWatch, initialTier, lowerTier, TIERS, type Tier } from './quality';
import { APOTHEM, FLOOR_HEIGHT, PITCH_X } from './dimensions';

export interface LibraryScene {
  readonly canvas: HTMLCanvasElement;
  readonly tier: () => Tier;
  /** Fly to a book and walk to its shelf (or, short, just the last of the walk); resolves when standing in front of it. */
  journey(target: JourneyTarget, events: JourneyEvents, short?: boolean): Promise<void>;
  skip(): void;
  /** Walk on after the visitor took over the guided walk. */
  resume(): void;
  /** Take the volume off the shelf and open it; resolves once it's open. */
  reveal(): Promise<void>;
  /** Put the volume back. */
  shelve(): void;
  /** Let go of a journey's props and drift again. */
  release(): void;
  /** Walk freely from wherever the camera is. */
  wander(events: WanderEvents): void;
  /** Walk to the next gallery (+1 east, -1 west) or up or down a floor. */
  go(way: 'east' | 'west' | 'up' | 'down'): void;
  /** Take a picked book off its shelf and open it; resolves with where it was. */
  browse(instance: number, events?: JourneyEvents): Promise<{ room: { x: number; y: number }; slot: number }>;
  /** Called at each footfall while walking */
  onStep: (() => void) | null;
  /** The room the camera is in, in whole rooms (library coordinates). */
  room(): { x: number; y: number };
  /** Which room and slot a picked book is, without taking it down. */
  bookAt(instance: number): { room: { x: number; y: number }; slot: number };
  dispose(): void;
}

export type { JourneyTarget, JourneyEvents, WanderEvents };

const REBASE_DISTANCE = 400;
/** Metres between footfalls at walking pace */
const STRIDE = 0.78;

const VIEWS = {
  // the landing view: across the railing and down the air shaft, drifting very slowly
  landing: (c: PerspectiveCamera, t: number) => {
    const a = Math.sin(t * 0.00004) * 0.25;
    c.position.set(-2.4, 2.3, -3.1);
    c.lookAt(1.3 + Math.sin(a) * 2, -3.2, 1.5 + Math.cos(a) * 0.5);
  },
  shaft: (c: PerspectiveCamera, t: number) => {
    c.position.set(0.3, 3.1, 0.9);
    c.lookAt(Math.sin(t * 0.00005) * 0.3, -20, -2.2);
  },
  room: (c: PerspectiveCamera, t: number) => {
    c.position.set(-3.2, 1.6, -2.6);
    c.lookAt(3.5, 1.35, 2.2 + Math.sin(t * 0.0002) * 0.4);
  },
  corridor: (c: PerspectiveCamera) => {
    c.position.set(-APOTHEM + 0.8, 1.6, 0);
    c.lookAt(40, 1.45, 0);
  },
  up: (c: PerspectiveCamera) => {
    c.position.set(0.15, 1.2, 2.1);
    c.lookAt(0, 16, -0.9);
  },
  stair: (c: PerspectiveCamera) => {
    c.position.set(APOTHEM + 1.1, 1.6, 1.0);
    c.lookAt(APOTHEM + 1.1, 1.0, -3);
  },
  fly: (c: PerspectiveCamera, t: number) => {
    const s = t / 1000;
    c.position.set(s * 6, 1.6 + Math.sin(s * 0.5) * 0.2, Math.sin(s * 0.3) * 0.5);
    c.lookAt(c.position.x + 10, 1.5, 0);
  },
} satisfies Record<string, (c: PerspectiveCamera, t: number) => void>;

/** Builds the scene over several short tasks, so the page stays responsive while it loads. */
export async function mountLibrary(container: HTMLElement): Promise<LibraryScene> {
  let tier = initialTier();
  if (import.meta.env.DEV) {
    const forced = new URLSearchParams(location.search).get('tier');
    if (forced === 'high' || forced === 'medium' || forced === 'low') tier = TIERS[forced];
  }
  const renderer = new WebGLRenderer({ antialias: tier.antialias, powerPreference: 'high-performance' });
  renderer.setClearColor(FOG);
  const resize = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, tier.pixelRatio));
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
    camera.updateProjectionMatrix();
  };
  const camera = new PerspectiveCamera(62, 1, 0.03, 120);
  const scene = new Scene();
  await yieldToMain();
  const library = await Library.create(tier);
  scene.add(library.group);
  const director = new Director(camera, scene, library, () => void renderer.compileAsync(scene, camera));
  const wandererEvents: WanderEvents = {};
  const wanderer = new Wanderer(camera, renderer.domElement, library, {
    book: (p) => wandererEvents.book?.(p),
    hover: (p, x, y) => wandererEvents.hover?.(p, x, y),
    moved: () => wandererEvents.moved?.(),
  });
  // dragging or tapping during the guided walk takes over; looking around works as when wandering
  const canvas = renderer.domElement;
  let holdDrag: number | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!director.guiding) return;
    holdDrag = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    director.hold();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (holdDrag !== e.pointerId) return;
    const k = e.pointerType === 'mouse' ? 0.0032 : 0.0052;
    director.turn(-e.movementX * k, e.movementY * k);
  });
  const release = (e: PointerEvent) => {
    if (holdDrag === e.pointerId) holdDrag = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  resize();
  await yieldToMain();

  // portrait screens look straight down the shaft; wider ones look across the railing into it
  const devView = import.meta.env.DEV ? new URLSearchParams(location.search).get('view') : null;
  const idleView = () => VIEWS[devView as keyof typeof VIEWS] ?? (camera.aspect < 0.9 ? VIEWS.shaft : VIEWS.landing);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const watch = new FrameWatch(() => {
    const next = lowerTier(tier);
    if (!next) return;
    tier = next;
    void library.setTier(tier).then(resize);
  });

  // Floating origin: far from the origin floats lose precision, so the camera is pulled back by
  // whole rooms and the shaders' room offset takes up the difference. Nothing visible changes.
  const roomOffset = { x: 0, y: 0 };
  const rebase = () => {
    const kx = Math.abs(camera.position.x) > REBASE_DISTANCE ? Math.round(camera.position.x / PITCH_X) : 0;
    const ky = Math.abs(camera.position.y) > REBASE_DISTANCE ? Math.floor(camera.position.y / FLOOR_HEIGHT) : 0;
    if (!kx && !ky) return;
    camera.position.x -= kx * PITCH_X;
    camera.position.y -= ky * FLOOR_HEIGHT;
    roomOffset.x += kx;
    roomOffset.y += ky;
    library.setRoomOffset(roomOffset.x, roomOffset.y);
  };

  const hud = import.meta.env.DEV && new URLSearchParams(location.search).has('fps') ? frameReadout(container) : null;

  idleView()(camera, 0);
  library.follow(camera.position.x, camera.position.y);
  // compiles shaders in parallel where the driver allows, instead of stalling the first frame
  await renderer.compileAsync(scene, camera);

  let last = performance.now();
  watch.reset(last);
  const lastPosition = camera.position.clone();
  let stride = 0;
  const footfalls = () => {
    const p = camera.position;
    const moved = Math.hypot(p.x - lastPosition.x, p.z - lastPosition.z) + Math.abs(p.y - lastPosition.y) * 0.6;
    lastPosition.copy(p);
    // jumps (a cut to the shelf, a rebase) aren't steps
    const onFoot = (director.guiding && !director.holding) || wanderer.active;
    if (!onFoot || moved > 0.5) return void (stride = 0);
    stride += moved;
    if (stride < STRIDE) return;
    stride = 0;
    api.onStep?.();
  };
  renderer.setAnimationLoop((now: number) => {
    const frameMs = now - last;
    watch.sample(now, frameMs);
    last = now;
    hud?.(frameMs, tier.name);
    const dt = Math.min(0.05, Math.max(0, frameMs / 1000));
    if (director.active || director.standing) director.update(dt, now / 1000);
    else if (wanderer.active) wanderer.update(dt);
    else idleView()(camera, reduced.matches ? 0 : now);
    footfalls();
    if (!director.active) rebase();
    library.follow(camera.position.x, camera.position.y);
    renderer.render(scene, camera);
  });

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  if (import.meta.env.DEV) Object.assign(window, { __scene: { renderer, camera, library, tier: () => tier } });

  const api: LibraryScene = {
    onStep: null,
    canvas: renderer.domElement,
    tier: () => tier,
    journey: (target, events, short) => director.start(target, events, reduced.matches, short),
    skip: () => director.skip(),
    resume: () => director.resume(),
    reveal: () => director.reveal(),
    shelve: () => director.shelve(),
    release: () => director.clear(),
    wander(events) {
      Object.assign(wandererEvents, events);
      director.clear();
      wanderer.start();
    },
    go(way) {
      if (way === 'east' || way === 'west') wanderer.east(way === 'east' ? 1 : -1);
      else wanderer.floor(way === 'up' ? 1 : -1);
    },
    browse: (instance, events) => director.browse(instance, events),
    // from the camera itself, so it's right even before the rooms have re-centred this frame
    room: () => ({
      x: Math.round(camera.position.x / PITCH_X) + library.roomOffset.x,
      y: Math.floor((camera.position.y + 0.15) / FLOOR_HEIGHT) + library.roomOffset.y,
    }),
    bookAt: (instance) => library.bookAt(instance),
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      renderer.dispose();
    },
  };
  return api;
}

/** Development-only frame time readout, for checking real phones. */
function frameReadout(container: HTMLElement) {
  const el = document.createElement('output');
  el.style.cssText = 'position:fixed;right:8px;top:8px;z-index:9;font:12px/1.3 monospace;color:#fff1dc;background:#2b1710cc;padding:6px 8px;border-radius:4px;white-space:pre';
  container.parentElement?.appendChild(el);
  const frames: number[] = [];
  let shown = 0;
  return (ms: number, tier: string) => {
    frames.push(ms);
    if (frames.length > 120) frames.shift();
    const now = performance.now();
    if (now - shown < 500) return;
    shown = now;
    const sorted = [...frames].sort((a, b) => a - b);
    const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
    el.textContent = `${(1000 / avg).toFixed(0)} fps\np95 ${p95.toFixed(1)} ms\ntier ${tier}`;
  };
}
