/**
 * Meno's own reading (./menoReads), asked as a plugin's worker is - the same
 * `Reader` - but run in the app, in a web worker of its own
 * (./builtinWorker), started the first time it is asked.
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

/** Meno's own reading, as a `Reader`. It tells no kind by asking: Meno's kinds are told by their marks and layouts (lib/io/kinds). */
export function menoReader(): Reader {
  return {
    version: "",
    read: (kind, name, text) => ask({ kind, op: "read", name, text }) as Promise<ReaderOutput>,
    ask: (kind, key, name, text) => ask({ kind, op: "ask", key, name, text }),
    probe: async () => false,
  };
}
