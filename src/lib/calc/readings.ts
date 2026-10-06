/**
 * What readers chosen to read an output as well found in it - or that they
 * could not read it - as it comes, by the output's SHA-256 (lib/calc/read):
 * kept for the session, for every canvas to join to each molecule read
 * from that output, wherever it stands - opened, dropped or pasted - and
 * whenever it comes to stand there.
 */
import { create } from "zustand";
import type { Found, Unread } from "./read";

export const useReadings = create<{ bySource: Record<string, (Found | Unread)[]> }>(() => ({ bySource: {} }));

/** A reading come in, for the output of that SHA-256. */
export function publishReading(sha256: string, reading: Found | Unread): void {
  useReadings.setState((s) => ({ bySource: { ...s.bySource, [sha256]: [...(s.bySource[sha256] ?? []), reading] } }));
}
