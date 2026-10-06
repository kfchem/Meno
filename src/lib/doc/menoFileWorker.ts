/**
 * A workspace file written off the page (./menoFile): the files it keeps
 * compressed here, where a long one cannot hold up the canvas. One message
 * each way; the bytes handed back, not copied.
 */
import { menoFileBytes, type KeptData } from "./menoFile";

self.onmessage = (e: MessageEvent<{ id: number; workspace: string; files: KeptData[] }>) => {
  const { id, workspace, files } = e.data;
  try {
    const bytes = menoFileBytes(workspace, files);
    self.postMessage({ id, ok: true, bytes }, { transfer: [bytes.buffer] });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
