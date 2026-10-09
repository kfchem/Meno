/**
 * What is marked on a PDF's page (docs/PDF.md, *Text*, *Search*): the words
 * selected, in Meno's light, and the places a search found, the one gone to
 * the stronger - the same on the stack and in the column.
 */
import { COLORS } from "../../../theme/colors";
import { marksBetween, textHad } from "../../../../lib/pdf/text";
import type { PdfFound, PdfItem, PdfSelection } from "../store/types";
import { onPage } from "../utils/pdfSelection";
import type { Mark } from "./pdfPictures";

/** How words selected are marked, and places found. */
const SELECTED = 0.3;
export const FOUND_COLOR = "#d4a72c";
const FOUND = 0.3;
const FOUND_NOW = 0.6;

/** The marks on a page of a PDF - none until its letters have come, `came` called once they have. */
export function marksOn(
  pdf: Pick<PdfItem, "id" | "sha256">,
  page: number,
  sel: PdfSelection | null,
  found: readonly PdfFound[],
  now: PdfFound | null,
  came: () => void,
): Mark[] {
  const mine = found.filter((f) => f.id === pdf.id && f.page === page);
  const selected = sel?.id === pdf.id ? sel : null;
  if (!selected && !mine.length) return [];
  const t = textHad(pdf.sha256, page, came);
  if (!t) return [];
  const out: Mark[] = [];
  const isNow = (f: PdfFound) => !!now && now.id === f.id && now.page === f.page && now.from === f.from;
  const others = mine.filter((f) => !isNow(f));
  if (others.length) out.push({ rects: others.flatMap((f) => marksBetween(t, f.from, f.to)), color: FOUND_COLOR, opacity: FOUND });
  const there = mine.find(isNow);
  if (there) out.push({ rects: marksBetween(t, there.from, there.to), color: FOUND_COLOR, opacity: FOUND_NOW });
  const range = selected ? onPage(selected, page, t.codes.length) : null;
  if (range) out.push({ rects: marksBetween(t, range[0], range[1]), color: COLORS.highlight, opacity: SELECTED });
  return out;
}
