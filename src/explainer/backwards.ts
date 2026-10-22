import { COLUMNS, LINES } from '../engine/constants';
import { digitsToText, normalise } from '../engine/alphabet';
import { formatLink } from '../engine/links';
import { catalogue } from '../app/catalogue';
import { whenNear } from './near';

/** Search, shown step by step: the words, the page made for them, and where that page is shelved. */
export function backwards(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>('[data-words]')!;
  const read = root.querySelector<HTMLElement>('[data-read]')!;
  const filler = root.querySelector<HTMLElement>('[data-filler]')!;
  const page = root.querySelector<HTMLElement>('[data-page]')!;
  const address = root.querySelector<HTMLElement>('[data-address]')!;
  const walk = root.querySelector<HTMLAnchorElement>('[data-walk]')!;
  let latest = 0;
  let timer = 0;

  const run = async () => {
    const text = normalise(input.value).text;
    const ticket = ++latest;
    read.textContent = text || '…';
    if (!text) {
      walk.hidden = true;
      return;
    }
    const found = await catalogue.search(text, 0);
    const digits = await catalogue.page(found.index);
    if (ticket !== latest) return;

    filler.textContent = `It fills a page with random letters, seeded by your words themselves, and writes them in at character ${(found.offset + 1).toLocaleString('en-GB')}.`;
    const all = digitsToText(digits);
    const end = found.offset + text.length;
    const lines: Node[] = [];
    for (let l = 0; l < LINES; l++) {
      const from = l * COLUMNS;
      const to = from + COLUMNS;
      const a = Math.max(from, found.offset);
      const b = Math.min(to, end);
      if (a < b) {
        const mark = document.createElement('mark');
        mark.textContent = all.slice(a, b);
        lines.push(document.createTextNode(all.slice(from, a)), mark, document.createTextNode(all.slice(b, to)));
      } else lines.push(document.createTextNode(all.slice(from, to)));
      if (l < LINES - 1) lines.push(document.createTextNode('\n'));
    }
    page.replaceChildren(...lines);

    const { hexagon, wall, shelf, volume, page: p } = found.location;
    const h = hexagon.toString(36);
    address.textContent =
      `That number is an address: hexagon ${h.slice(0, 10)}…${h.slice(-8)} (${h.length.toLocaleString('en-GB')} characters in full), ` +
      `wall ${wall + 1}, shelf ${shelf + 1}, volume ${volume + 1}, page ${p + 1}.`;
    walk.href = '/' + formatLink({ anchor: { kind: 'query', text, variant: 0 }, offset: 0n });
    walk.hidden = false;
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void run(), 160);
  });
  whenNear(root, () => void run());
}
