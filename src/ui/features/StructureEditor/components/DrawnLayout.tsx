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

/**
 * The drawing as it stands this frame - the model, with an atom that is being
 * dragged where the drag has put it - laid out once, for every layer to draw
 * from. A drag is not drawn any other way: the bonds, wedges, joins and labels
 * of a moving atom are the ones it will have when it is dropped, because they
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
  const aromaticEnabled = useEditor((s) => s.aromaticEnabled);
  const aromaticRings = useEditor((s) => s.aromaticRings);

  const draggedId =
    moveDrag.active && moveDrag.preview ? moveDrag.atomId : null;
  const dragX = moveDrag.preview?.x;
  const dragY = moveDrag.preview?.y;
  const atoms: LAtom[] = useMemo(
    () =>
      model.atoms.map((a) =>
        a.id === draggedId && dragX != null && dragY != null
          ? { id: a.id, x: dragX, y: dragY, el: a.el }
          : { id: a.id, x: a.x, y: a.y, el: a.el },
      ),
    [model.atoms, draggedId, dragX, dragY],
  );
  const bonds: LBond[] = useMemo(() => {
    const index = new Map<number, number>();
    model.atoms.forEach((a, i) => index.set(a.id, i));
    return layoutBonds(model.bonds, index);
  }, [model.atoms, model.bonds]);
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
