/**
 * A structure laid out by the engine, off the thread the drawing runs on
 * (layoutWorker.ts), the worker started the first time it is asked for and
 * kept. Where there are no workers - tests - it is laid out here.
 */
import { layout2D, type Layout2D, type LayoutInput } from "../../../../lib/layout/engine";

type Answer = { id: number; ok: true; layout: Layout2D } | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let asked = 0;
const waiting = new Map<number, { done: (l: Layout2D) => void; fail: (e: Error) => void }>();

function started(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./layoutWorker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<Answer>) => {
    const a = e.data;
    const w8 = waiting.get(a.id);
    if (!w8) return;
    waiting.delete(a.id);
    if (a.ok) w8.done(a.layout);
    else w8.fail(new Error(a.error));
  };
  w.onerror = (e) => {
    // a worker that fails to run fails everything it was asked
    for (const w8 of waiting.values()) w8.fail(new Error(e.message || "the layout worker stopped"));
    waiting.clear();
    worker = null;
  };
  worker = w;
  return w;
}

export function layOut(input: LayoutInput): Promise<Layout2D> {
  if (typeof Worker === "undefined") return Promise.resolve().then(() => layout2D(input));
  return new Promise((done, fail) => {
    const id = ++asked;
    waiting.set(id, { done, fail });
    started().postMessage({ id, input });
  });
}
