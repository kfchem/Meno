/**
 * A plugin's grammar tried, apart from the page (lib/text/grammars): made
 * into tables here first, so that one that would take too long is let go
 * with its worker, holding nothing up.
 */
import { buildParser } from "@lezer/generator";

self.onmessage = (e: MessageEvent<string>) => {
  try {
    buildParser(e.data);
    self.postMessage(true);
  } catch {
    self.postMessage(false);
  }
};
