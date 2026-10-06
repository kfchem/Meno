/**
 * Promises (./results `Ask`) asked for, and kept: the outputs opened this
 * session, by their SHA-256, to send again to the reader that gave a
 * promise when it is wanted - readers keep nothing between - and what each
 * promise came to, once given. None of it is saved: a workspace saves the
 * values a molecule is showing (`calcShowing`), and a promise not yet given
 * is asked for from its output - opened again, where it is not open now.
 */
import { create } from "zustand";
import { readerById, readerIdOfLine, type ReaderPlugin } from "./catalog";
import { kindOf } from "../io/kinds";
import type { Reader } from "./client";
import type { CalcInfo, CalcSource } from "./output";
import { isAsk, resultKey, resultsOn, type ListResult } from "./results";
import { readerClient } from "./workers";

const outputs = new Map<string, { name: string; text: string }>();
const given = new Map<string, unknown>();
const underWay = new Map<string, Promise<unknown>>();

/** Each promise asked for, by key: being worked out, given, or what went wrong. */
export const useAsks = create<{ state: Record<string, "asking" | "given" | { error: string }> }>(() => ({ state: {} }));

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Keeps an opened output for the session: what its promises are asked for from - its name, its kind and its SHA-256. */
export async function rememberOutput(name: string, text: string, kind: string): Promise<CalcSource> {
  const hash = await sha256(text);
  outputs.set(hash, { name, text });
  return { name, sha256: hash, kind };
}

/** What a promise is known by, among every molecule's: its output, the reader that gave it - by id - and its key. */
export const askKey = (source: CalcSource | undefined, from: string | undefined, key: string) => `${source?.sha256 ?? "-"}\u0000${from ?? ""}\u0000${key}`;

/** What a promise came to, where it has been given. */
export function givenValue(source: CalcSource | undefined, from: string | undefined, key: string): unknown {
  return given.get(askKey(source, from, key));
}

const setState = (k: string, s: "asking" | "given" | { error: string }) => useAsks.setState((was) => ({ state: { ...was.state, [k]: s } }));

/**
 * Asks the reader that gave a promise (`from`, its id) what it stands for,
 * sending the output again, and its kind; resolved once given. Where the
 * output is not open this session, says to open it.
 */
export function askFor(
  calc: CalcInfo,
  from: string | undefined,
  key: string,
  /** The reader a plugin is asked through: its worker, or the one that comes with Meno (tests hand in their own). */
  readerOf: (p: ReaderPlugin) => Promise<Reader> = readerClient,
): Promise<unknown> {
  const k = askKey(calc.source, from, key);
  if (given.has(k)) return Promise.resolve(given.get(k));
  // (asked for twice while it is worked out: worked out once)
  if (!underWay.has(k)) underWay.set(k, ask(calc, from, key, k, readerOf).finally(() => underWay.delete(k)));
  return underWay.get(k)!;
}

async function ask(calc: CalcInfo, from: string | undefined, key: string, k: string, readerOf: (p: ReaderPlugin) => Promise<Reader>): Promise<unknown> {
  const output = calc.source ? outputs.get(calc.source.sha256) : undefined;
  if (!calc.source || !output) {
    const error = `Open ${calc.source?.name ?? "the calculation's output"} again to show this.`;
    setState(k, { error });
    throw new Error(error);
  }
  const who = from ?? readerIdOfLine(calc.readers[0] ?? "");
  const plugin = readerById(who);
  // (its kind as it was told; or, kept before kinds were, told again)
  const kind = calc.source.kind ?? kindOf(output.name, output.text)?.id;
  if (!plugin || !kind) {
    const error = plugin ? `What ${output.name} is cannot be told.` : `${who} is not a reader Meno knows of.`;
    setState(k, { error });
    throw new Error(error);
  }
  setState(k, "asking");
  try {
    const value = await (await readerOf(plugin)).ask(kind, key, output.name, output.text);
    given.set(k, value);
    setState(k, "given");
    return value;
  } catch (e) {
    setState(k, { error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/**
 * A molecule's calculation with the promises of the row its list shows -
 * its motion, its surface - given where they have been: what a workspace
 * saves of it, so that it opens showing what it showed. `list` is the
 * list's `resultKey`.
 */
export function calcShowing(calc: CalcInfo, list: string, row: number | null): CalcInfo {
  if (row == null || !calc.results) return calc;
  const target = resultsOn(calc.results, "list").find((r) => resultKey(r) === list);
  const shown = target?.rows[row];
  if (!target || !shown) return calc;
  const swap = (v: unknown) => (isAsk(v) && givenValue(calc.source, target.from, v.ask) !== undefined ? givenValue(calc.source, target.from, v.ask) : v);
  const rows = target.rows.map((r, i) => (i === row ? { ...r, ...(r.move ? { move: swap(r.move) } : {}), ...(r.surface ? { surface: swap(r.surface) } : {}) } : r));
  return { ...calc, results: calc.results.map((r) => (r === target ? ({ ...target, rows } as ListResult) : r)) } as CalcInfo;
}
