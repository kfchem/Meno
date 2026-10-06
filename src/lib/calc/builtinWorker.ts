/**
 * Meno's own reading (./menoReads), off the main thread: what it makes of a
 * file of a kind, and the promises it gave, worked out where a long file
 * cannot hold up the canvas. One message each way, answers matched by id,
 * their runs of numbers in buffers handed over (./packed).
 */
import { menoAnswer, type MenoQuestion } from "./menoReads";
import { pack } from "./packed";

self.onmessage = (e: MessageEvent<MenoQuestion & { id: number }>) => {
  const q = e.data;
  try {
    const { packed, transfer } = pack(menoAnswer(q));
    self.postMessage({ id: q.id, ok: true, result: packed }, { transfer });
  } catch (err) {
    self.postMessage({ id: q.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
