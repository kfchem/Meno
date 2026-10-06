/**
 * A workspace file written (./menoFile), off the page in a worker of its own
 * (./menoFileWorker), started the first time a workspace is saved; where
 * there is no worker to be had - the tests - in place.
 */
import { menoFileBytes, type KeptData } from "./menoFile";

let worker: Worker | null = null;
let next = 1;
const pending = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>();

/** A workspace's file: its JSON, and the files it keeps. */
export function writeMenoFile(workspace: string, files: readonly KeptData[]): Promise<Uint8Array> {
  if (typeof Worker === "undefined") return Promise.resolve().then(() => menoFileBytes(workspace, files));
  if (!worker) {
    worker = new Worker(new URL("./menoFileWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; bytes?: Uint8Array; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok && e.data.bytes) p.resolve(e.data.bytes);
      else p.reject(new Error(e.data.error ?? "the workspace could not be written"));
    };
    // (a worker that stops fails what waits on it, and the next save starts it afresh)
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(`The workspace could not be written: ${e.message || "its worker failed"}`));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const id = next++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, workspace, files });
  });
}
