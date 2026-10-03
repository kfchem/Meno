import * as THREE from "three";
import { useMemo, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import {
  layoutMolecule,
  type Atom as LAtom,
  type Bond as LBond,
} from "../../../../lib/chem/layout2d";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";
import { useDrawingStyle } from "../useDrawingStyle";
import { needsFallback, useTypefaces } from "../../../fonts/typefaces";
import { chemistry } from "../../../../lib/chem/molecule";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { DrawnLayoutContext } from "./drawnLayoutContext";
import { NEW_ATOM } from "../utils/stroke";

/** The id the atom a bond is being drawn out to goes by until it is made. */
export const EXTENDING_ATOM_ID = -1;
/** The new atom a stroke on empty space starts at, while it is drawn. */
const STROKE_START_ID = -100000;

/**
 * The drawing as it stands this frame - the model, with an atom that is being
 * dragged where the drag has put it, and a bond being drawn out of an atom
 * already there with its new atom - laid out once, for every layer to draw
 * from. Neither is drawn any other way: the bonds, wedges, joins and labels
 * of a gesture in progress are the ones it will leave behind, because they
 * come from the same layout.
 */
export function DrawnLayoutProvider({ children }: { children: ReactNode }) {
  const { camera } = useThree();
  const [zoom, setZoom] = useState(
    () => (camera as THREE.OrthographicCamera).zoom || 1,
  );
  useFrame(() => {
    const z = (camera as THREE.OrthographicCamera).zoom || 1;
    if (z !== zoom) setZoom(z);
  });
  const model = useEditor((s) => s.model);
  const moveDrag = useEditor((s) => s.moveDrag);
  const extend = useEditor((s) => s.extend);
  const aromaticEnabled = useEditor((s) => s.aromaticEnabled);
  const aromaticRings = useEditor((s) => s.aromaticRings);
  const style = useDrawingStyle();

  const draggedId =
    moveDrag.active && moveDrag.preview ? moveDrag.atomId : null;
  const dragX = moveDrag.preview?.x;
  const dragY = moveDrag.preview?.y;
  // A stroke under way: the atoms it has laid down, and the bond the pointer
  // is leading, to a new atom or onto one already there.
  const stroke = extend.active ? extend.stroke : null;
  const preview = extend.active ? extend.preview : null;
  const atoms: LAtom[] = useMemo(() => {
    // (with its depth, where it is drawn in perspective: a bond behind
    // another is broken where they cross)
    const out: LAtom[] = model.atoms.map((a) => ({
      id: a.id,
      ...(a.id === draggedId && dragX != null && dragY != null ? { x: dragX, y: dragY } : { x: a.x, y: a.y }),
      el: a.el,
      ...chemistry(a),
      ...(a.z != null ? { z: a.z } : {}),
    }));
    // (a stroke on empty space: its own new atom where it starts)
    if (stroke && stroke.baseId === NEW_ATOM && stroke.start) {
      out.push({ id: STROKE_START_ID, x: stroke.start.x, y: stroke.start.y, el: "C" });
    }
    stroke?.nodes.forEach((n, i) => {
      if (n.atomId == null && n.pathIndex == null) {
        out.push({ id: EXTENDING_ATOM_ID - i, x: n.x, y: n.y, el: "C" });
      }
    });
    if (preview && preview.atomId == null && preview.pathIndex == null) {
      out.push({ id: EXTENDING_ATOM_ID - 1000, x: preview.x, y: preview.y, el: "C" });
    }
    return out;
  }, [model.atoms, draggedId, dragX, dragY, stroke, preview]);
  const bonds: LBond[] = useMemo(() => {
    const index = new Map<number, number>();
    atoms.forEach((a, i) => index.set(a.id, i));
    const out = layoutBonds(model.bonds, index);
    if (!stroke) return out;
    // where each node of the stroke is drawn: its own atom, or the one it
    // closed onto
    const baseIndex = index.get(stroke.baseId === NEW_ATOM ? STROKE_START_ID : stroke.baseId);
    // (a path index of -1 is the stroke's own start)
    const ofPath = (i: number) => (i === -1 ? baseIndex : index.get(EXTENDING_ATOM_ID - i));
    const at = (n: { atomId?: number; pathIndex?: number }, i: number) =>
      n.atomId != null
        ? index.get(n.atomId)
        : n.pathIndex != null
          ? ofPath(n.pathIndex)
          : index.get(EXTENDING_ATOM_ID - i);
    let from = baseIndex;
    stroke.nodes.forEach((n, i) => {
      if (n.from != null) from = ofPath(n.from) ?? from;
      const to = at(n, i);
      if (from != null && to != null && from !== to) {
        out.push({ a1: from, a2: to, order: 1, stereo: "none" });
      }
      from = to;
    });
    if (preview && from != null) {
      const to =
        preview.atomId != null || preview.pathIndex != null
          ? at(preview, -1)
          : index.get(EXTENDING_ATOM_ID - 1000);
      if (to != null && to !== from) {
        out.push({ a1: from, a2: to, order: 1, stereo: "none" });
      }
    }
    return out;
  }, [atoms, model.bonds, stroke, preview]);
  const opts = useMemo(() => {
    const keys = Object.keys(aromaticRings || {}).filter(
      (k) => aromaticRings[k],
    );
    const aromaticCircle =
      keys.length > 0
        ? { enabled: new Set(keys) }
        : aromaticEnabled
          ? true
          : false;
    return editorLayoutOptions(style, { aromaticCircle });
  }, [style, aromaticEnabled, aromaticRings]);
  // The typeface's own letters, and Japanese ones when a label has any, are
  // read when first needed; the layout is redone as they come in.
  const fonts = useTypefaces(
    style.fontFamily,
    needsFallback(model.atoms.map((a) => a.el)),
  );
  // (a label is read by the abbreviations Meno knows, the user's among them)
  const abbreviations = useAppSettings((s) => s.abbreviations);
  const layout = useMemo(
    () => layoutMolecule(atoms, bonds, opts, zoom),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fonts, abbreviations: see above
    [atoms, bonds, opts, zoom, fonts, abbreviations],
  );
  const value = useMemo(
    () => ({ atoms, bonds, opts, layout, zoom }),
    [atoms, bonds, opts, layout, zoom],
  );
  return (
    <DrawnLayoutContext.Provider value={value}>
      {children}
    </DrawnLayoutContext.Provider>
  );
}
