import type { EditorStore } from "../store";
import { DOUBLE_CLICK_MS, MOV_PX } from "../constants";

type Pt = { x: number; y: number };

/**
 * A chain from a point of empty space, begun by a press - Quick Add's
 * chain, from where Quick Add was opened: led by a drag from that press,
 * or, the button let go where it was, traced with the button up until a
 * click ends it (ChainGuide2D). Escape lets it go either way.
 */
export function chainFrom(
  store: EditorStore,
  press: { pointerId: number; clientX: number; clientY: number },
  start: Pt,
  /** Where a point in the window is on the page; null off the canvas. */
  toPage: (clientX: number, clientY: number) => Pt | null,
): void {
  const sx = press.clientX;
  const sy = press.clientY;
  let started = false;
  // (the drag is the chain's, not the view's)
  store.getState().beginPanHold(press.pointerId);
  const onMove = (ev: PointerEvent) => {
    if (!started) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOV_PX) return;
      started = true;
      store.getState().startChainAt(start.x, start.y, false);
    }
    const p = toPage(ev.clientX, ev.clientY);
    if (p) store.getState().updateExtend(p.x, p.y);
  };
  const onUp = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp, true);
    const s = store.getState();
    s.endPanHold(ev.pointerId);
    if (started) s.commitExtend();
    else s.startChainAt(start.x, start.y, true);
    s.suppressDoubleClick(DOUBLE_CLICK_MS);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, true);
}
