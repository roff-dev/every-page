import { PAGES_PER_VOLUME, SHELVES_PER_WALL, VOLUMES_PER_SHELF, WALLS } from '../engine/constants';
import type { Location } from '../engine/location';

const SVG = 'http://www.w3.org/2000/svg';
const INK = '#3a2618';
const LIT = '#ffc46b';
const RUST = '#8a3b26';
/** The hexagon's sides that carry shelves, in wall order; the other two open onto hallways. */
const SHELVED_SIDES = [1, 2, 4, 5];

function svg(viewBox: string, ...children: string[]) {
  const el = document.createElementNS(SVG, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = children.join('');
  return el;
}

function hexagonFigure(wall: number) {
  const corner = (k: number) => {
    const a = (Math.PI / 3) * k - Math.PI / 2;
    return [50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)].map((v) => v.toFixed(1)).join(',');
  };
  const sides = Array.from({ length: 6 }, (_, k) => {
    const shelved = SHELVED_SIDES.indexOf(k);
    const [a, b] = [corner(k), corner(k + 1)];
    if (shelved < 0) return `<line x1="${a.split(',')[0]}" y1="${a.split(',')[1]}" x2="${b.split(',')[0]}" y2="${b.split(',')[1]}" stroke="${INK}" stroke-opacity="0.25" stroke-width="2" stroke-dasharray="3 4"/>`;
    const on = shelved === wall;
    return `<line x1="${a.split(',')[0]}" y1="${a.split(',')[1]}" x2="${b.split(',')[0]}" y2="${b.split(',')[1]}" stroke="${on ? RUST : INK}" stroke-width="${on ? 9 : 5}" stroke-linecap="round"/>`;
  });
  return svg('0 0 100 100', `<circle cx="50" cy="50" r="13" fill="none" stroke="${INK}" stroke-opacity="0.3" stroke-width="1.5"/>`, ...sides);
}

/** Shelves are counted from the floor up. */
function wallFigure(shelf: number) {
  const rows = Array.from({ length: SHELVES_PER_WALL }, (_, s) => {
    const y = 84 - s * 17;
    const on = s === shelf;
    return `<rect x="12" y="${y - 12}" width="76" height="12" rx="1.5" fill="${on ? LIT : 'none'}" stroke="${on ? RUST : 'none'}"/>` +
      `<line x1="10" y1="${y}" x2="90" y2="${y}" stroke="${INK}" stroke-width="2.5"/>`;
  });
  return svg('0 0 100 100', `<rect x="10" y="4" width="80" height="82" rx="3" fill="none" stroke="${INK}" stroke-width="2"/>`, ...rows);
}

function shelfFigure(volume: number) {
  const width = 80 / VOLUMES_PER_SHELF;
  const books = Array.from({ length: VOLUMES_PER_SHELF }, (_, v) => {
    const on = v === volume;
    const h = 36 + ((v * 7) % 5) * 3;
    return `<rect x="${(10 + v * width + 0.3).toFixed(2)}" y="${on ? 66 - h - 10 : 66 - h}" width="${(width - 0.6).toFixed(2)}" height="${h}" fill="${on ? RUST : INK}" fill-opacity="${on ? 1 : 0.35}"/>`;
  });
  return svg('0 0 100 100', ...books, `<line x1="8" y1="67" x2="92" y2="67" stroke="${INK}" stroke-width="2.5"/>`);
}

function pageFigure(page: number) {
  return svg(
    '0 0 100 100',
    `<path d="M50 24 C38 18 22 18 12 22 V80 C22 76 38 76 50 82 C62 76 78 76 88 80 V22 C78 18 62 18 50 24 Z" fill="#fbf3e2" stroke="${INK}" stroke-width="2"/>`,
    `<line x1="50" y1="24" x2="50" y2="82" stroke="${INK}" stroke-width="1.5"/>`,
    ...[34, 42, 50, 58, 66].map((y) => `<line x1="58" y1="${y}" x2="82" y2="${y - 1}" stroke="${INK}" stroke-opacity="0.3" stroke-width="2"/>`),
    `<rect x="57" y="${30 + (page % 5) * 8}" width="18" height="5" fill="${LIT}"/>`,
  );
}

export interface RouteCard {
  /** Shows the way to a page; resolves when the visitor opens the book. */
  show(location: Location): Promise<void>;
}

/** Without WebGL there are no galleries to walk, so the way to the shelf is drawn instead. */
export function routeCard(root: HTMLElement): RouteCard {
  const hex = root.querySelector<HTMLElement>('[data-route-hex]')!;
  const steps = root.querySelector<HTMLElement>('[data-route-steps]')!;
  const open = root.querySelector<HTMLButtonElement>('[data-route-open]')!;
  let resolve: (() => void) | null = null;
  open.addEventListener('click', () => {
    resolve?.();
    resolve = null;
  });

  const step = (figure: SVGSVGElement, what: string, which: number, of: number) => {
    const li = document.createElement('li');
    const label = document.createElement('p');
    label.className = 'which';
    label.textContent = `${what} ${which}`;
    const total = document.createElement('p');
    total.className = 'what';
    total.textContent = `of ${of}`;
    li.append(figure, label, total);
    return li;
  };

  return {
    show(location) {
      const h = location.hexagon.toString(36);
      hex.textContent = h.length > 22 ? `${h.slice(0, 10)}…${h.slice(-8)}` : h;
      steps.replaceChildren(
        step(hexagonFigure(location.wall), 'Wall', location.wall + 1, WALLS),
        step(wallFigure(location.shelf), 'Shelf', location.shelf + 1, SHELVES_PER_WALL),
        step(shelfFigure(location.volume), 'Volume', location.volume + 1, VOLUMES_PER_SHELF),
        step(pageFigure(location.page), 'Page', location.page + 1, PAGES_PER_VOLUME),
      );
      document.body.dataset.state = 'route';
      requestAnimationFrame(() => open.focus());
      return new Promise((r) => (resolve = r));
    },
  };
}
