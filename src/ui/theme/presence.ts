import { useEffect, useReducer, useRef } from "react";
import { DURATION } from "./motion";

/**
 * What is in view, and what has just gone out of it: each of `items` as it
 * is, and each that was here and is not, kept as it last was for `ms` while
 * it fades out (with CSS's `meno-fade-out`), so nothing vanishes at once.
 */
export function usePresence<T>(items: readonly T[], keyOf: (item: T) => string, ms = DURATION.quick * 1000) {
  const seen = useRef(new Map<string, { item: T; leaving: boolean }>());
  const [, wake] = useReducer((n: number) => n + 1, 0);
  const now = new Set<string>();
  for (const item of items) {
    const key = keyOf(item);
    now.add(key);
    seen.current.set(key, { item, leaving: false });
  }
  const gone: string[] = [];
  for (const [key, e] of seen.current) {
    if (!now.has(key) && !e.leaving) {
      e.leaving = true;
      gone.push(key);
    }
  }
  useEffect(() => {
    if (!gone.length) return;
    const t = window.setTimeout(() => {
      for (const key of gone) if (seen.current.get(key)?.leaving) seen.current.delete(key);
      wake();
    }, ms);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- what went this render
  }, [gone.join("\u0000")]);
  return [...seen.current.entries()].map(([key, e]) => ({ key, item: e.item, leaving: e.leaving }));
}
