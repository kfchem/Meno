/**
 * The readers that come with Meno, off the main thread: what they make of
 * a file, and the promises they gave, worked out where a long file cannot
 * hold up the canvas. One message each way, answers matched by id.
 */
import { cubeGrid, readCube } from "./cube";

type Question = { id: number; reader: string; op: "read" | "ask"; name: string; text: string; key?: string };

const READERS: Record<string, { read(name: string, text: string): unknown; ask(key: string, name: string, text: string): unknown }> = {
  cube: { read: readCube, ask: (key, name, text) => cubeGrid(name, text, key) },
};

self.onmessage = (e: MessageEvent<Question>) => {
  const q = e.data;
  try {
    const reader = READERS[q.reader];
    if (!reader) throw new Error(`no reader ${q.reader} comes with Meno`);
    const result = q.op === "read" ? reader.read(q.name, q.text) : reader.ask(q.key ?? "", q.name, q.text);
    self.postMessage({ id: q.id, ok: true, result });
  } catch (err) {
    self.postMessage({ id: q.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
