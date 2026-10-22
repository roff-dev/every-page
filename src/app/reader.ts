import '@fontsource/courier-prime/400.css';
import './reader.css';
import { COLUMNS, LINES, PAGE_COUNT, PAGES_PER_VOLUME } from '../engine/constants';
import { digitsToText } from '../engine/alphabet';
import { fromIndex, type Location } from '../engine/location';
import { catalogue } from './catalogue';

export interface ReaderOptions {
  /** Index of the page the reader opens on */
  index: bigint;
  /** Where the visitor's own text sits on that page, if anywhere */
  highlight: { offset: number; length: number } | null;
  /** Called with the pages moved from the opening page, whenever the page changes */
  onMove(offset: bigint): void;
  onElsewhere: (() => void) | null;
  onClose(): void;
}

export interface Reader {
  close(): void;
}

const number = new Intl.NumberFormat('en-GB');
/** Courier Prime's advance width and the page's line spacing, in ems */
const CHAR_WIDTH = 0.6;
const LINE_HEIGHT = 1.42;
const cache = new Map<bigint, string>();

async function pageText(index: bigint): Promise<string> {
  const hit = cache.get(index);
  if (hit !== undefined) return hit;
  const text = digitsToText(await catalogue.page(index));
  cache.set(index, text);
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  return text;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
};

/** Opens the reading view over the scene. */
export function openReader(opts: ReaderOptions): Reader {
  const start = opts.index;
  let index = start;
  const phone = matchMedia('(max-width: 47.99rem)');
  let view: 'reading' | 'page' = phone.matches ? 'reading' : 'page';

  const title = el('h2', { className: 'reader-title', id: 'reader-title' });
  const plate = el('dl', { className: 'plate' });
  const pageArea = el('div', { className: 'leaf', tabIndex: -1 });
  const counter = el('output', { className: 'page-count' });
  const status = el('p', { className: 'visually-hidden', role: 'status' });
  const toast = el('p', { className: 'toast', role: 'status' });

  const button = (label: string, className: string, onClick: () => void, aria?: string) => {
    const b = el('button', { type: 'button', className, textContent: label });
    if (aria) b.setAttribute('aria-label', aria);
    b.addEventListener('click', onClick);
    return b;
  };
  const prev = button('‹', 'turn prev', () => go(index - 1n), 'Previous page');
  const next = button('›', 'turn next', () => go(index + 1n), 'Next page');
  const prevVol = button('Previous volume', 'link', () => go(index - BigInt(PAGES_PER_VOLUME)));
  const nextVol = button('Next volume', 'link', () => go(index + BigInt(PAGES_PER_VOLUME)));
  const toggle = button('', 'link toggle', () => {
    view = view === 'reading' ? 'page' : 'reading';
    void render();
  });

  const jumpField = el('input', { type: 'number', min: '1', max: String(PAGES_PER_VOLUME), inputMode: 'numeric', className: 'jump' });
  jumpField.setAttribute('aria-label', 'Go to page');
  const jump = el('form', { className: 'jump-form' }, el('label', { textContent: 'Go to page' }, jumpField));
  jump.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = Number(jumpField.value);
    if (!Number.isInteger(n) || n < 1 || n > PAGES_PER_VOLUME) return;
    const loc = fromIndex(index);
    go(index - BigInt(loc.page) + BigInt(n - 1));
    jumpField.value = '';
  });

  const actions = el('div', { className: 'actions' },
    button('Copy page', 'link', async () => {
      const text = await pageText(index);
      const lines = Array.from({ length: LINES }, (_, i) => text.slice(i * COLUMNS, (i + 1) * COLUMNS));
      await navigator.clipboard.writeText(lines.join('\n'));
      say('Page copied');
    }),
    button('Share', 'link', async () => {
      const url = location.origin + location.pathname + location.hash;
      if (navigator.share) {
        try {
          await navigator.share({ title: document.title, url });
        } catch {
          // dismissed
        }
      } else {
        await navigator.clipboard.writeText(url);
        say('Link copied');
      }
    }),
    ...(opts.onElsewhere ? [button('Find it elsewhere', 'link', opts.onElsewhere)] : []),
  );
  const close = button('Close', 'close', () => opts.onClose(), 'Close the book');

  const dialog = el('section', { className: 'reader', role: 'dialog' },
    el('header', { className: 'reader-head' }, title, close),
    plate,
    el('div', { className: 'leaf-wrap' }, pageArea),
    el('nav', { className: 'reader-nav', ariaLabel: 'Pages' }, prev, counter, next),
    el('footer', { className: 'reader-foot' }, prevVol, nextVol, toggle, jump, actions),
    status,
    toast,
  );
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'reader-title');
  document.body.append(dialog);
  const opener = document.activeElement as HTMLElement | null;
  requestAnimationFrame(() => dialog.classList.add('shown'));

  // size the type so all 40 lines of 80 characters fit the space left for the page
  const wrap = dialog.querySelector<HTMLElement>('.leaf-wrap')!;
  const fit = () => {
    const pad = parseFloat(getComputedStyle(pageArea).paddingLeft) * 2 + 4;
    const byWidth = (wrap.clientWidth - pad) / (COLUMNS * CHAR_WIDTH);
    const byHeight = (wrap.clientHeight - pad) / (LINES * LINE_HEIGHT);
    pageArea.style.setProperty('--page-size', `${Math.max(4.5, Math.min(15, byWidth, byHeight)).toFixed(2)}px`);
  };
  const resize = new ResizeObserver(fit);
  resize.observe(wrap);

  function say(message: string) {
    toast.textContent = message;
    toast.classList.add('shown');
    setTimeout(() => toast.classList.remove('shown'), 1800);
  }

  function go(to: bigint) {
    if (to < 0n || to >= PAGE_COUNT) return;
    index = to;
    opts.onMove(index - start);
    void render();
  }

  async function render() {
    const loc = fromIndex(index);
    let text: string;
    try {
      text = await pageText(index);
    } catch {
      if (fromIndex(index).page !== loc.page) return;
      pageArea.replaceChildren(
        el('p', { className: 'trouble' }, "The catalogue didn't answer. ", button('Try again', 'link', () => void render())),
      );
      return;
    }
    if (fromIndex(index).page !== loc.page) return; // a newer page was asked for meanwhile
    renderPlate(loc);
    counter.innerHTML = `Page <b>${loc.page + 1}</b> of ${PAGES_PER_VOLUME}`;
    toggle.textContent = view === 'reading' ? 'Whole page' : 'Reading view';
    toggle.hidden = !phone.matches;
    const highlight = index === start ? opts.highlight : null;
    pageArea.replaceChildren(view === 'reading' && phone.matches ? readingView(text, highlight) : facsimile(text, highlight));
    pageArea.querySelector('mark')?.scrollIntoView({ block: 'center', inline: 'nearest' });
    pageArea.setAttribute('aria-label', `Page ${loc.page + 1} of ${PAGES_PER_VOLUME}`);
    status.textContent = `Page ${loc.page + 1} of ${PAGES_PER_VOLUME}`;
    void catalogue.spine(index).then((s) => (title.textContent = s), () => undefined);
    // the next and previous pages are usually wanted next
    for (const d of [1n, -1n, 2n]) if (index + d >= 0n && index + d < PAGE_COUNT) void pageText(index + d).catch(() => undefined);
  }

  function renderPlate(loc: Location) {
    const hex = loc.hexagon.toString(36);
    const short = hex.length > 22 ? `${hex.slice(0, 10)}…${hex.slice(-8)}` : hex;
    const hexValue = el('dd', { className: 'hex' }, el('span', { textContent: short }));
    if (hex.length > 22) {
      const full = el('div', { className: 'hex-full', hidden: true },
        el('p', { textContent: `${number.format(hex.length)} characters` }),
        el('code', { textContent: hex }),
        button('Copy address', 'link', async () => {
          await navigator.clipboard.writeText(`${hex}.${loc.wall + 1}.${loc.shelf + 1}.${loc.volume + 1}.${loc.page + 1}`);
          say('Address copied');
        }),
      );
      const expand = button('Show all', 'link', () => {
        full.hidden = !full.hidden;
        expand.textContent = full.hidden ? 'Show all' : 'Hide';
        expand.setAttribute('aria-expanded', String(!full.hidden));
      });
      expand.setAttribute('aria-expanded', 'false');
      hexValue.append(' ', expand, full);
    }
    const field = (name: string, value: string | HTMLElement, className = 'field') =>
      el('div', { className }, el('dt', { textContent: name }), value instanceof HTMLElement ? value : el('dd', { textContent: value }));
    plate.replaceChildren(
      field('Hexagon', hexValue, 'field hex-field'),
      field('Wall', String(loc.wall + 1)),
      field('Shelf', String(loc.shelf + 1)),
      field('Volume', String(loc.volume + 1)),
    );
  }

  // keyboard: arrows turn pages, shift+arrows change volume, Escape closes
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    const step = e.shiftKey ? BigInt(PAGES_PER_VOLUME) : 1n;
    if (e.key === 'ArrowRight') go(index + step);
    else if (e.key === 'ArrowLeft') go(index - step);
    else if (e.key === 'Home') go(index - BigInt(fromIndex(index).page));
    else if (e.key === 'End') go(index - BigInt(fromIndex(index).page) + BigInt(PAGES_PER_VOLUME - 1));
    else if (e.key === 'Escape') opts.onClose();
    else return;
    e.preventDefault();
  };
  addEventListener('keydown', onKey);

  // swipe to turn on touch
  let swipeX = 0;
  let swipeY = 0;
  pageArea.addEventListener('pointerdown', (e) => {
    swipeX = e.clientX;
    swipeY = e.clientY;
  });
  pageArea.addEventListener('pointerup', (e) => {
    const dx = e.clientX - swipeX;
    if (e.pointerType !== 'mouse' && Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(e.clientY - swipeY)) go(index + (dx < 0 ? 1n : -1n));
  });

  void render().then(() => pageArea.focus({ preventScroll: true }));

  return {
    close() {
      removeEventListener('keydown', onKey);
      resize.disconnect();
      dialog.classList.remove('shown');
      setTimeout(() => dialog.remove(), 450);
      opener?.focus?.();
    },
  };
}

/** The page as it is: 40 lines of 80 characters. */
function facsimile(text: string, highlight: { offset: number; length: number } | null) {
  const pre = el('pre', { className: 'facsimile' });
  for (let i = 0; i < LINES; i++) {
    pre.append(...markLine(text, i * COLUMNS, (i + 1) * COLUMNS, highlight), '\n');
  }
  return pre;
}

/** The same lines, wrapped to the screen and numbered, for reading on a phone. */
function readingView(text: string, highlight: { offset: number; length: number } | null) {
  const ol = el('ol', { className: 'lines' });
  for (let i = 0; i < LINES; i++) ol.append(el('li', {}, ...markLine(text, i * COLUMNS, (i + 1) * COLUMNS, highlight)));
  return ol;
}

function markLine(text: string, a: number, b: number, highlight: { offset: number; length: number } | null): (string | HTMLElement)[] {
  if (!highlight) return [text.slice(a, b)];
  const s = Math.max(a, highlight.offset);
  const e = Math.min(b, highlight.offset + highlight.length);
  if (s >= e) return [text.slice(a, b)];
  return [text.slice(a, s), el('mark', { textContent: text.slice(s, e) }), text.slice(e, b)];
}
