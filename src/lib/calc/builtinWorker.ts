/**
 * Meno's own reading (./menoReads), off the main thread: what it makes of a
 * file of a kind, and the promises it gave, worked out where a long file
 * cannot hold up the canvas. One message each way, answers matched by id.
 */
import { MENO_READS } from "./menoReads";

type Question = { id: number; kind: string; op: "read" | "ask"; name: string; text: string; key?: string };

self.onmessage = (e: MessageEvent<Question>) => {
  const q = e.data;
  try {
    const reads = MENO_READS[q.kind];
    if (!reads) throw new Error(`Meno does not read ${q.kind} itself`);
    const result = q.op === "read" ? reads.read(q.name, q.text) : reads.ask(q.key ?? "", q.name, q.text);
    self.postMessage({ id: q.id, ok: true, result });
  } catch (err) {
    self.postMessage({ id: q.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
