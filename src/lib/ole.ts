/**
 * Structures in Office documents, on Windows (src-tauri/src/ole.rs): Word
 * or PowerPoint asks Meno to open one - a double-click on it - and Meno
 * hands the document the structure back, its record and its picture, as it
 * is edited. Nothing of this happens elsewhere, or outside the app.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toBase64 } from "./clipboard";

/** A structure a document asked to have opened: which object, what it holds, and what the document calls it. */
export type OfficeStructure = { id: number; record: string; name: string };

/** Whether Windows started this Meno for a document (src-tauri/src/ole.rs). */
export async function startedForOffice(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("ole_started_for_office");
}

/** The structures asked for since the last look. */
export async function takeOfficeStructures(): Promise<OfficeStructure[]> {
  if (!isTauri()) return [];
  return invoke<OfficeStructure[]>("ole_take_pending");
}

/**
 * `onOpen` when a document asks for a structure to be opened, and `onClose`
 * (with the object) when it is done with one; stops listening when the
 * function returned is called.
 */
export function watchOffice(onOpen: () => void, onClose: (id: number) => void): () => void {
  if (!isTauri()) return () => {};
  const stops = [listen("ole-open", () => onOpen()), listen<number>("ole-close", (e) => onClose(e.payload))];
  return () => stops.forEach((s) => void s.then((stop) => stop()));
}

/** The structure drawn afresh: its document takes the record and the picture. */
export async function sendToOffice(id: number, record: string, emf: Uint8Array): Promise<void> {
  if (!isTauri()) return;
  await invoke("ole_update", { id, record, emf: toBase64(emf) });
}

/** Done with the structure: its document is told, and shows it as its own again. */
export async function letOfficeGo(id: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("ole_close", { id });
}
