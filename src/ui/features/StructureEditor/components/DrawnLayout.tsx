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
import { DrawnLayoutContext } from "./drawnLayoutContext";

/** The id the atom a bond is being drawn out to goes by until it is made. */
export const EXTENDING_ATOM_ID = -1;

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

  const draggedId =
    moveDrag.active && moveDrag.preview ? moveDrag.atomId : null;
  const dragX = moveDrag.preview?.x;
  const dragY = moveDrag.preview?.y;
  const fromId =
    extend.active && extend.preview && extend.atomId != null
      ? extend.atomId
      : null;
  const newX = extend.preview?.x;
  const newY = extend.preview?.y;
  const atoms: LAtom[] = useMemo(() => {
    const out = model.atoms.map((a) =>
      a.id === draggedId && dragX != null && dragY != null
        ? { id: a.id, x: dragX, y: dragY, el: a.el }
        : { id: a.id, x: a.x, y: a.y, el: a.el },
    );
    if (fromId != null && newX != null && newY != null) {
      out.push({ id: EXTENDING_ATOM_ID, x: newX, y: newY, el: "C" });
    }
    return out;
  }, [model.atoms, draggedId, dragX, dragY, fromId, newX, newY]);
  const extending = fromId != null && newX != null && newY != null;
  const bonds: LBond[] = useMemo(() => {
    const index = new Map<number, number>();
    model.atoms.forEach((a, i) => index.set(a.id, i));
    const out = layoutBonds(model.bonds, index);
    const from = fromId != null ? index.get(fromId) : undefined;
    if (extending && from != null) {
      // the new atom is last
      out.push({ a1: from, a2: model.atoms.length, order: 1, stereo: "none" });
    }
    return out;
  }, [model.atoms, model.bonds, fromId, extending]);
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
    return editorLayoutOptions(atoms, bonds, { aromaticCircle });
  }, [atoms, bonds, aromaticEnabled, aromaticRings]);
  const layout = useMemo(
    () => layoutMolecule(atoms, bonds, opts, zoom),
    [atoms, bonds, opts, zoom],
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
