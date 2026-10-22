export interface Tier {
  name: 'high' | 'medium' | 'low';
  roomsX: number; // rooms drawn each side along the galleries
  roomsY: number; // floors drawn each side
  bookRoomsY: number; // floors either side that get real books (always ±1 room along x)
  pixelRatio: number;
  antialias: boolean;
  glow: boolean;
}

export const TIERS: Record<Tier['name'], Tier> = {
  high: { name: 'high', roomsX: 5, roomsY: 7, bookRoomsY: 1, pixelRatio: 2, antialias: true, glow: true },
  medium: { name: 'medium', roomsX: 4, roomsY: 5, bookRoomsY: 1, pixelRatio: 1.5, antialias: true, glow: true },
  low: { name: 'low', roomsX: 3, roomsY: 4, bookRoomsY: 0, pixelRatio: 1.25, antialias: false, glow: false },
};

/** A first guess from the device; the frame-time watcher can only step down from here. */
export function initialTier(): Tier {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (coarse && (cores <= 4 || memory <= 4)) return TIERS.low;
  if (coarse) return TIERS.medium;
  return TIERS.high;
}

export function lowerTier(t: Tier): Tier | null {
  return t.name === 'high' ? TIERS.medium : t.name === 'medium' ? TIERS.low : null;
}

/**
 * Watches frame times; after a settling period, if the slowest tenth of frames are over budget,
 * asks for one step down. Never steps back up within a session, so quality doesn't oscillate.
 */
export class FrameWatch {
  private samples: number[] = [];
  private settledAt = 0;

  constructor(private readonly onSlow: () => void, private readonly budgetMs = 20, private readonly windowMs = 2000) {}

  reset(now: number) {
    this.samples = [];
    this.settledAt = now + 1000;
  }

  sample(now: number, frameMs: number) {
    if (now < this.settledAt) return;
    this.samples.push(frameMs);
    if (this.samples.length * 16 < this.windowMs) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)]!;
    this.samples = [];
    if (p90 > this.budgetMs) this.onSlow();
  }
}
