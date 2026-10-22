import { searchCard } from './searchCard';
import { catalogue } from './catalogue';
import { formatLink } from '../engine/links';
import type { LibraryScene } from '../scene';

let scene: LibraryScene | null = null;

const supportsWebGL2 = () => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
};

async function mountScene(container: HTMLElement) {
  if (!supportsWebGL2()) return;
  const { mountLibrary } = await import('../scene');
  scene = await mountLibrary(container);
  const canvas = scene.canvas;
  requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add('shown')));
}

export function boot() {
  const form = document.getElementById('search') as HTMLFormElement;
  const card = searchCard(form, async (text) => {
    history.replaceState(null, '', formatLink({ anchor: { kind: 'query', text, variant: 0 }, offset: 0n }));
    card.setBusy(true);
    try {
      await catalogue.search(text, 0);
    } finally {
      card.setBusy(false);
    }
  });

  // The 3D library loads after first paint, so the title and search card are usable at once
  const container = document.getElementById('scene')!;
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 200));
  const start = () => idle(() => void mountScene(container));
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
}
