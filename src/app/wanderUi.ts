export interface WanderUi {
  show(): void;
  hide(): void;
  setPlace(hexagon: bigint): void;
  hover(title: string | null, x: number, y: number): void;
  linkCopied(): void;
  /** The view follows the mouse around a crosshair, or the cursor is free */
  aiming(on: boolean): void;
}

export interface WanderActions {
  go(way: 'east' | 'west' | 'up' | 'down'): void;
  search(): void;
  random(): void;
  share(): void;
}

/** Each control as keys (shown as key caps) or words, and what it does */
type Control = [keys: string[] | string, does: string];

const CONTROLS: Record<'touch' | 'aiming' | 'cursor', Control[]> = {
  touch: [
    ['Drag', 'Look around'],
    ['Tap the floor', 'Walk there'],
    ['Tap a book', 'Read it'],
  ],
  aiming: [
    ['Mouse', 'Look around'],
    [['W', 'A', 'S', 'D'], 'Walk'],
    ['Click', 'Go there, or open a book'],
    ['Right click', 'Free the cursor'],
  ],
  cursor: [
    ['Drag', 'Look around'],
    [['W', 'A', 'S', 'D'], 'Walk'],
    ['Click', 'Go there, or open a book'],
    ['Right click', 'Look with the mouse'],
  ],
};

export function wanderUi(root: HTMLElement, actions: WanderActions): WanderUi {
  const place = root.querySelector<HTMLElement>('[data-place]')!;
  const controls = root.querySelector<HTMLElement>('[data-controls]')!;
  const label = root.querySelector<HTMLElement>('[data-spine]')!;
  const crosshair = root.querySelector<HTMLElement>('[data-crosshair]')!;
  root.querySelectorAll<HTMLButtonElement>('[data-way]').forEach((b) =>
    b.addEventListener('click', () => actions.go(b.dataset.way as 'east' | 'west' | 'up' | 'down')),
  );
  root.querySelector('[data-search]')!.addEventListener('click', actions.search);
  root.querySelector('[data-random]')!.addEventListener('click', actions.random);
  root.querySelector('[data-share-place]')!.addEventListener('click', actions.share);
  const shareLabel = root.querySelector<HTMLElement>('[data-share-place] span')!;
  let shareReset = 0;

  const showControls = (mode: keyof typeof CONTROLS) => {
    controls.replaceChildren(
      ...CONTROLS[mode].flatMap(([keys, does]) => {
        const dt = document.createElement('dt');
        if (Array.isArray(keys)) dt.append(...keys.flatMap((k, i) => [...(i ? [' '] : []), Object.assign(document.createElement('kbd'), { textContent: k })]));
        else dt.textContent = keys;
        return [dt, Object.assign(document.createElement('dd'), { textContent: does })];
      }),
    );
  };
  showControls(matchMedia('(pointer: coarse)').matches ? 'touch' : 'cursor');

  return {
    show() {
      document.body.dataset.state = 'wander';
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
    aiming(on) {
      crosshair.hidden = !on;
      showControls(on ? 'aiming' : 'cursor');
    },
    linkCopied() {
      shareLabel.textContent = 'Link copied';
      clearTimeout(shareReset);
      shareReset = window.setTimeout(() => (shareLabel.textContent = 'Share this place'), 2200);
    },
  };
}
