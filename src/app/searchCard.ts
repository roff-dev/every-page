import { normalise, type Normalised } from '../engine/alphabet';
import { PAGE_LENGTH } from '../engine/constants';

export interface SearchCard {
  /** The text as the library will hold it, or null if there's nothing to search for. */
  value(): string | null;
  setBusy(busy: boolean): void;
  /** Say the catalogue didn't answer, offering to try again; null clears it. */
  trouble(retry: (() => void) | null): void;
}

const PREVIEW_CHARS = 180;
const COUNTER_FROM = 3000;
const number = new Intl.NumberFormat('en-GB');

export function searchCard(form: HTMLFormElement, onSearch: (text: string) => void): SearchCard {
  const field = form.querySelector('textarea')!;
  const find = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const readsAs = form.querySelector<HTMLElement>('[data-reads-as]')!;
  const note = form.querySelector<HTMLElement>('[data-note]')!;
  const counter = form.querySelector<HTMLElement>('[data-counter]')!;
  const troubleLine = form.querySelector<HTMLElement>('[data-trouble]')!;
  let retry: (() => void) | null = null;
  form.querySelector('[data-retry]')!.addEventListener('click', () => {
    const again = retry;
    troubleLine.hidden = true;
    retry = null;
    again?.();
  });
  let current: Normalised = normalise('');
  let announce = 0;

  const render = () => {
    current = normalise(field.value);
    const { text, changes, removed, truncated } = current;
    find.disabled = text.trim() === '';

    const altered = changes.filter((c) => c.kind === 'altered');
    readsAs.hidden = altered.length === 0 && removed.length === 0 && !truncated;
    if (!readsAs.hidden) {
      const marks = new Set<number>();
      for (const c of altered) if (c.kind === 'altered') for (let i = 0; i < c.to.length; i++) marks.add(c.at + i);
      const shown = text.slice(0, PREVIEW_CHARS);
      const out = readsAs.querySelector('q')!;
      out.replaceChildren();
      for (let i = 0; i < shown.length; ) {
        const marked = marks.has(i);
        let j = i;
        while (j < shown.length && marks.has(j) === marked) j++;
        const piece = shown.slice(i, j);
        out.append(marked ? Object.assign(document.createElement('u'), { textContent: piece }) : piece);
        i = j;
      }
      if (text.length > PREVIEW_CHARS) out.append('…');
    }

    const lines: string[] = [];
    if (removed.some((c) => /\p{N}/u.test(c))) lines.push('Numbers aren’t in this alphabet, so spell them out.');
    const others = removed.filter((c) => !/\p{N}/u.test(c));
    if (others.length) lines.push(`Not in this alphabet, so left out: ${others.slice(0, 8).join(' ')}${others.length > 8 ? ' …' : ''}`);
    if (truncated) lines.push(`A page holds ${number.format(PAGE_LENGTH)} characters. I’ve kept the first ${number.format(PAGE_LENGTH)}.`);
    // the note is announced once typing pauses, not on every keystroke
    clearTimeout(announce);
    announce = window.setTimeout(() => (note.textContent = lines.join(' ')), 600);
    note.hidden = lines.length === 0;
    if (lines.length === 0) note.textContent = '';

    counter.hidden = text.length < COUNTER_FROM;
    counter.textContent = `${number.format(text.length)} of ${number.format(PAGE_LENGTH)}`;
  };

  field.addEventListener('input', render);
  field.addEventListener('keydown', (e) => {
    // Enter searches; Shift+Enter makes a new line, as in a chat box
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = current.text;
    if (text.trim() === '' || find.disabled) return;
    onSearch(text);
  });
  // keep the card in view above an on-screen keyboard
  field.addEventListener('focus', () => {
    if (matchMedia('(pointer: coarse)').matches) setTimeout(() => form.scrollIntoView({ block: 'end', behavior: 'smooth' }), 300);
  });

  render();
  return {
    value: () => (current.text.trim() ? current.text : null),
    setBusy(busy) {
      find.disabled = busy || current.text.trim() === '';
      form.toggleAttribute('aria-busy', busy);
    },
    trouble(again) {
      retry = again;
      troubleLine.hidden = again === null;
    },
  };
}
