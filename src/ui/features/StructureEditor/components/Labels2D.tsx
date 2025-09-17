import * as THREE from "three";
import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { useEditor } from "../store";
import {
  layoutMolecule,
  type LayoutOptions,
  type Atom as LAtom,
  type Bond as LBond,
} from "../../../../lib/chem/layout2d";
import { acsWorldOptions } from "../../../../lib/chem/acs";

export default function Labels2D({
  options,
}: {
  options?: Partial<LayoutOptions>;
}) {
  const { camera } = useThree();
  const { model } = useEditor();
  const [zoom, setZoom] = useState((camera as THREE.OrthographicCamera).zoom);
  useFrame(() => {
    const z = (camera as THREE.OrthographicCamera).zoom;
    if (z !== zoom) setZoom(z);
  });

  const atoms: LAtom[] = useMemo(
    () => model.atoms.map((a) => ({ id: a.id, x: a.x, y: a.y, el: a.el })),
    [model.atoms]
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
    () => acsWorldOptions(atoms, bonds, { ...options, units: "world" }),
    [atoms, bonds, options]
  );
  const layout = useMemo(
    () => layoutMolecule(atoms, bonds, opts, zoom),
    [atoms, bonds, opts, zoom]
  );

  // Two-letter element symbols stay centered; single uppercase is now left-aligned
  const isTwoLetterElementSymbol = (s: string) => /^[A-Z][a-z]$/.test(s);

  // Measure first character width in px to compute world-offset so that
  // the first character center sits on the atom position even for left-aligned labels.
  const fontFamily =
    "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  const measRef = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    return ctx;
  }, []);
  const firstCharHalfWidthWorld = (text: string, fontPxWorld: number) => {
    const ch = text && text.length > 0 ? text[0] : "H";
    const ctx = measRef;
    if (!ctx) return 0;
    const fontPx = fontPxWorld * Math.max(zoom, 1e-6);
    ctx.font = `${fontPx}px ${fontFamily}`;
    const w = ctx.measureText(ch).width;
    const halfPx = w * 0.5;
    const halfWorld = halfPx / Math.max(zoom, 1e-6);
    return halfWorld;
  };

  return (
    <group>
      {layout.texts.map((t, i) => {
        const leftAligned = !isTwoLetterElementSymbol(t.text);
        const dx = leftAligned ? firstCharHalfWidthWorld(t.text, t.fontPx) : 0;
        return (
          <Text
            key={`txt-${i}`}
            position={[t.x - dx, t.y, 0]}
            fontSize={
              opts.units === "px" ? t.fontPx / Math.max(zoom, 1e-6) : t.fontPx
            }
            color="black"
            anchorX={leftAligned ? "left" : "center"}
            anchorY="middle"
            renderOrder={30}
            material-depthTest={false}
            material-depthWrite={false}
          >
            {t.text}
          </Text>
        );
      })}
    </group>
  );
}
