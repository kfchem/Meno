/**
 * Searching PDFs (docs/PDF.md, *Search*): what is asked looked for in the
 * PDF the column shows, or in all of them, page by page, as each page's
 * letters come - each place found marked on the pages (pdfMarks), counted,
 * and gone to in the column, its PDF shown there.
 */
import { findIn, marksBetween, textOf } from "../../../../lib/pdf/text";
import type { EditorStore } from "../store";
import type { PdfFound } from "../store/types";
import { readerOf } from "./pdfColumnReader";

/** Each search run: a later one makes an earlier one's finds no longer wanted. */
const runs = new WeakMap<EditorStore, number>();

/**
 * Looks for `q` - in the PDF the column shows, or `all` of them - keeping
 * what it finds in the store as it finds it, and going to the first place
 * at or after the page the column is on.
 */
export async function runFind(store: EditorStore, q: string, all: boolean): Promise<void> {
  const run = (runs.get(store) ?? 0) + 1;
  runs.set(store, run);
  const st = store.getState();
  const pdfs = all ? st.pdfs : st.pdfs.filter((p) => p.id === st.pdfShown);
  st.setPdfFind({ q, all, found: [], now: 0, busy: !!q.trim() });
  if (!q.trim()) return;
  const found: PdfFound[] = [];
  for (const p of pdfs)
    for (let page = 0; page < p.pages.length; page++) {
      const t = await textOf(p.sha256, page).catch(() => null);
      if (runs.get(store) !== run) return;
      if (t) for (const [from, to] of findIn(t, q)) found.push({ id: p.id, page, from, to });
    }
  // (the first place on the page the column is on, or after it - else the first of all)
  const r = readerOf(store);
  const shown = store.getState().pdfShown;
  const here = found.findIndex((f) => f.id === shown && f.page >= r.page);
  store.getState().setPdfFind({ q, all, found, now: here >= 0 ? here : 0, busy: false });
  if (found.length) void goToFound(store, here >= 0 ? here : 0);
}

/** A place found gone to: its PDF shown in the column - read there, if it was not - its words a line below the column's top. */
export async function goToFound(store: EditorStore, index: number): Promise<void> {
  const st = store.getState();
  const find = st.pdfFind;
  const f = find?.found[index];
  if (!find || !f) return;
  if (find.now !== index) st.setPdfFind({ ...find, now: index });
  const pdf = st.pdfs.find((p) => p.id === f.id);
  if (!pdf) return;
  if (!(st.textsOpen && st.pdfShown === f.id)) st.readPdf(f.id);
  const t = await textOf(pdf.sha256, f.page).catch(() => null);
  const y = t ? (marksBetween(t, f.from, f.to)[0]?.[1] ?? null) : null;
  // (below the field - and the list, looking in all of them)
  readerOf(store).goToWhenRead(f.id, f.page, y, find.all ? 0.6 : 0.3);
}

/** The place found after the one gone to - or before it - gone to, round from the last to the first. */
export function stepFound(store: EditorStore, by: 1 | -1): void {
  const find = store.getState().pdfFind;
  if (!find?.found.length) return;
  void goToFound(store, (find.now + by + find.found.length) % find.found.length);
}
