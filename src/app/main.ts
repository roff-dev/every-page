import { searchCard } from './searchCard';
import { catalogue } from './catalogue';
import { journeyUi, targetFor } from './journeyUi';
import { formatLink } from '../engine/links';
import type { LibraryScene } from '../scene';

let scene: LibraryScene | null = null;
let sceneReady: Promise<LibraryScene | null> = Promise.resolve(null);
/** The hexagon the visitor is standing in; journeys are measured from here. */
let here = 0n;

const supportsWebGL2 = () => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
};

async function mountScene(container: HTMLElement): Promise<LibraryScene | null> {
  if (!supportsWebGL2()) return null;
  const { mountLibrary } = await import('../scene');
  scene = await mountLibrary(container);
  const canvas = scene.canvas;
  requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add('shown')));
  return scene;
}

export function boot() {
  const form = document.getElementById('search') as HTMLFormElement;
  const ui = journeyUi(document.getElementById('journey')!, () => scene?.skip());

  const card = searchCard(form, async (text) => {
    history.replaceState(null, '', formatLink({ anchor: { kind: 'query', text, variant: 0 }, offset: 0n }));
    card.setBusy(true);
    try {
      const [found, ready] = await Promise.all([catalogue.search(text, 0), sceneReady]);
      if (!ready) return;
      const events = ui.begin(here, found.location);
      await ready.journey(targetFor(found.location), events);
      here = found.location.hexagon;
    } finally {
      card.setBusy(false);
    }
  });

  // The 3D library loads after first paint, so the title and search card are usable at once
  const container = document.getElementById('scene')!;
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 200));
  sceneReady = new Promise((resolve) => {
    const start = () => idle(() => resolve(mountScene(container)));
    if (document.readyState === 'complete') start();
    else addEventListener('load', start, { once: true });
  });
}
