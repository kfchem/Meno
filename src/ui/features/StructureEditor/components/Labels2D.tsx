import { Text } from "@react-three/drei";
import * as THREE from "three";
import { useEffect } from "react";
import { labelSetOf, placeLabel } from "../../../../lib/chem/layout2d";
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
  const { layout, opts, zoom } = useDrawnLayout();

  // Set in the style's typeface, where the layout has placed each run: the
  // font the layout measures in is the one drawn with, so nothing needs
  // measuring here. Until the font is known nothing is drawn, rather than a
  // label in some other font that then jumps.
  const family = opts.fontFamily ?? "Arial";
  const texts = layout.texts.map((t) => t.text);
  const font = useLabelFontUrl(family, needsFallback(texts));
  // what no font of Meno's has goes on the network's record, once known
  const key = texts.join("\n");
  useEffect(() => {
    if (font !== null) noteUncovered(family, key.split("\n"));
  }, [font, family, key]);
  if (font === null) return null;
  return (
    <group>
      {layout.texts.map((t, i) => {
        const fontWorld =
          opts.units === "px" ? t.fontPx / Math.max(zoom, 1e-6) : t.fontPx;
        return (
          <group key={`txt-${i}`}>
            {/* (a mark - a charge's circle, a radical's dot - is drawn with the lines) */}
            {placeLabel(t, fontWorld, labelSetOf(opts)).map((run, k) => run.mark ? null : (
              // (an italic run - the t of t-Bu - slanted about its baseline)
              <group key={`run-${k}`} position={[run.x, run.y, 0]} matrixAutoUpdate={!run.italic} matrix={run.italic ? slanted(run.x, run.y) : undefined}>
                <Text
                  font={font}
                  fontSize={run.size}
                  color={opts.labelColor ?? "black"}
                  anchorX="left"
                  anchorY="top-baseline"
                  renderOrder={30}
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
      })}
    </group>
  );
}
