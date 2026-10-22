import { searchCard } from './searchCard';
import { catalogue } from './catalogue';
import { journeyUi, targetFor } from './journeyUi';
import { wanderUi } from './wanderUi';
import { formatLink, type Anchor, type Move } from '../engine/links';
import { fromIndex, neighbour, toIndex, type Location } from '../engine/location';
import type { LibraryScene } from '../scene';

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
  const scene = await mountLibrary(container);
  const canvas = scene.canvas;
  requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add('shown')));
  return scene;
}

/**
 * Where the visitor is, as something shareable: the place they arrived at by search or at random
 * (the anchor), plus how many galleries and floors they have walked since.
 */
interface Position {
  anchor: Anchor;
  hexagon: bigint;
  /** The scene's whole-room coordinates of the anchor's hexagon */
  room: { x: number; y: number };
}

function randomSeed() {
  const words = crypto.getRandomValues(new Uint32Array(2));
  return (BigInt(words[0]!) << 32n) | BigInt(words[1]!);
}

export function boot() {
  const form = document.getElementById('search') as HTMLFormElement;
  const container = document.getElementById('scene')!;
  let scene: LibraryScene | null = null;
  let position: Position | null = null;
  let reading: { close(): void } | null = null;

  const journey = journeyUi(document.getElementById('journey')!, () => scene?.skip());
  const wander = wanderUi(document.getElementById('wander')!, {
    go: (way) => scene?.go(way),
    search: () => {
      document.body.dataset.state = '';
      form.querySelector('textarea')!.focus();
    },
    random: () => void openRandom(),
    share: () => void sharePlace(),
  });

  const sceneReady: Promise<LibraryScene | null> = new Promise((resolve) => {
    const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 200));
    const start = () => idle(() => resolve(mountScene(container)));
    if (document.readyState === 'complete') start();
    else addEventListener('load', start, { once: true });
  });
  void sceneReady.then((s) => (scene = s));

  /** The landing room is the place a random seed of zero leads to. */
  async function landing(s: LibraryScene): Promise<Position> {
    const index = await catalogue.randomIndex(0n);
    return { anchor: { kind: 'random', seed: 0n }, hexagon: fromIndex(index).hexagon, room: s.room() };
  }

  function moveFrom(p: Position, room: { x: number; y: number }, book?: Move['book']): { move: Move; hexagon: bigint } {
    const east = room.x - p.room.x;
    const up = room.y - p.room.y;
    return { move: book ? { east, up, book } : { east, up }, hexagon: neighbour(p.hexagon, east, up) };
  }

  async function read(index: bigint, link: (offset: bigint) => string, highlight: { offset: number; length: number } | null, elsewhere: (() => void) | null) {
    const { openReader } = await import('./reader');
    history.replaceState(null, '', link(0n));
    document.body.dataset.state = 'reading';
    reading = openReader({
      index,
      highlight,
      onMove: (offset) => history.replaceState(null, '', link(offset)),
      onElsewhere: elsewhere && (() => {
        reading?.close();
        elsewhere();
      }),
      onClose: () => {
        reading?.close();
        reading = null;
        scene?.shelve();
        startWandering();
      },
    });
  }

  /** Fly to a page, walk to its shelf, take the book down and open it. */
  async function travel(anchor: Anchor, index: bigint, highlight: { offset: number; length: number } | null, elsewhere: (() => void) | null) {
    const s = await sceneReady;
    if (!s) return;
    reading?.close();
    s.release();
    const location = fromIndex(index);
    position ??= await landing(s);
    const here = moveFrom(position, s.room()).hexagon;
    await s.journey(targetFor(location), journey.begin(here, location));
    position = { anchor, hexagon: location.hexagon, room: s.room() };
    await s.reveal();
    journey.end();
    await read(index, (offset) => formatLink({ anchor, offset }), highlight, elsewhere);
  }

  async function find(text: string, variant: number) {
    card.setBusy(true);
    try {
      const anchor: Anchor = { kind: 'query', text, variant };
      history.replaceState(null, '', formatLink({ anchor, offset: 0n }));
      const found = await catalogue.search(text, variant);
      await travel(anchor, found.index, { offset: found.offset, length: text.length }, () => void find(text, variant + 1));
    } finally {
      card.setBusy(false);
    }
  }

  async function openRandom() {
    const seed = randomSeed();
    const anchor: Anchor = { kind: 'random', seed };
    history.replaceState(null, '', formatLink({ anchor, offset: 0n }));
    await travel(anchor, await catalogue.randomIndex(seed), null, null);
  }

  async function startWandering() {
    const s = await sceneReady;
    if (!s) return;
    position ??= await landing(s);
    const p = position;
    const showPlace = () => wander.setPlace(moveFrom(p, s.room()).hexagon);
    s.wander({
      moved: showPlace,
      book: (pick) => void browse(s, pick.instance),
      hover: (pick, x, y) => {
        if (!pick) return wander.hover(null, x, y);
        const { room, slot } = s.bookAt(pick.instance);
        void catalogue.spine(locationOf(room, slot).index).then((t) => wander.hover(t, x, y));
      },
    });
    showPlace();
    wander.show();
  }

  function locationOf(room: { x: number; y: number }, slot: number) {
    const book = { wall: Math.floor(slot / 160), shelf: Math.floor((slot % 160) / 32), volume: slot % 32, page: 0 };
    const { move, hexagon } = moveFrom(position!, room, book);
    const location: Location = { hexagon, ...book };
    return { move, location, index: toIndex(location) };
  }

  async function browse(s: LibraryScene, instance: number) {
    wander.hide();
    const { room, slot } = await s.browse(instance);
    const { move, index } = locationOf(room, slot);
    const anchor = position!.anchor;
    await read(index, (offset) => formatLink({ anchor, offset, move }), null, null);
  }

  async function sharePlace() {
    const s = await sceneReady;
    if (!s || !position) return;
    const url = new URL(formatLink({ anchor: position.anchor, offset: 0n, move: moveFrom(position, s.room()).move }), location.href).href;
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
      } catch {
        // dismissed
      }
    } else await navigator.clipboard.writeText(url);
  }

  const card = searchCard(form, (text) => void find(text, 0));
  document.getElementById('random')!.addEventListener('click', () => void openRandom());
  document.getElementById('wander-start')!.addEventListener('click', () => void startWandering());
}
