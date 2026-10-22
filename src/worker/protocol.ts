import type { Location } from '../engine/location';

export interface Api {
  search(text: string, variant: number): { location: Location; index: bigint; offset: number };
  page(index: bigint): Uint8Array;
  randomIndex(seed: bigint): bigint;
  spine(index: bigint): string;
}

export type Request = { [K in keyof Api]: { id: number; method: K; args: Parameters<Api[K]> } }[keyof Api];
export type Response = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };
