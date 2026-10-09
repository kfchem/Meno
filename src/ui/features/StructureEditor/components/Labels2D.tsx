import { Text } from "@react-three/drei";
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { TAU, follow } from "../../../theme/motion";
import { labelSetOf, placeLabel, type TextItem } from "../../../../lib/chem/layout2d";
import {
  needsFallback,
  noteUncovered,
  useLabelFontUrl,
} from "../../../fonts/typefaces";
import { useDrawnLayout } from "./drawnLayoutContext";

/**
 * How far an italic run leans: about the slant of a sans-serif's italic.
 * The canvas leans the label's own letters; a picture asks for the
 * typeface's italic.
 */
const ITALIC_SLANT = Math.tan((12 * Math.PI) / 180);

/** A run at (x, y), its baseline, leaning to the right above it. */
function slanted(x: number, y: number): THREE.Matrix4 {
  return new THREE.Matrix4().set(1, ITALIC_SLANT, 0, x, 0, 1, 0, y, 0, 0, 1, 0, 0, 0, 0, 1);
}

/**
 * The drawing's atom labels, from the shared layout - which puts an atom
 * being dragged where it is being dragged to, so its label goes with it.
 */
export default function Labels2D() {
  const { layout } = useDrawnLayout();
  return <Texts2D texts={layout.texts} />;
}

/**
 * Texts set as the drawing sets its labels (lib/chem/layout2d `placeLabel`):
 * the labels, and the words on the page (Captions2D) - and words carried
 * out of a PDF (WordsFlight), `moved`: each text's group placed, and its
 * letters seen, by what draws them, frame by frame; given `shadow` (how far
 * it is blurred), as their shadow alone.
 */
export function Texts2D({ texts: items, moved, shadow, renderOrder = 30 }: { texts: readonly TextItem[]; moved?: boolean; shadow?: string; renderOrder?: number }) {
  const { opts, zoom } = useDrawnLayout();

  // Set in the style's typeface, where the layout has placed each run: the
  // font the layout measures in is the one drawn with, so nothing needs
  // measuring here. Until the font is known nothing is drawn, rather than a
  // label in some other font that then jumps.
  const family = opts.fontFamily ?? "Arial";
  const texts = items.map((t) => t.text);
  const font = useLabelFontUrl(family, needsFallback(texts));
  // what no font of Meno's has goes on the network's record, once known
  const key = texts.join("\n");
  useEffect(() => {
    if (font !== null) noteUncovered(family, key.split("\n"));
  }, [font, family, key]);
  // Once the font is in, the labels fade in (TAU.quick) rather than appear:
  // each label's own opacity brought up a frame at a time, not the labels
  // drawn again - a drawing can have thousands.
  const seen = useRef<{ font: string | null; level: number }>({ font: null, level: 0 });
  if (seen.current.font !== font) seen.current = { font, level: 0 };
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((st) => st.invalidate);
  useFrame((_, dt) => {
    const s = seen.current;
    if (s.font === null || s.level === 1) return;
    const n = follow(s.level, 1, Math.min(dt, 1 / 20), TAU.quick);
    s.level = n > 0.99 ? 1 : n;
    if (moved) return;
    group.current?.traverse((o) => {
      if ("fillOpacity" in o) (o as unknown as { fillOpacity: number }).fillOpacity = s.level;
    });
    invalidate();
  });
  // (labels sized in the drawing's own units are the same at any zoom: the
  // view zooming leaves them as they are)
  const labelZoom = opts.units === "px" ? zoom : null;
  const labelColor = opts.labelColor ?? "black";
  const labels = useMemo(() => {
    if (font === null) return null;
    const set = labelSetOf(opts);
    const fill = shadow || moved ? 0 : seen.current.level;
    return items.map((t, i) => {
      const fontWorld = labelZoom != null ? t.fontPx / Math.max(labelZoom, 1e-6) : t.fontPx;
      return (
        <group key={`txt-${i}`}>
          {/* (a mark - a charge's circle, a radical's dot - is drawn with the lines) */}
          {placeLabel(t, fontWorld, set).map((run, k) => run.mark ? null : (
            // (an italic run - the t of t-Bu - slanted about its baseline)
            <group key={`run-${k}`} position={[run.x, run.y, 0]} matrixAutoUpdate={!run.italic} matrix={run.italic ? slanted(run.x, run.y) : undefined}>
              <Text
                font={font}
                fontSize={run.size}
                color={labelColor}
                fillOpacity={fill}
                anchorX="left"
                anchorY="top-baseline"
                renderOrder={renderOrder}
                {...(shadow ? { outlineBlur: shadow, outlineColor: "black", outlineOpacity: 0 } : {})}
                material-toneMapped={false}
                material-depthTest={false}
                material-depthWrite={false}
              >
                {run.text}
              </Text>
            </group>
          ))}
        </group>
      );
    });
  }, [items, opts, labelZoom, labelColor, font, moved, shadow, renderOrder]);
  if (font === null) return null;
  return <group ref={group}>{labels}</group>;
}
