import { shelf } from './shelf';
import { toyFeistel } from './toyFeistel';
import { stripes } from './stripes';
import { backwards } from './backwards';
import { wholeNumber } from './wholeNumber';
import { spiral } from './spiral';

const figures: [string, (root: HTMLElement) => void][] = [
  ['[data-shelf]', shelf],
  ['[data-feistel]', toyFeistel],
  ['[data-stripes]', stripes],
  ['[data-search]', backwards],
  ['[data-number]', wholeNumber],
  ['[data-spiral]', spiral],
];

export function explain() {
  for (const [selector, init] of figures) {
    const root = document.querySelector<HTMLElement>(selector);
    if (root) init(root);
  }
  trackContents();
}

/** Light up the contents entry for the section being read. */
function trackContents() {
  const links = new Map(
    [...document.querySelectorAll<HTMLAnchorElement>('.contents a')].map((a) => [a.hash.slice(1), a]),
  );
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a) => a.removeAttribute('aria-current'));
        links.get(e.target.id)?.setAttribute('aria-current', 'true');
      }
    },
    { rootMargin: '-35% 0px -60% 0px' },
  );
  links.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });
}
