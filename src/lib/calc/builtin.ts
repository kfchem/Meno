/**
 * The readers that come with Meno (lib/calc/catalog `BuiltinReader`), asked
 * as a plugin's worker is - the same `Reader` - but run in the app, in a
 * worker of its own (./builtinWorker), started the first time one is asked.
 * Taking one out of Meno is taking it out of the catalog and of the worker.
 */
import type { Reader } from "./client";
import type { ReaderOutput } from "./output";

type Answer = { id: number; ok: boolean; result?: unknown; error?: string };

let worker: Worker | null = null;
let next = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function ask(question: Record<string, unknown>): Promise<unknown> {
  if (!worker) {
    worker = new Worker(new URL("./builtinWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<Answer>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error ?? "the reader could not read it"));
    };
  }
  const id = next++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, ...question });
  });
}

/** A reader that comes with Meno, by its id, as a `Reader`. */
export function builtinReader(id: string): Reader {
  return {
    version: "",
    read: (name, text) => ask({ reader: id, op: "read", name, text }) as Promise<ReaderOutput>,
    ask: (key, name, text) => ask({ reader: id, op: "ask", key, name, text }),
  };
}
