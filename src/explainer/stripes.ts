import { PAGE_COUNT, PAGE_LENGTH, RADIX } from '../engine/constants';
import { bigIntToDigits, digitsToBigInt } from '../engine/radix';
import { pageAt } from '../engine/location';
import { whenNear } from './near';

const ROWS = 16;
const COLUMNS = 48;

/** ink → rust → lamplight → parchment, one shade per difference value */
const RAMP = (() => {
  const stops = [[0x3a, 0x26, 0x18], [0x8a, 0x3b, 0x26], [0xff, 0xc4, 0x6b], [0xf6, 0xea, 0xd0]];
  return Array.from({ length: RADIX }, (_, v) => {
    const t = (v / (RADIX - 1)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    const f = t - i;
    const c = stops[i]!.map((a, k) => Math.round(a + (stops[i + 1]![k]! - a) * f));
    return `rgb(${c.join(' ')})`;
  });
})();

function randomBelow(limit: bigint): bigint {
  const d = crypto.getRandomValues(new Uint8Array(PAGE_LENGTH)).map((b) => b % RADIX);
  return digitsToBigInt(d) % limit;
}

/** A multiply-and-add shuffle, the obvious alternative: invertible whenever the multiplier isn't a multiple of 29. */
const MULTIPLIER = (() => {
  const a = randomBelow(PAGE_COUNT);
  return a % BigInt(RADIX) === 0n ? a + 1n : a;
})();
const INCREMENT = randomBelow(PAGE_COUNT);
const affine = (place: bigint) => bigIntToDigits((MULTIPLIER * place + INCREMENT) % PAGE_COUNT);

function draw(svg: SVGSVGElement, pageOf: (place: bigint) => Uint8Array, start: bigint) {
  let before = pageOf(start);
  let cells = '';
  for (let row = 0; row < ROWS; row++) {
    const after = pageOf(start + BigInt(row + 1));
    for (let col = 0; col < COLUMNS; col++) {
      const diff = (after[col]! - before[col]! + RADIX) % RADIX;
      cells += `<rect x="${col}" y="${row}" width="1" height="1" fill="${RAMP[diff]}"/>`;
    }
    before = after;
  }
  svg.setAttribute('viewBox', `0 0 ${COLUMNS} ${ROWS}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.innerHTML = cells;
}

export function stripes(root: HTMLElement) {
  const affinePanel = root.querySelector<SVGSVGElement>('[data-panel="affine"]')!;
  const feistelPanel = root.querySelector<SVGSVGElement>('[data-panel="feistel"]')!;
  const render = () => {
    const start = randomBelow(PAGE_COUNT - BigInt(ROWS + 1));
    draw(affinePanel, affine, start);
    draw(feistelPanel, pageAt, start);
  };
  root.querySelector('[data-reroll]')!.addEventListener('click', render);
  whenNear(root, render);
}
