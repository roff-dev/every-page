import type { Api, Request, Response } from '../worker/protocol';

type Async<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<R> : never };

/**
 * The library's catalogue lives in a worker so BigInt maths never blocks a frame.
 * If the worker dies, the next call starts a fresh one.
 */
function connect(): Async<Api> {
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  const start = () => {
    const w = new Worker(new URL('../worker/catalogue.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }: MessageEvent<Response>) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.ok) p.resolve(data.value);
      else p.reject(new Error(data.error));
    };
    w.onerror = () => {
      for (const p of pending.values()) p.reject(new Error('The catalogue stopped responding.'));
      pending.clear();
      w.terminate();
      worker = null;
    };
    return w;
  };

  const call = (method: keyof Api, args: unknown[]) =>
    new Promise((resolve, reject) => {
      worker ??= start();
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, method, args } as Request);
    });

  return new Proxy({} as Async<Api>, {
    get: (_, method: keyof Api) => (...args: unknown[]) => call(method, args),
  });
}

export const catalogue = connect();
