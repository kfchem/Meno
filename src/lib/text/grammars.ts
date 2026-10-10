/**
 * A plugin's grammar made into a parser (lib/plugins/manifest
 * `GrammarDecl`; docs/PLUGINS.md): once, as it is first wanted. It is data -
 * a grammar in Lezer's form - and made into tables: a tokenizer that reads
 * each letter once, a parser that never goes back, so that no text can
 * hold the page up as a pattern could. No code is taken from it: a grammar
 * asking for any (`@external`, `@context`) is refused. It is tried first in
 * a worker, given `GRAMMAR_MS`, so that one that would take too long to make
 * is let go there; then made here, where Lezer's parsers are used.
 */
import type { LRParser } from "@lezer/lr";

/** How long a grammar may take to be made into tables, in ms. */
export const GRAMMAR_MS = 5000;

/** Whether a grammar asks for code: an external tokenizer, specializer, prop source or context. */
export const asksForCode = (grammar: string): boolean => /@(external|context)\b/.test(grammar);

const made = new Map<string, Promise<LRParser | null>>();

/** A grammar's parser - or none, where it asks for code, does not read as a grammar, or takes too long to make. */
export function grammarParser(grammar: string): Promise<LRParser | null> {
  let p = made.get(grammar);
  if (!p) {
    p = make(grammar);
    made.set(grammar, p);
  }
  return p;
}

async function make(grammar: string): Promise<LRParser | null> {
  if (asksForCode(grammar)) return null;
  if (typeof Worker !== "undefined" && !(await triedApart(grammar))) return null;
  try {
    const { buildParser } = await import("@lezer/generator");
    return buildParser(grammar);
  } catch {
    return null;
  }
}

/** The grammar made into tables in a worker, within `GRAMMAR_MS`: whether it was. */
function triedApart(grammar: string): Promise<boolean> {
  return new Promise((resolve) => {
    const w = new Worker(new URL("./grammarWorker.ts", import.meta.url), { type: "module" });
    const done = (ok: boolean) => {
      window.clearTimeout(timer);
      w.terminate();
      resolve(ok);
    };
    const timer = window.setTimeout(() => done(false), GRAMMAR_MS);
    w.onmessage = (e: MessageEvent<boolean>) => done(e.data === true);
    w.onerror = () => done(false);
    w.postMessage(grammar);
  });
}
