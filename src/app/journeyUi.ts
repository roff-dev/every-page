import { distance, type Location } from '../engine/location';
import type { JourneyEvents, JourneyTarget } from '../scene';

/** Your volume is always bound in deep rust with lamplight bands, so it can't be mistaken. */
const YOUR_VOLUME = [0.54, 0.2, 0.12] as const;

/**
 * The real distance between hexagons is astronomical, so the flight covers a handful of
 * galleries and floors, chosen from the address so the same search always flies the same way.
 */
export function targetFor(loc: Location): JourneyTarget {
  const h = loc.hexagon;
  const bit = (n: bigint) => Number((h >> n) & 1n);
  return {
    east: bit(0n) ? 1 : -1,
    rooms: 6 + Number((h >> 1n) % 3n),
    floors: (bit(3n) ? 1 : -1) * (4 + Number((h >> 4n) % 3n)),
    wall: loc.wall,
    shelf: loc.shelf,
    volume: loc.volume,
    colour: YOUR_VOLUME,
  };
}

export function ordinal(n: number): string {
  const tens = n % 100;
  const ones = n % 10;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'}`;
}

/** 1.40 × 10^2337, as HTML; small numbers are written out in full. */
function scientific(n: bigint, exponentShift = 0): string {
  const s = (n < 0n ? -n : n).toString();
  if (s.length <= 6 && exponentShift === 0) return Number(s).toLocaleString('en-GB');
  const exp = Math.max(0, s.length - 1 - exponentShift);
  return `${s[0]}.${s.slice(1, 3)} × 10<sup>${exp.toLocaleString('en-GB')}</sup>`;
}

export interface JourneyUi {
  /** short: a shared link's arrival, with no flight to narrate */
  begin(from: bigint, to: Location, short?: boolean): JourneyEvents;
  end(): void;
}

const pageNumber = (p: number, page: number) => Math.max(1, Math.round(1 + p * page));

export function journeyUi(root: HTMLElement, onSkip: () => void): JourneyUi {
  const caption = root.querySelector<HTMLElement>('[data-caption]')!;
  const distanceLine = root.querySelector<HTMLElement>('[data-distance]')!;
  const skip = root.querySelector<HTMLButtonElement>('[data-skip]')!;
  const veil = root.querySelector<HTMLElement>('[data-veil]')!;
  skip.addEventListener('click', onSkip);
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && document.body.dataset.state === 'journey') onSkip();
  });

  const say = (html: string) => {
    caption.classList.remove('shown');
    // let the old line fade before the new one rises
    setTimeout(() => {
      caption.innerHTML = html;
      caption.classList.toggle('shown', html !== '');
    }, 250);
  };

  return {
    begin(from, to, short = false) {
      const { floors, galleries } = distance(from, to.hexagon);
      const floorDigits = (floors < 0n ? -floors : floors).toString().length;
      const direction = floors < 0n ? 'down' : 'up';
      document.body.dataset.state = 'journey';
      skip.hidden = false;
      if (!short) say('Every page that could be written is already here. Yours is far.');
      let lastShift = -1;
      return {
        phase(phase) {
          if (phase === 'arrive') {
            distanceLine.innerHTML = '';
            say('Your page is in the next hexagon.');
          } else if (phase === 'guide') {
            distanceLine.innerHTML = '';
            say(`Follow the light. Wall ${to.wall + 1}, shelf ${to.shelf + 1}, the ${ordinal(to.volume + 1)} volume.`);
          } else if (phase === 'stand') {
            skip.hidden = true;
          } else if (phase === 'pull') {
            say('');
          }
        },
        progress(p) {
          // the remaining distance shrinks through the powers of ten as the flight goes on
          const shift = Math.min(floorDigits - 1, Math.floor(p * p * floorDigits));
          if (shift === lastShift) return;
          lastShift = shift;
          distanceLine.innerHTML = p < 0.97
            ? `${scientific(floors, shift)} floors ${direction}, ${scientific(galleries, shift)} galleries along`
            : '';
        },
        veil(opacity) {
          veil.style.opacity = String(opacity);
        },
        riffle(p) {
          distanceLine.textContent = `Page ${pageNumber(p, to.page)}`;
        },
      };
    },
    end() {
      say('');
      distanceLine.innerHTML = '';
      skip.hidden = true;
      veil.style.opacity = '0';
    },
  };
}
