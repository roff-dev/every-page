export interface WanderUi {
  show(): void;
  hide(): void;
  setPlace(hexagon: bigint): void;
  hover(title: string | null, x: number, y: number): void;
  linkCopied(): void;
}

export interface WanderActions {
  go(way: 'east' | 'west' | 'up' | 'down'): void;
  search(): void;
  random(): void;
  share(): void;
}

const HINT_KEY = 'every-page:wander-hint';

export function wanderUi(root: HTMLElement, actions: WanderActions): WanderUi {
  const place = root.querySelector<HTMLElement>('[data-place]')!;
  const hint = root.querySelector<HTMLElement>('[data-hint]')!;
  const label = root.querySelector<HTMLElement>('[data-spine]')!;
  root.querySelectorAll<HTMLButtonElement>('[data-way]').forEach((b) =>
    b.addEventListener('click', () => actions.go(b.dataset.way as 'east' | 'west' | 'up' | 'down')),
  );
  root.querySelector('[data-search]')!.addEventListener('click', actions.search);
  root.querySelector('[data-random]')!.addEventListener('click', actions.random);
  root.querySelector('[data-share-place]')!.addEventListener('click', actions.share);
  const shareLabel = root.querySelector<HTMLElement>('[data-share-place] span')!;
  let shareReset = 0;

  const coarse = matchMedia('(pointer: coarse)').matches;
  hint.textContent = coarse
    ? 'Drag to look around. Tap the floor to walk there, or a book to read it.'
    : 'Drag to look around. Walk with W A S D or the arrow keys. Click a book to read it.';

  return {
    show() {
      document.body.dataset.state = 'wander';
      let seen = false;
      try {
        seen = localStorage.getItem(HINT_KEY) === '1';
        localStorage.setItem(HINT_KEY, '1');
      } catch {
        // storage can be unavailable; the hint just shows again
      }
      hint.hidden = seen;
      if (!seen) setTimeout(() => (hint.hidden = true), 7000);
      // coming back from a closed book (or a skipped journey) leaves focus nowhere useful
      const active = document.activeElement;
      if (!active || active === document.body || active.closest('.reader')) {
        [...root.querySelectorAll<HTMLElement>('button')].find((b) => b.getClientRects().length > 0)?.focus({ preventScroll: true });
      }
    },
    hide() {
      label.hidden = true;
    },
    setPlace(hexagon) {
      const h = hexagon.toString(36);
      place.textContent = h.length > 18 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h;
      place.title = `Hexagon ${h.slice(0, 40)}…`;
    },
    hover(title, x, y) {
      label.hidden = title === null;
      if (title === null) return;
      label.textContent = title;
      label.style.translate = `${Math.round(x + 14)}px ${Math.round(y - 30)}px`;
    },
    linkCopied() {
      shareLabel.textContent = 'Link copied';
      clearTimeout(shareReset);
      shareReset = window.setTimeout(() => (shareLabel.textContent = 'Share this place'), 2200);
    },
  };
}
