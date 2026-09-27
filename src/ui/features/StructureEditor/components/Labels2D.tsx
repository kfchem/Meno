import { Text } from "@react-three/drei";
import { labelSetOf, placeLabel } from "../../../../lib/chem/layout2d";
import { useLabelFont } from "../labelFont";
import { useDrawnLayout } from "./drawnLayoutContext";

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
  const font = useLabelFont(opts.fontFamily ?? "Arial");
  if (font === null) return null;
  return (
    <group>
      {layout.texts.map((t, i) => {
        const fontWorld =
          opts.units === "px" ? t.fontPx / Math.max(zoom, 1e-6) : t.fontPx;
        return (
          <group key={`txt-${i}`}>
            {placeLabel(t, fontWorld, labelSetOf(opts)).map((run, k) => (
              <Text
                key={`run-${k}`}
                font={font}
                position={[run.x, run.y, 0]}
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
            ))}
          </group>
        );
      })}
    </group>
  );
}
