const GALLERIES = 5;
const HEXAGONS = 18;
const FLOORS = Math.ceil(HEXAGONS / GALLERIES);
const SVG = 'http://www.w3.org/2000/svg';

const centre = (n: number) => ({ x: 74 + (n % GALLERIES) * 58, y: 215 - Math.floor(n / GALLERIES) * 56 });

function hexPoints(x: number, y: number, r: number) {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k + Math.PI / 6;
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>, text?: string) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text) node.textContent = text;
  return node;
}

type Way = 'east' | 'west' | 'up' | 'down';

/** A toy library small enough to see whole: the hexagons are one numbered line, wound into floors, and it wraps. */
export function spiral(root: HTMLElement) {
  const map = root.querySelector<SVGSVGElement>('[data-map]')!;
  const place = root.querySelector<HTMLElement>('[data-spiral-place]')!;
  let here = 0;

  const path = Array.from({ length: HEXAGONS }, (_, n) => centre(n)).map((c, n) => `${n ? 'L' : 'M'}${c.x} ${c.y}`).join(' ');
  map.append(el('path', { d: path, fill: 'none', stroke: '#8a3b26', 'stroke-opacity': 0.35, 'stroke-width': 2, 'stroke-dasharray': '3 4' }));
  for (let f = 0; f < FLOORS; f++) {
    map.append(el('text', { x: 4, y: centre(f * GALLERIES).y + 4, fill: '#7a5a40', 'font-size': 12 }, `Floor ${f + 1}`));
  }
  for (let n = 0; n < HEXAGONS; n++) {
    const { x, y } = centre(n);
    const last = n === HEXAGONS - 1;
    map.append(
      el('polygon', {
        points: hexPoints(x, y, 22),
        fill: last ? '#f6ead0' : '#ead8b4',
        stroke: '#b98a5e',
        'stroke-width': 1.5,
        ...(last ? { 'stroke-dasharray': '4 3' } : {}),
      }),
      el('text', { x, y: y + 4, 'text-anchor': 'middle', fill: '#3a2618', 'font-size': 12 }, String(n + 1)),
    );
  }
  const lastCentre = centre(HEXAGONS - 1);
  map.append(el('text', { x: lastCentre.x + 30, y: lastCentre.y + 4, fill: '#7a5a40', 'font-size': 11, 'font-style': 'italic' }, 'one page'));
  const marker = el('circle', { r: 9, fill: '#ffc46b', stroke: '#8a3b26', 'stroke-width': 2 });
  marker.style.transition = 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)';
  map.append(marker);

  const show = (note: string, jump: boolean) => {
    const { x, y } = centre(here);
    marker.style.transitionDuration = jump || matchMedia('(prefers-reduced-motion: reduce)').matches ? '0s' : '';
    marker.style.transform = `translate(${x}px, ${y}px)`;
    const floor = Math.floor(here / GALLERIES) + 1;
    const gallery = (here % GALLERIES) + 1;
    place.textContent = `Hexagon ${here + 1}: floor ${floor}, gallery ${gallery}.${note ? ' ' + note : ''}`;
  };

  const go = (way: Way) => {
    const step = { east: 1, west: -1, up: GALLERIES, down: -GALLERIES }[way];
    const raw = here + step;
    const next = ((raw % HEXAGONS) + HEXAGONS) % HEXAGONS;
    const wrapped = raw !== next;
    const changedFloor = Math.floor(next / GALLERIES) !== Math.floor(here / GALLERIES);
    here = next;
    let note = '';
    if (wrapped) note = way === 'east' ? 'Past the last hexagon is the first again.' : way === 'west' ? 'Before the first hexagon is the last.' : 'The stairs came round to the other end of the library.';
    else if (changedFloor && way === 'east') note = 'East of the last gallery is the floor above.';
    else if (changedFloor && way === 'west') note = 'West of the first gallery is the floor below.';
    show(note, wrapped);
  };

  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-go]')];
  buttons.forEach((b) => b.addEventListener('click', () => go(b.dataset.go as Way)));
  const keys: Record<string, Way> = { ArrowRight: 'east', ArrowLeft: 'west', ArrowUp: 'up', ArrowDown: 'down' };
  root.querySelector('.ways')!.addEventListener('keydown', (e) => {
    const way = keys[(e as KeyboardEvent).key];
    if (!way) return;
    e.preventDefault();
    go(way);
  });
  show('', true);
}
