import { ALPHABET, RADIX } from '../engine/constants';
import { fmix32, sfc32 } from '../engine/random';

const LENGTH = 8;
const HALF = LENGTH / 2;
const PLACES = RADIX ** LENGTH;
const KEYS = [0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344, 0xa4093822, 0x299f31d0];

type Digits = number[];

const spell = (d: Digits) => d.map((v) => ALPHABET[v]).join('');

function placeDigits(place: number): Digits {
  const d: Digits = [];
  for (let i = 0; i < LENGTH; i++) {
    d.unshift(place % RADIX);
    place = Math.floor(place / RADIX);
  }
  return d;
}

/** The same shape as the real round function, at toy size: hash one half, expand the hash into noise. */
function noise(half: Digits, round: number): Digits {
  let h = KEYS[round]!;
  for (const v of half) {
    h = Math.imul(h ^ v, 0x5bd1e995);
    h ^= h >>> 15;
  }
  const next = sfc32(fmix32(h), KEYS[round]!, h ^ 0x9e3779b9, round);
  for (let i = 0; i < 8; i++) next();
  return Array.from({ length: HALF }, () => next() % RADIX);
}

interface Trace {
  page: Digits;
  /** The last round's working, for the note under the table */
  last: { left: Digits; right: Digits; mixed: Digits; sum: Digits } | null;
}

function shuffle(place: number, rounds: number): Trace {
  const d = placeDigits(place);
  let left = d.slice(0, HALF);
  let right = d.slice(HALF);
  let last: Trace['last'] = null;
  for (let r = 0; r < rounds; r++) {
    const mixed = noise(right, r);
    const sum = left.map((v, i) => (v + mixed[i]!) % RADIX);
    last = { left, right, mixed, sum };
    [left, right] = [right, sum];
  }
  return { page: [...left, ...right], last };
}

export function toyFeistel(root: HTMLElement) {
  const slider = root.querySelector<HTMLInputElement>('[data-rounds]')!;
  const output = root.querySelector<HTMLOutputElement>('[data-rounds-value]')!;
  const rows = root.querySelector<HTMLElement>('[data-rows]')!;
  const note = root.querySelector<HTMLElement>('[data-round-note]')!;
  const format = new Intl.NumberFormat('en-GB');
  let start = 0;
  let previous: string[] = [];

  const render = () => {
    const rounds = +slider.value;
    output.value = String(rounds);
    const traces = Array.from({ length: 8 }, (_, i) => shuffle(start + i, rounds));
    const pages = traces.map((t) => spell(t.page));
    rows.replaceChildren(
      ...pages.map((page, row) => {
        const tr = document.createElement('tr');
        const place = document.createElement('td');
        place.textContent = format.format(start + row);
        const cell = document.createElement('td');
        for (const offset of [0, HALF]) {
          const half = document.createElement('span');
          half.className = 'half';
          [...page.slice(offset, offset + HALF)].forEach((ch, i) => {
            const span = document.createElement('span');
            span.className = previous[row] && previous[row]![offset + i] !== ch ? 'ch changed' : 'ch';
            span.textContent = ch;
            half.append(span);
          });
          cell.append(half);
        }
        tr.append(place, cell);
        return tr;
      }),
    );
    previous = pages;
    setTimeout(() => rows.querySelectorAll('.changed').forEach((el) => el.classList.remove('changed')), 700);

    const last = traces[0]!.last;
    note.textContent = last
      ? `Round ${rounds}, first row: the right half “${spell(last.right)}” is mixed into “${spell(last.mixed)}”. ` +
        `Added letter by letter to the left half “${spell(last.left)}”, wrapping past the full stop, that gives “${spell(last.sum)}”. Then the halves swap.`
      : 'No rounds: each page is its place written in base 29, with a for 0, b for 1 and so on up to the full stop for 28.';
  };

  slider.addEventListener('input', render);
  root.querySelectorAll<HTMLButtonElement>('[data-shift]').forEach((b) =>
    b.addEventListener('click', () => {
      start = Math.min(PLACES - 8, Math.max(0, start + Number(b.dataset.shift)));
      previous = [];
      render();
    }),
  );
  render();
}
