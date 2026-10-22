import { searchCard } from './searchCard';
import { catalogue } from './catalogue';
import { journeyUi, targetFor } from './journeyUi';
import { wanderUi } from './wanderUi';
import { routeCard } from './routeCard';
import { formatLink, parseLink, type Anchor, type Link, type Move } from '../engine/links';
import { exists, fromIndex, neighbour, toIndex, type Location } from '../engine/location';
import { PAGE_COUNT } from '../engine/constants';
import type { LibraryScene } from '../scene';

const supportsWebGL2 = () => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
};

/** The 3D library, or null where it can't be drawn; everything else still works without it. */
async function mountScene(container: HTMLElement): Promise<LibraryScene | null> {
  if (!supportsWebGL2()) return null;
  try {
    const { mountLibrary } = await import('../scene');
    const scene = await mountLibrary(container);
    const canvas = scene.canvas;
    requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add('shown')));
    return scene;
  } catch {
    return null;
  }
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
    random: () => attempt(openRandom),
    share: () => void sharePlace(),
  });

  const sceneReady: Promise<LibraryScene | null> = new Promise((resolve) => {
    const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 200));
    const start = () => idle(() => resolve(mountScene(container)));
    if (document.readyState === 'complete') start();
    else addEventListener('load', start, { once: true });
  });
  void sceneReady.then((s) => {
    scene = s;
    document.body.classList.toggle('reading-room', !s);
  });
  const route = routeCard(document.getElementById('route')!);

  /** Run something that needs the catalogue; if it doesn't answer, say so on the card and offer to try again. */
  function attempt(run: () => Promise<unknown>) {
    card.trouble(null);
    run().catch(() => {
      scene?.release();
      journey.end();
      document.body.dataset.state = '';
      card.setBusy(false);
      card.trouble(() => attempt(run));
    });
  }

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
        if (!scene) {
          document.body.dataset.state = '';
          form.querySelector('textarea')!.focus();
          return;
        }
        scene.shelve();
        attempt(startWandering);
      },
    });
  }

  interface Arrival {
    /** A shared link: no flight, just the last of the walk */
    short?: boolean;
    /** Galleries and floors from the anchor's hexagon to the book's, and the book itself */
    move?: Move;
    /** Pages from the anchor's (or moved-to) page that the link opened at */
    offset?: bigint;
  }

  /** Fly to a page, walk to its shelf, take the book down and open it. */
  async function travel(
    anchor: Anchor,
    index: bigint,
    highlight: { offset: number; length: number } | null,
    elsewhere: (() => void) | null,
    { short = false, move, offset = 0n }: Arrival = {},
  ) {
    const s = await sceneReady;
    reading?.close();
    const location = fromIndex(index);
    if (!s) await route.show(location);
    else {
      s.release();
      position ??= await landing(s);
      const here = moveFrom(position, s.room()).hexagon;
      const target = targetFor(location);
      await s.journey(short ? { ...target, rooms: 1, floors: 0 } : target, journey.begin(here, location, short), short);
      const room = s.room();
      position = move
        ? { anchor, hexagon: neighbour(location.hexagon, -move.east, -move.up), room: { x: room.x - move.east, y: room.y - move.up } }
        : { anchor, hexagon: location.hexagon, room };
      await s.reveal();
      journey.end();
    }
    await read(index, (o) => formatLink({ anchor, offset: offset + o, ...(move ? { move } : {}) }), highlight, elsewhere);
  }

  /** Open a shared link: find its anchor, follow its move and page offset, and arrive there. */
  async function openLink({ anchor, offset, move }: Link) {
    let anchorIndex: bigint;
    let highlight: { offset: number; length: number } | null = null;
    let elsewhere: (() => void) | null = null;
    if (anchor.kind === 'query') {
      const found = await catalogue.search(anchor.text, anchor.variant);
      anchorIndex = found.index;
      highlight = { offset: found.offset, length: anchor.text.length };
      elsewhere = () => attempt(() => find(anchor.text, anchor.variant + 1));
    } else if (anchor.kind === 'random') anchorIndex = await catalogue.randomIndex(anchor.seed);
    else anchorIndex = toIndex(anchor.location);

    const anchorHexagon = fromIndex(anchorIndex).hexagon;
    if (move && !move.book) return arriveAt(anchor, anchorHexagon, move);
    const book: Location | null = move?.book ? { hexagon: neighbour(anchorHexagon, move.east, move.up), ...move.book } : null;
    if (book && !exists(book)) return travel(anchor, anchorIndex, highlight, elsewhere, { short: true });
    const base = book ? toIndex(book) : anchorIndex;
    const index = base + offset;
    if (index < 0n || index >= PAGE_COUNT) return travel(anchor, base, book ? null : highlight, book ? null : elsewhere, { short: true, move });
    // your words are only on the anchor's own page
    const onAnchorPage = !book && offset === 0n;
    await travel(anchor, index, onAnchorPage ? highlight : null, book ? null : elsewhere, { short: true, move, offset });
  }

  /** A shared place with no book: stand in that gallery and wander. */
  async function arriveAt(anchor: Anchor, hexagon: bigint, move: Move) {
    const s = await sceneReady;
    if (!s) return;
    reading?.close();
    const room = s.room();
    position = { anchor, hexagon, room: { x: room.x - move.east, y: room.y - move.up } };
    history.replaceState(null, '', formatLink({ anchor, offset: 0n, move }));
    await startWandering();
  }

  async function find(text: string, variant: number) {
    card.setBusy(true);
    try {
      const anchor: Anchor = { kind: 'query', text, variant };
      history.replaceState(null, '', formatLink({ anchor, offset: 0n }));
      const found = await catalogue.search(text, variant);
      await travel(anchor, found.index, { offset: found.offset, length: text.length }, () => attempt(() => find(text, variant + 1)));
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
        void catalogue.spine(locationOf(room, slot).index).then((t) => wander.hover(t, x, y), () => undefined);
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
    const url = location.origin + location.pathname + formatLink({ anchor: position.anchor, offset: 0n, move: moveFrom(position, s.room()).move });
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
      } catch {
        // dismissed
      }
    } else {
      await navigator.clipboard.writeText(url);
      wander.linkCopied();
    }
  }

  const card = searchCard(form, (text) => attempt(() => find(text, 0)));
  const follow = () => {
    const link = parseLink(location.hash);
    if (link) attempt(() => openLink(link));
  };
  follow();
  addEventListener('hashchange', follow);
  document.getElementById('random')!.addEventListener('click', () => attempt(openRandom));
  document.getElementById('wander-start')!.addEventListener('click', () => attempt(startWandering));
}
