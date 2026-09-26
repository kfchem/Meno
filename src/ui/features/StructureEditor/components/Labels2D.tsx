import * as THREE from "three";
import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { useEditor } from "../store";
import {
  layoutMolecule,
  placeLabel,
  type LayoutOptions,
  type Atom as LAtom,
  type Bond as LBond,
} from "../../../../lib/chem/layout2d";
import { editorLayoutOptions } from "../layoutOptions";
import { useLabelFont } from "../labelFont";

export default function Labels2D({
  options,
}: {
  options?: Partial<LayoutOptions>;
}) {
  const { camera } = useThree();
  const { model, moveDrag } = useEditor();
  const [zoom, setZoom] = useState((camera as THREE.OrthographicCamera).zoom);
  useFrame(() => {
    const z = (camera as THREE.OrthographicCamera).zoom;
    if (z !== zoom) setZoom(z);
  });

  // While an atom is being dragged its coordinates in the model stay put
  // until the drop, so follow the preview position instead - otherwise a
  // labelled atom (O, N, ...) leaves its label behind while the bonds move.
  const dragged =
    moveDrag.active && moveDrag.preview ? moveDrag : null;
  const atoms: LAtom[] = useMemo(
    () =>
      model.atoms.map((a) =>
        dragged && a.id === dragged.atomId
          ? { id: a.id, x: dragged.preview!.x, y: dragged.preview!.y, el: a.el }
          : { id: a.id, x: a.x, y: a.y, el: a.el }
      ),
    [model.atoms, dragged]
  );
  const bonds: LBond[] = useMemo(() => {
    const idToIndex = new Map<number, number>();
    atoms.forEach((a, i) => idToIndex.set(a.id, i));
    const out: LBond[] = [];
    for (const b of model.bonds) {
      const i1 = idToIndex.get(b.a as number);
      const i2 = idToIndex.get(b.b as number);
      if (i1 == null || i2 == null) continue;
      const stereo = (b as any).stereo ?? ("none" as const);
      const order: 1 | 2 | 3 = b.order as 1 | 2 | 3;
      out.push({ a1: i1, a2: i2, order, stereo });
    }
    return out;
  }, [model.bonds, atoms]);

  const opts: LayoutOptions = useMemo(
    () => editorLayoutOptions(atoms, bonds, options),
    [atoms, bonds, options]
  );
  const layout = useMemo(
    () => layoutMolecule(atoms, bonds, opts, zoom),
    [atoms, bonds, opts, zoom]
  );

  // Set in Arial, where the layout has placed each run: the font the layout
  // measures in is the one drawn with, so nothing needs measuring here.
  // Until the font is known nothing is drawn, rather than a label in some
  // other font that then jumps.
  const font = useLabelFont();
  if (font === null) return null;
  return (
    <group>
      {layout.texts.map((t, i) => {
        const fontWorld =
          opts.units === "px" ? t.fontPx / Math.max(zoom, 1e-6) : t.fontPx;
        return (
          <group key={`txt-${i}`}>
            {placeLabel(t, fontWorld).map((run, k) => (
              <Text
                key={`run-${k}`}
                font={font}
                position={[run.x, run.y, 0]}
                fontSize={run.size}
                color="black"
                anchorX="left"
                anchorY="top-baseline"
                renderOrder={30}
                material-depthTest={false}
                material-depthWrite={false}
              >
                {run.text}
              </Text>
            ))}
          </group>
        );
      })}
    </group>
  );
}
