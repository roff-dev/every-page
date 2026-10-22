import { PAGE_COUNT } from '../engine/constants';

export function wholeNumber(root: HTMLElement) {
  const details = root as HTMLDetailsElement;
  const digits = root.querySelector<HTMLElement>('[data-digits]')!;
  details.addEventListener('toggle', () => {
    if (details.open && !digits.textContent) digits.textContent = PAGE_COUNT.toString();
  });
}
