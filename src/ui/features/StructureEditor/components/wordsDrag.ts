/**
 * Words taken out of a PDF (docs/PDF.md, *Taking things out*): a selection
 * dragged lifts off the page, rising toward the viewer and following the
 * pointer; let go on the canvas, it settles there as words on the page, in
 * the drawing's type, keeping where it came from; let go anywhere else, it
 * goes back.
 */
import type { EditorStore } from "../store";
import type { PdfItem, PdfSelection, WordsFrom } from "../store/types";
import { marksBetween, textOf, type PageText } from "../../../../lib/pdf/text";
import { partPicture } from "../../../../lib/pdf/reader";
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

/** How long words take to peel off, to settle once let go, and to go back, in ms. */
const PEEL_MS = 240;
const SETTLE_MS = DURATION.base * 1000;
const BACK_MS = 300;
/** How far words peeling off lift and lean, toward the viewer, and how they are seen in depth. */
const LIFT_SCALE = 1.06;
const LEAN_DEG = 9;
const DEPTH_PX = 700;
const SHADOW_UP = "drop-shadow(0 0 0 rgba(0,0,0,0))";
const SHADOW_LIFTED = "drop-shadow(0 12px 16px rgba(0,0,0,0.22))";

/** Where a point of a PDF's page lies in the window, in its pixels: where the words are drawn, on the stack or in the column. */
export type OnScreen = { at: (page: number, x: number, y: number) => { x: number; y: number }; pxPerPoint: number };

/**
 * Words selected in a PDF carried out, from where the pointer pressed them
 * (docs/PDF.md, *Taking things out*). They peel off the page: their own
 * picture - drawn by PDFium where they lie, cut to their shape - lifts at
 * the edge the pointer pulls, leaning toward the viewer, its shadow
 * deepening, the page left bare where they were; then follows the pointer.
 * Let go on the canvas, they are words on the page there, one step, the
 * picture settling as they come; anywhere else, it goes back down into the
 * page.
 */
export async function dragWords(store: EditorStore, pdf: Pick<PdfItem, "id" | "sha256">, sel: PdfSelection, at: { x: number; y: number }, screen: OnScreen): Promise<void> {
  const words = await selectedWords(sel, pdf);
  if (!words) return;
  const { from, to } = ordered(sel);
  const source: WordsFrom = { sha256: pdf.sha256, from, to };
  // where they are on their first page, and the box round them there
  const t = await textOf(pdf.sha256, from.page);
  const range = onPage(sel, from.page, t.codes.length);
  const rects = range ? marksBetween(t, range[0], range[1]) : [];
  if (!rects.length) return;
  const pad = 1;
  const x0 = Math.min(...rects.map((r) => r[0])) - pad;
  const y0 = Math.min(...rects.map((r) => r[1])) - pad;
  const x1 = Math.max(...rects.map((r) => r[2])) + pad;
  const y1 = Math.max(...rects.map((r) => r[3])) + pad;
  const k = screen.pxPerPoint;
  const topLeft = screen.at(from.page, x0, y0);
  const box = { left: topLeft.x, top: topLeft.y, width: (x1 - x0) * k, height: (y1 - y0) * k };
  // their picture, as sharp as the screen shows it
  const scale = k * (window.devicePixelRatio || 1);
  const url = await partPicture(pdf.sha256, from.page, scale, x0 * scale, y0 * scale, (x1 - x0) * scale, (y1 - y0) * scale).catch(() => null);
  if (!url) return;
  const card = document.createElement("div");
  card.setAttribute("aria-hidden", "true");
  Object.assign(card.style, {
    position: "fixed",
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    zIndex: "100",
    pointerEvents: "none",
    willChange: "transform, filter",
    filter: SHADOW_UP,
  } satisfies Partial<CSSStyleDeclaration>);
  // (lifting at the edge it is pulled by, the far edge the last to leave the page)
  const grab = { x: at.x - box.left, y: at.y - box.top };
  const towardRight = grab.x > box.width / 2;
  const towardBottom = grab.y > box.height / 2;
  card.style.transformOrigin = `${towardRight ? 0 : 100}% ${towardBottom ? 0 : 100}%`;
  const lean = `rotateY(${towardRight ? -LEAN_DEG : LEAN_DEG}deg) rotateX(${towardBottom ? LEAN_DEG / 2 : -LEAN_DEG / 2}deg)`;
  const lifted = (dx: number, dy: number) => `perspective(${DEPTH_PX}px) translate(${dx}px, ${dy}px) ${lean} scale(${LIFT_SCALE})`;
  const flat = (dx: number, dy: number, s = 1) => `perspective(${DEPTH_PX}px) translate(${dx}px, ${dy}px) rotateY(0deg) rotateX(0deg) scale(${s})`;
  card.style.transform = flat(0, 0);
  const img = document.createElement("img");
  img.src = url;
  img.alt = "";
  Object.assign(img.style, { width: "100%", height: "100%", display: "block" } satisfies Partial<CSSStyleDeclaration>);
  // (cut to the words' own shape: the lines selected, not the whole box)
  const path = rects.map(([a, b, c, d]) => `M${(a - x0) * k} ${(b - y0) * k}H${(c - x0) * k}V${(d - y0) * k}H${(a - x0) * k}Z`).join("");
  img.style.clipPath = `path("${path}")`;
  card.appendChild(img);
  await img.decode().catch(() => undefined);
  document.body.appendChild(card);
  store.getState().setPdfLifted({ id: pdf.id, from, to });
  let pointer = { x: at.x, y: at.y };
  const peeled = performance.now();
  // peeling off: lifting and leaning toward the viewer, its shadow deepening
  requestAnimationFrame(() => {
    card.style.transition = `transform ${PEEL_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), filter ${PEEL_MS}ms ease`;
    card.style.transform = lifted(pointer.x - at.x, pointer.y - at.y);
    card.style.filter = SHADOW_LIFTED;
  });
  const done = (ms: number) =>
    window.setTimeout(() => {
      card.remove();
      URL.revokeObjectURL(url);
      store.getState().setPdfLifted(null);
    }, ms + 40);
  const onMove = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY };
    // (once peeled, it keeps up with the pointer)
    if (performance.now() - peeled > PEEL_MS) card.style.transition = "filter 160ms ease";
    card.style.transform = lifted(pointer.x - at.x, pointer.y - at.y);
  };
  const onUp = (e: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp, true);
    const canvas = places.get(store);
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const world = canvas && over && over === canvas.canvas() ? canvas.worldAt(e.clientX, e.clientY) : null;
    if (world) {
      // let go on the canvas: words on the page there, the picture settling as they come
      store.getState().addCaption(words, world.x, world.y, undefined, source);
      card.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), filter ${SETTLE_MS}ms ease, opacity ${SETTLE_MS}ms ease`;
      card.style.transform = flat(e.clientX - at.x, e.clientY - at.y);
      card.style.filter = SHADOW_UP;
      card.style.opacity = "0";
      done(SETTLE_MS);
    } else {
      // elsewhere: back down into the page, where they were
      card.style.transition = `transform ${BACK_MS}ms cubic-bezier(0.45, 0, 0.55, 1), filter ${BACK_MS}ms ease`;
      card.style.transform = flat(0, 0);
      card.style.filter = SHADOW_UP;
      done(BACK_MS);
    }
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, true);
}
