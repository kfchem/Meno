/**
 * Words taken out of a PDF (docs/PDF.md, *Taking things out*): a selection
 * dragged lifts off the page, rising toward the viewer and following the
 * pointer; let go on the canvas, it settles there as words on the page, in
 * the drawing's type, keeping where it came from; let go anywhere else, it
 * goes back.
 */
import type { EditorStore } from "../store";
import type { PdfItem, PdfSelection, WordsFrom } from "../store/types";
import { marksBetween, type PageText } from "../../../../lib/pdf/text";
import { onPage, ordered, selectedWords } from "../utils/pdfSelection";
import { DURATION } from "../../../theme/motion";

/** Where the canvas is, and the page under a point of the window: what words let go are put down by. */
type CanvasPlace = { canvas: () => HTMLElement | null; worldAt: (clientX: number, clientY: number) => { x: number; y: number } | null };
const places = new WeakMap<EditorStore, CanvasPlace>();

/** The canvas a store draws on, said as it comes - and gone, as it goes. */
export function setCanvasPlace(store: EditorStore, place: CanvasPlace | null): void {
  if (place) places.set(store, place);
  else places.delete(store);
}

/** Whether a point of a page, in points from its top left, lies on the words selected there. */
export function onSelected(t: PageText, sel: PdfSelection, page: number, x: number, y: number): boolean {
  const range = onPage(sel, page, t.codes.length);
  if (!range) return false;
  return marksBetween(t, range[0], range[1]).some(([x0, y0, x1, y1]) => x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1);
}

/** How long words let go take to settle, or to go back, in ms. */
const SETTLE_MS = DURATION.base * 1000;
const BACK_MS = DURATION.move * 1000;
/** The most of the words shown as they are carried. */
const SHOWN_MOST = 160;

/**
 * Words selected in a PDF carried from where the pointer pressed them: a
 * card of them following the pointer until it is let go - on the canvas,
 * words on the page there, as one step; elsewhere, the card going back.
 */
export async function dragWords(store: EditorStore, pdf: Pick<PdfItem, "sha256">, sel: PdfSelection, at: { x: number; y: number }): Promise<void> {
  const words = await selectedWords(sel, pdf);
  if (!words) return;
  const { from, to } = ordered(sel);
  const source: WordsFrom = { sha256: pdf.sha256, from, to };
  const card = document.createElement("div");
  card.setAttribute("aria-hidden", "true");
  card.className =
    "fixed left-0 top-0 z-[100] pointer-events-none max-w-[22rem] rounded-md border border-gh-line bg-white px-2 py-1 text-[13px] leading-snug text-gh-black";
  card.style.fontFamily = "Arimo, Arial, sans-serif";
  card.style.boxShadow = "0 1px 2px rgba(0,0,0,0.08)";
  card.style.transformOrigin = "0 0";
  card.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow ${SETTLE_MS}ms ease, opacity ${SETTLE_MS}ms ease`;
  card.textContent = words.length > SHOWN_MOST ? `${words.slice(0, SHOWN_MOST)}…` : words;
  const place = (x: number, y: number, k: number) => (card.style.transform = `translate(${x + 10}px, ${y + 10}px) scale(${k})`);
  place(at.x, at.y, 0.96);
  document.body.appendChild(card);
  // (rising: a little larger, its shadow deeper)
  requestAnimationFrame(() => {
    place(at.x, at.y, 1.04);
    card.style.boxShadow = "0 12px 28px rgba(0,0,0,0.18)";
  });
  const gone = (ms: number) => window.setTimeout(() => card.remove(), ms + 40);
  const onMove = (e: PointerEvent) => {
    card.style.transition = "box-shadow 160ms ease";
    place(e.clientX, e.clientY, 1.04);
  };
  const onUp = (e: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp, true);
    const canvas = places.get(store);
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const world = canvas && over && over === canvas.canvas() ? canvas.worldAt(e.clientX, e.clientY) : null;
    card.style.transition = `transform ${world ? SETTLE_MS : BACK_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow ${SETTLE_MS}ms ease, opacity ${world ? SETTLE_MS : BACK_MS}ms ease`;
    if (world) {
      // let go on the canvas: settled there as words on the page
      store.getState().addCaption(words, world.x, world.y, undefined, source);
      place(e.clientX, e.clientY, 1);
      card.style.boxShadow = "0 1px 2px rgba(0,0,0,0.08)";
      card.style.opacity = "0";
      gone(SETTLE_MS);
    } else {
      // elsewhere: back to where it was taken from
      place(at.x, at.y, 0.96);
      card.style.opacity = "0";
      gone(BACK_MS);
    }
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, true);
}
