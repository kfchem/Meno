import * as React from "react";
import { useEditor } from "../store";
import {
  createSVG,
  layoutMolecule,
  type Atom as LAtom,
  type Bond as LBond,
  type LayoutOptions,
} from "../../../../lib/chem/layout2d";
import { averageBondLengthWorld } from "../../../../lib/chem/acs";
import { editorLayoutOptions, layoutBonds } from "../layoutOptions";
import type { Bond } from "../store/types";

/**
 * The model as the layout takes it - every bond through `layoutBonds`, as the
 * canvas draws it, so an export keeps the side a double bond's second line
 * takes, which way a wedge points and how a bond is displayed.
 */
function toLayoutInputs(model: {
  atoms: { id: number; x: number; y: number; el: string }[];
  bonds: Bond[];
}): { atoms: LAtom[]; bonds: LBond[] } {
  const atoms: LAtom[] = model.atoms.map((a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    el: a.el,
  }));
  const idToIndex = new Map<number, number>();
  for (let i = 0; i < atoms.length; i++) idToIndex.set(atoms[i].id, i);
  return { atoms, bonds: layoutBonds(model.bonds, idToIndex) };
}

// ACS style helpers centralized in lib/chem/acs

function downloadText(name: string, text: string, type = "image/svg+xml") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ExportSvg2D({
  filename = "molecule.svg",
  options,
  renderButton = false,
}: {
  filename?: string;
  options?: Partial<LayoutOptions>;
  renderButton?: boolean;
}) {
  // no camera dependency for export scale; use canonical px-per-bond
  const { model, aromaticEnabled, aromaticRings } = useEditor();
  const { atoms, bonds } = React.useMemo(() => toLayoutInputs(model), [model]);
  const Lworld = React.useMemo(
    () => averageBondLengthWorld(atoms, bonds),
    [atoms, bonds]
  );
  const targetLpx = 36; // ACS-like nominal bond length in px for export
  const pxPerWorld = Math.max(targetLpx / Math.max(Lworld, 1e-6), 1e-6);
  const opts = React.useMemo(() => {
    const keys = Object.keys(aromaticRings || {}).filter(
      (k) => aromaticRings[k]
    );
    const aromaticCircle =
      keys.length > 0
        ? { enabled: new Set(keys) }
        : aromaticEnabled
        ? true
        : false;
    // the same options the canvas draws with, so an export matches it; the
    // export's own scale is the zoom the layout is built for
    return editorLayoutOptions(atoms, bonds, { aromaticCircle, ...options });
  }, [atoms, bonds, options, aromaticEnabled, aromaticRings]);
  const onExport = React.useCallback(() => {
    const layout = layoutMolecule(atoms, bonds, opts, pxPerWorld);
    const svg = createSVG(layout, opts);
    downloadText(filename, svg);
  }, [atoms, bonds, opts, pxPerWorld, filename]);
  // If embedding UI is desired elsewhere, set renderButton=true to show a simple button.
  if (renderButton) {
    const wrap: React.CSSProperties = {
      position: "absolute",
      top: 12,
      right: 12,
      zIndex: 20,
    };
    const btn: React.CSSProperties = {
      padding: "6px 10px",
      background: "rgba(255,255,255,0.9)",
      border: "1px solid rgba(0,0,0,0.2)",
      borderRadius: 6,
      fontSize: 12,
      cursor: "pointer",
    };
    return (
      <div style={wrap}>
        <button style={btn} onClick={onExport}>
          Export SVG
        </button>
      </div>
    );
  }
  return null;
}
