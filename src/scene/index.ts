import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { Library } from './library';
import { FOG } from './materials';
import { FrameWatch, initialTier, lowerTier, TIERS, type Tier } from './quality';
import { APOTHEM } from './dimensions';

export interface LibraryScene {
  readonly canvas: HTMLCanvasElement;
  readonly tier: () => Tier;
  dispose(): void;
}

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

export function mountLibrary(container: HTMLElement): LibraryScene {
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
  const library = new Library(tier);
  scene.add(library.group);
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  resize();

  // portrait screens look straight down the shaft; wider ones look across the railing into it
  const devView = import.meta.env.DEV ? new URLSearchParams(location.search).get('view') : null;
  const idleView = () => VIEWS[devView as keyof typeof VIEWS] ?? (camera.aspect < 0.9 ? VIEWS.shaft : VIEWS.landing);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const watch = new FrameWatch(() => {
    const next = lowerTier(tier);
    if (!next) return;
    tier = next;
    library.setTier(tier);
    resize();
  });

  let last = performance.now();
  watch.reset(last);
  renderer.setAnimationLoop((now: number) => {
    watch.sample(now, now - last);
    last = now;
    idleView()(camera, reduced.matches ? 0 : now);
    library.follow(camera.position.x, camera.position.y);
    renderer.render(scene, camera);
  });

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  if (import.meta.env.DEV) Object.assign(window, { __scene: { renderer, camera, tier: () => tier } });

  return {
    canvas: renderer.domElement,
    tier: () => tier,
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      renderer.dispose();
    },
  };
}
