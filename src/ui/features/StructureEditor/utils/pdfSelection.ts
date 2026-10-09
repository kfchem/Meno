/**
 * Words selected in a PDF (docs/PDF.md, *Text*): the selection's ends in
 * order, what of each page it takes, and its words as they are copied -
 * across pages, a page's end read as a space.
 */
import { textOf, wordsBetween } from "../../../../lib/pdf/text";
import type { PdfItem, WordPlace, PdfSelection } from "../store/types";

/** Whether a place between a PDF's letters is before another, or at it. */
export const placeBefore = (a: WordPlace, b: WordPlace) => a.page < b.page || (a.page === b.page && a.at <= b.at);

/** A selection's ends, the first first. */
export function ordered(sel: PdfSelection): { from: WordPlace; to: WordPlace } {
  return placeBefore(sel.anchor, sel.focus) ? { from: sel.anchor, to: sel.focus } : { from: sel.focus, to: sel.anchor };
}

/** Whether a selection takes any letter. */
export const selects = (sel: PdfSelection | null): sel is PdfSelection =>
  !!sel && (sel.anchor.page !== sel.focus.page || sel.anchor.at !== sel.focus.at);

/** What of a page, `n` letters long, a selection takes: its first letter and the one after its last - none, nothing. */
export function onPage(sel: PdfSelection, page: number, n: number): [number, number] | null {
  const { from, to } = ordered(sel);
  if (page < from.page || page > to.page) return null;
  const a = page === from.page ? from.at : 0;
  const b = page === to.page ? to.at : n;
  return b > a ? [a, b] : null;
}

/** A selection's words, as they are copied. */
export async function selectedWords(sel: PdfSelection, pdf: Pick<PdfItem, "sha256">): Promise<string> {
  const { from, to } = ordered(sel);
  const parts: string[] = [];
  for (let page = from.page; page <= to.page; page++) {
    const t = await textOf(pdf.sha256, page);
    const range = onPage(sel, page, t.codes.length);
    if (range) parts.push(wordsBetween(t, range[0], range[1]));
  }
  return parts.filter(Boolean).join(" ");
}
