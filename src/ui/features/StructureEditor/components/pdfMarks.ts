/**
 * What is marked on a PDF's page (docs/PDF.md, *Text*, *Search*): the words
 * selected, in Meno's light, and the places a search found, the one gone to
 * the stronger - the same on the stack and in the column.
 */
import { COLORS } from "../../../theme/colors";
import { marksBetween, textHad } from "../../../../lib/pdf/text";
import type { EditorState, PdfFound, PdfItem, PdfSelection } from "../store/types";
import { onPage } from "../utils/pdfSelection";
import type { Mark } from "./pdfPictures";

/** How long a place shown is marked, in ms: held, then fading. */
export const FLASH_MS = 1800;
const FLASH_HOLD_MS = 700;
const FLASH = 0.5;

/** How marked a place shown is now: held a moment, then fading out. */
export function flashOf(start: number, now: number): number {
  const t = now - start;
  if (t < FLASH_HOLD_MS) return FLASH;
  return Math.max(0, FLASH * (1 - (t - FLASH_HOLD_MS) / (FLASH_MS - FLASH_HOLD_MS)));
}

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
  flash: EditorState["pdfFlash"] = null,
  lifted: EditorState["pdfLifted"] = null,
): Mark[] {
  const mine = found.filter((f) => f.id === pdf.id && f.page === page);
  const selected = sel?.id === pdf.id ? sel : null;
  const shown = flash?.id === pdf.id && page >= flash.from.page && page <= flash.to.page ? flash : null;
  const bare = lifted?.id === pdf.id && page >= lifted.from.page && page <= lifted.to.page ? lifted : null;
  if (!selected && !mine.length && !shown && !bare) return [];
  const t = textHad(pdf.sha256, page, came);
  if (!t) return [];
  const out: Mark[] = [];
  // (words being carried out: the page bare where they were, as paper is)
  if (bare) {
    const a = page === bare.from.page ? bare.from.at : 0;
    const b = page === bare.to.page ? bare.to.at : t.codes.length;
    out.push({ rects: marksBetween(t, a, b), color: "#ffffff", opacity: 1 });
  }
  const isNow = (f: PdfFound) => !!now && now.id === f.id && now.page === f.page && now.from === f.from;
  const others = mine.filter((f) => !isNow(f));
  if (others.length) out.push({ rects: others.flatMap((f) => marksBetween(t, f.from, f.to)), color: FOUND_COLOR, opacity: FOUND });
  const there = mine.find(isNow);
  if (there) out.push({ rects: marksBetween(t, there.from, there.to), color: FOUND_COLOR, opacity: FOUND_NOW });
  // (the words being carried out leave paper, not their mark)
  const range = selected && !bare ? onPage(selected, page, t.codes.length) : null;
  if (range) out.push({ rects: marksBetween(t, range[0], range[1]), color: COLORS.highlight, opacity: SELECTED });
  if (shown) {
    const a = page === shown.from.page ? shown.from.at : 0;
    const b = page === shown.to.page ? shown.to.at : t.codes.length;
    const o = flashOf(shown.start, performance.now());
    if (o > 0) out.push({ rects: marksBetween(t, a, b), color: COLORS.highlight, opacity: o });
  }
  return out;
}
