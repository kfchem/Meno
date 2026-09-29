/**
 * The system clipboard for structures, by the app's own commands
 * (src-tauri/src/clipboard.rs): the webview's clipboard reaches plain text
 * only, and a structure travels as more than that - Meno's own record of it,
 * a MOL file under the names chemistry programs look for, and pictures of
 * it that Office and other programs take.
 *
 * Outside the app (the tests, a browser) the clipboard is one of its own.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * A kind of data on the clipboard:
 * - `meno`: Meno's own record of a structure, nothing lost;
 * - `mol`: a MOL file, for other chemistry programs;
 * - `text`: plain text;
 * - `gvml`: Office's own clip format, a package holding a picture that Word
 *   and PowerPoint keep as it is and hand back (lib/office/gvml);
 * - `emf`: an enhanced metafile, for Windows' other programs;
 * - `png`: a PNG.
 *
 * Plain text is not put beside a structure: without Office's own format
 * beside it, PowerPoint pastes text as a text box in preference to a
 * picture.
 */
export type Flavor = "meno" | "mol" | "text" | "gvml" | "emf" | "png";

export type ClipItem = { flavor: Flavor; text?: string; bytes?: Uint8Array };

type Wire = { flavor: Flavor; text?: string; base64?: string };

let own: ClipItem[] = [];

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Puts `items` on the clipboard, in place of whatever was there. */
export async function writeClipboard(items: ClipItem[]): Promise<void> {
  if (!isTauri()) {
    own = items.slice();
    return;
  }
  const wire: Wire[] = items.map((i) =>
    i.bytes ? { flavor: i.flavor, base64: toBase64(i.bytes) } : { flavor: i.flavor, text: i.text ?? "" },
  );
  await invoke("clipboard_write", { items: wire });
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
  const got = await invoke<Wire | null>("clipboard_read", { flavors });
  if (!got) return null;
  return got.base64 != null ? { flavor: got.flavor, bytes: fromBase64(got.base64) } : { flavor: got.flavor, text: got.text ?? "" };
}
