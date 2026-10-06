/**
 * A tab opened from inside another - a calculation's output shown from its
 * molecule's menu, say - through the app, which alone holds the tabs: it
 * says how once (App), and anything may then ask.
 */
import type { Opened } from "./openFile";

let opener: ((opened: Opened) => boolean) | null = null;

/** How the app opens a tab; the function returned undoes it. */
export function setTabOpener(open: (opened: Opened) => boolean): () => void {
  opener = open;
  return () => {
    if (opener === open) opener = null;
  };
}

/** Opens a tab, as a file opened would be; whether it was. */
export function openInTab(opened: Opened): boolean {
  return opener?.(opened) ?? false;
}
