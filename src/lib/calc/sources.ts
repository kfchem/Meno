/**
 * The readers results came from, as a chemist knows them: by name, without
 * the version a result keeps of its reader ("cclib 1.9rc1" is cclib) - said
 * only where two readers' results stand side by side (./results `bySource`).
 */
import { READER_PLUGINS } from "./catalog";
import { bySource, grouped, type Result } from "./results";

/** A reader's name, from what a result keeps of it; one Meno does not know, as kept. */
export function readerNameOf(from: string | undefined): string {
  if (!from) return "";
  const p = READER_PLUGINS.find((r) => from === r.name || from.startsWith(`${r.name} `));
  return p?.name ?? from;
}

/** A result's name where it stands among others of its kind - a menu's lists - its reader's added where two readers' stand there. */
export function titled(r: { label: string; from?: string }, among: readonly { from?: string }[]): string {
  return new Set(among.map((x) => x.from)).size > 1 ? `${r.label} · ${readerNameOf(r.from)}` : r.label;
}

/**
 * Results as a card says them: group by group, under each reader's name
 * where two readers' stand on it (./results `bySource`) - each row its name
 * and what `say` makes of its value.
 */
export function cardGroupsOf<R extends Result>(
  results: readonly R[],
  say: (r: R) => { text: string; marked?: boolean },
): { source?: string; group: string; rows: { label: string; text: string; marked?: boolean }[] }[] {
  return bySource(results, readerNameOf).flatMap((part) =>
    grouped(part.results).map((g, k) => ({
      ...(k === 0 && part.source ? { source: part.source } : {}),
      group: g.group,
      rows: g.results.map((r) => ({ label: r.label, ...say(r) })),
    })),
  );
}
