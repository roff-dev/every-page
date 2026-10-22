import type { Api, Request, Response } from '../worker/protocol';

type Async<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<R> : never };

const TIMEOUT_MS = 10_000;

/**
 * The library's catalogue lives in a worker so BigInt maths never blocks a frame.
 * If the worker dies or stops answering, the call fails and the next one starts a fresh worker.
 */
function connect(): Async<Api> {
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: number }>();

  const fail = (w: Worker) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("The catalogue didn't answer."));
    }
    pending.clear();
    w.terminate();
    if (worker === w) worker = null;
  };

  const start = () => {
    const w = new Worker(new URL('../worker/catalogue.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }: MessageEvent<Response>) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      clearTimeout(p.timer);
      if (data.ok) p.resolve(data.value);
      else p.reject(new Error(data.error));
    };
    w.onerror = () => fail(w);
    return w;
  };

  const call = (method: keyof Api, args: unknown[]) =>
    new Promise((resolve, reject) => {
      const w = (worker ??= start());
      const id = nextId++;
      pending.set(id, { resolve, reject, timer: window.setTimeout(() => fail(w), TIMEOUT_MS) });
      w.postMessage({ id, method, args } as Request);
    });

  return new Proxy({} as Async<Api>, {
    get: (_, method: keyof Api) => (...args: unknown[]) => call(method, args),
  });
}

export const catalogue = connect();
