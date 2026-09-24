import * as THREE from "three";
import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { useEditor } from "../store";
import {
  layoutMolecule,
  SUB_DROP,
  SUB_SCALE,
  type LayoutOptions,
  type Atom as LAtom,
  type Bond as LBond,
} from "../../../../lib/chem/layout2d";
import { editorLayoutOptions } from "../layoutOptions";

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

  const fontFamily =
    "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  const measRef = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    return ctx;
  }, []);
  /** Width of a piece of a label, in world units. */
  const widthWorld = (text: string, fontWorld: number) => {
    const ctx = measRef;
    if (!ctx) return 0;
    const fontPx = fontWorld * Math.max(zoom, 1e-6);
    ctx.font = `${fontPx}px ${fontFamily}`;
    return ctx.measureText(text).width / Math.max(zoom, 1e-6);
  };
  return (
    <group>
      {layout.texts.map((t, i) => {
        const fontWorld =
          opts.units === "px" ? t.fontPx / Math.max(zoom, 1e-6) : t.fontPx;
        const runs = t.runs ?? [{ text: t.text }];
        const anchor = Math.min(t.anchorRun ?? 0, runs.length - 1);
        const sizes = runs.map((r) => fontWorld * (r.sub ? SUB_SCALE : 1));
        const widths = runs.map((r, k) => widthWorld(r.text, sizes[k]));
        // Put the element symbol itself on the atom, so OH hangs to the right
        // of the atom and HO to its left.
        let before = 0;
        for (let k = 0; k < anchor; k++) before += widths[k];
        let cursor = t.x - (before + widths[anchor] * 0.5);
        return (
          <group key={`txt-${i}`}>
            {runs.map((r, k) => {
              const x = cursor;
              cursor += widths[k];
              return (
                <Text
                  key={`run-${k}`}
                  position={[x, t.y - (r.sub ? fontWorld * SUB_DROP : 0), 0]}
                  fontSize={sizes[k]}
                  color="black"
                  anchorX="left"
                  anchorY="middle"
                  renderOrder={30}
                  material-depthTest={false}
                  material-depthWrite={false}
                >
                  {r.text}
                </Text>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
