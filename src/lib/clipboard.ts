/**
 * The system clipboard for structures, by the app's own commands
 * (src-tauri/src/clipboard.rs): the webview's clipboard reaches plain text
 * only, and a structure travels as more than that - Meno's own record of it,
 * and a MOL file under the names chemistry programs look for.
 *
 * Outside the app (the tests, a browser) the clipboard is one of its own.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * A kind of data on the clipboard:
 * - `meno`: Meno's own record of a structure, nothing lost;
 * - `mol`: a MOL file, for other chemistry programs;
 * - `text`: plain text.
 *
 * Plain text is never put beside a structure: PowerPoint pastes it as a
 * text box in preference to anything else offered with it.
 */
export type Flavor = "meno" | "mol" | "text";

export type ClipItem = { flavor: Flavor; text: string };

let own: ClipItem[] = [];

/** Puts `items` on the clipboard, in place of whatever was there. */
export async function writeClipboard(items: ClipItem[]): Promise<void> {
  if (!isTauri()) {
    own = items.slice();
    return;
  }
  await invoke("clipboard_write", { items });
}

/** The first of `flavors` the clipboard holds, if any. */
export async function readClipboard(flavors: Flavor[]): Promise<ClipItem | null> {
  if (!isTauri()) {
    for (const f of flavors) {
      const item = own.find((i) => i.flavor === f);
      if (item) return item;
    }
    return null;
  }
  return invoke<ClipItem | null>("clipboard_read", { flavors });
}
