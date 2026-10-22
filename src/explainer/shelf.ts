const LETTERS = ['n', 'o'] as const;
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

/** The eight-page library: three letters from two symbols, so a page's spelling is its place on the shelf. */
export function shelf(root: HTMLElement) {
  const tiles = [...root.querySelectorAll<HTMLButtonElement>('[data-tile]')];
  const books = [...root.querySelectorAll<HTMLButtonElement>('[data-book]')];
  const readout = root.querySelector<HTMLElement>('[data-readout]')!;
  let value = 0;

  const mono = (text: string) => Object.assign(document.createElement('span'), { className: 'mono', textContent: text });

  const show = () => {
    const page = [2, 1, 0].map((bit) => LETTERS[(value >> bit) & 1]).join('');
    tiles.forEach((tile, i) => {
      tile.textContent = page[i]!;
      tile.setAttribute('aria-label', `Letter ${i + 1}: ${page[i]}`);
    });
    books.forEach((book, i) => book.setAttribute('aria-pressed', String(i === value)));
    root.style.setProperty('--lit-x', `${((value + 0.5) / 8) * 100}%`);
    const nth = ORDINALS[value]!;
    readout.replaceChildren(
      mono(page),
      ` is the ${nth} book. Read `,
      mono('n'),
      ' as 0 and ',
      mono('o'),
      ` as 1, and the page is ${value.toString(2).padStart(3, '0')} in binary: ${value}, the ${nth} place on the shelf.`,
    );
  };

  const setLetter = (i: number, letter: number) => {
    const bit = 2 - i;
    value = (value & ~(1 << bit)) | (letter << bit);
    show();
  };

  tiles.forEach((tile, i) => {
    tile.addEventListener('click', () => setLetter(i, ((value >> (2 - i)) & 1) ^ 1));
    tile.addEventListener('keydown', (e) => {
      const letter = LETTERS.indexOf(e.key.toLowerCase() as 'n' | 'o');
      if (letter < 0) return;
      e.preventDefault();
      setLetter(i, letter);
      tiles[i + 1]?.focus();
    });
  });
  books.forEach((book, i) =>
    book.addEventListener('click', () => {
      value = i;
      show();
    }),
  );
  show();
}
