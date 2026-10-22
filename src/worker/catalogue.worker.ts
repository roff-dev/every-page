/// <reference lib="webworker" />
import { PAGES_PER_VOLUME } from '../engine/constants';
import { pageAt } from '../engine/location';
import { spineTitle } from '../engine/random';
import { indexFromSeed, search } from '../engine/search';
import type { Api, Request, Response } from './protocol';

const api: Api = {
  search: (text, variant) => search(text, variant),
  page: (index) => pageAt(index),
  randomIndex: (seed) => indexFromSeed(seed),
  spine: (index) => spineTitle(index / BigInt(PAGES_PER_VOLUME)),
};

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = ({ data }: MessageEvent<Request>) => {
  let reply: Response;
  try {
    const value = (api[data.method] as (...a: unknown[]) => unknown)(...data.args);
    reply = { id: data.id, ok: true, value };
    scope.postMessage(reply, value instanceof Uint8Array ? [value.buffer] : []);
  } catch (e) {
    reply = { id: data.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    scope.postMessage(reply);
  }
};
