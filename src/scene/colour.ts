/**
 * The same hash and palette as the library shader, in float32 steps, so a book keeps its
 * colour when the real one replaces it on its way off the shelf.
 */
const f = Math.fround;
const fract = (x: number) => f(x - Math.floor(x));

function hash13(x: number, y: number, z: number): number {
  let px = fract(f(f(x) * f(0.1031)));
  let py = fract(f(f(y) * f(0.103)));
  let pz = fract(f(f(z) * f(0.0973)));
  const d = f(f(f(px * f(py + f(33.33))) + f(py * f(pz + f(33.33)))) + f(pz * f(px + f(33.33))));
  px = f(px + d);
  py = f(py + d);
  pz = f(pz + d);
  return fract(f(f(px + py) * pz));
}

const SPINES: readonly (readonly [number, number, number])[] = [
  [0.72, 0.29, 0.2], [0.83, 0.58, 0.25], [0.3, 0.45, 0.42], [0.91, 0.82, 0.64],
  [0.48, 0.27, 0.38], [0.52, 0.55, 0.28], [0.27, 0.33, 0.5], [0.8, 0.45, 0.33],
];

export function spineColour(room: { x: number; y: number }, slot: number): readonly [number, number, number] {
  const t = hash13(f(room.x + f(0.37)), f(room.y + f(0.37)), f(slot * f(1.3)));
  return SPINES[Math.min(7, Math.floor(t * 8))]!;
}
