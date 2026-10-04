import type { EditorStore } from "../store";
import { schemeAmong } from "./copyPaste";

type Pt = { x: number; y: number };

/**
 * The selection dragged, from the press at `from` (on the screen): moved by
 * as much as the pointer goes, off the grid, with the arrows and "+" signs
 * among it and the molecules in 3D selected with it, as one undo step - one move a frame, as every move lays the
 * drawing out again. `toWorld` takes a point of the screen to the page;
 * `done` is told when the button comes up.
 */
export function dragSelection(
  store: EditorStore,
  toWorld: (cx: number, cy: number) => Pt,
  from: Pt,
  done: (ev: PointerEvent) => void,
) {
  const st = store.getState();
  const atoms = st.model.atoms.filter((a) => st.sel.atoms.has(a.id)).map((a) => ({ id: a.id, x: a.x, y: a.y }));
  const among = schemeAmong({ ...st.model, arrows: st.arrows, pluses: st.pluses }, st.sel.atoms);
  const solids = st.molecules3d.filter((m) => st.sel3d.has(m.id)).map((m) => ({ id: m.id, at: m.at }));
  const p0 = toWorld(from.x, from.y);
  const gesture = `drag-${performance.now()}`;
  let frame: number | null = null;
  let last = p0;
  const apply = () => {
    frame = null;
    const dx = last.x - p0.x;
    const dy = last.y - p0.y;
    const by = (p: { id: number; x: number; y: number }) => ({ id: p.id, x: p.x + dx, y: p.y + dy });
    store.getState().moveAtoms(atoms.map(by), gesture, {
      arrows: among.arrows.map(by),
      pluses: among.pluses.map(by),
      molecules3d: solids.map((m) => ({ id: m.id, at: { x: m.at.x + dx, y: m.at.y + dy } })),
    });
  };
  const onMove = (ev: PointerEvent) => {
    last = toWorld(ev.clientX, ev.clientY);
    if (frame == null) frame = window.requestAnimationFrame(apply);
  };
  const onUp = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp, true);
    if (frame != null) {
      window.cancelAnimationFrame(frame);
      last = toWorld(ev.clientX, ev.clientY);
      apply();
    }
    done(ev);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, true);
}
