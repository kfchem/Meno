import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useCallback, useRef, useState } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { createSVG, layoutMolecule, type Layout, type LayoutOptions } from "../../../lib/chem/layout2d";
import { writeMolfile, writeSdf } from "../../../lib/chem/molWriter";
import { forFlatReaders } from "./chem/drawing";
import { reactionFileText } from "./chem/reactionFile";
import { styleOf, type DrawingStyle } from "../../../lib/chem/style";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { editorLayoutOptions, layoutBonds } from "./layoutOptions";
import { useEditorStore } from "./store";
import type { Drawn, EditorState } from "./store/types";
import { chemistry } from "../../../lib/chem/molecule";
import { schemeOutlines } from "../../../lib/chem/reactionScheme";

/** A file's name without its folder. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? "";
}

/** A file's name without its folder or its extension. */
function stem(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "";
  return name.replace(/\.[^.]*$/, "");
}

/**
 * Where Save As suggests saving: where the canvas was last saved; else the
 * name of the file last opened over it - as a MOL or RXN file, if it was
 * none Meno writes; else a name for what is drawn.
 */
export function suggestedSavePath(
  state: Pick<EditorState, "savedPath" | "openedName">,
  reaction: boolean,
): string {
  if (state.savedPath) return state.savedPath;
  const ext = reaction ? "rxn" : "mol";
  const opened = state.openedName;
  if (opened) return /\.(mol|sdf|rxn)$/i.test(opened) ? opened : `${stem(opened)}.${ext}`;
  return reaction ? "reaction.rxn" : "structure.mol";
}

/**
 * The drawing as the file at `path` is to hold it: an RXN file for `.rxn` -
 * the reaction its arrow shows, throwing where it shows none - an SD file
 * for `.sdf`, a MOL file for anything else, titled with the file's own
 * name. A cage drawn in perspective is given the wedges that say its
 * stereochemistry, which the file has no other way to hold.
 */
export function structureFileText(drawn: Drawn, path: string): string {
  const title = stem(path);
  if (/\.rxn$/i.test(path)) return reactionFileText(drawn, title);
  const flat = forFlatReaders(drawn);
  return /\.sdf$/i.test(path)
    ? writeSdf(flat, { title })
    : writeMolfile(flat, { title });
}

/**
 * CSS pixels to the world unit when a drawing is exported: the style's bond
 * length, at 96 px to the inch, so a picture placed in a document comes in
 * at the size the style draws it - 14.4 pt to the bond in ACS 1996.
 */
export function exportPxPerWorld(style: DrawingStyle): number {
  return (style.bondLengthPt * 96) / 72 / NOMINAL_BOND_LENGTH;
}

/**
 * The drawing exactly as the canvas lays it out, at the style's own size,
 * for a picture made of it - its reaction arrows and "+" signs with it.
 * Lines keep their true width however thin - the canvas's on-screen minimum
 * is for the screen - and the margin round it is a few pixels.
 */
export function drawingLayout(
  model: Drawn,
  aromatic: Pick<EditorState, "aromaticEnabled" | "aromaticRings">,
  style: DrawingStyle,
): { layout: Layout; opts: LayoutOptions } {
  const atoms = model.atoms.map((a) => ({ id: a.id, x: a.x, y: a.y, el: a.el, ...chemistry(a), ...(a.z != null ? { z: a.z } : {}) }));
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const bonds = layoutBonds(model.bonds, index);
  const enabled = Object.keys(aromatic.aromaticRings || {}).filter(
    (k) => aromatic.aromaticRings[k],
  );
  const aromaticCircle =
    enabled.length > 0
      ? { enabled: new Set(enabled) }
      : !!aromatic.aromaticEnabled;
  const opts = editorLayoutOptions(style, {
    aromaticCircle,
    minLinePx: 0,
    paddingPx: 4,
  });
  const layout = layoutMolecule(atoms, bonds, opts, exportPxPerWorld(style));
  const outlines = schemeOutlines(model, style, NOMINAL_BOND_LENGTH);
  if (outlines.length) {
    const points = outlines.flat();
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const { min, max } = layout.bounds;
    const none = !model.atoms.length;
    layout.polys.push(...outlines.map((o) => ({ points: o })));
    layout.bounds = {
      min: { x: Math.min(none ? Infinity : min.x, ...xs), y: Math.min(none ? Infinity : min.y, ...ys) },
      max: { x: Math.max(none ? -Infinity : max.x, ...xs), y: Math.max(none ? -Infinity : max.y, ...ys) },
    };
  }
  return { layout, opts };
}

/** The drawing as SVG (drawingLayout). */
export function drawingSvg(
  model: Drawn,
  aromatic: Pick<EditorState, "aromaticEnabled" | "aromaticRings">,
  style: DrawingStyle,
): string {
  const { layout, opts } = drawingLayout(model, aromatic, style);
  return createSVG(layout, opts);
}

/**
 * Save, Save As and Export SVG for the canvas this is called in. Save writes
 * where the canvas was last saved, or asks where the first time; either way
 * the document is then saved, and the tab's unsaved mark goes. An export is
 * a copy, and leaves that alone. `error` says what went wrong, if anything.
 */
export function useFileActions(nameTab?: (label: string) => void) {
  const store = useEditorStore();
  const [error, setError] = useState<string | null>(null);
  // (the tab is named for the file it is saved to, as for one opened in it)
  const naming = useRef(nameTab);
  naming.current = nameTab;

  const attempt = useCallback(async (what: string, run: () => Promise<void>) => {
    try {
      setError(null);
      await run();
    } catch (e) {
      setError(`${what} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const saveTo = useCallback(
    async (path: string) => {
      await writeTextFile(path, structureFileText(drawnOf(store.getState()), path));
      store.getState().markSavedAs(path);
      naming.current?.(fileNameOf(path));
    },
    [store],
  );

  const saveAs = useCallback(
    () =>
      attempt("Save", async () => {
        // a reaction, as an RXN file first
        const reaction = store.getState().arrows.length > 0;
        const structure = [
          { name: "MOL file", extensions: ["mol"] },
          { name: "SD file", extensions: ["sdf"] },
        ];
        const rxn = { name: "RXN file", extensions: ["rxn"] };
        const path = await saveDialog({
          title: reaction ? "Save reaction" : "Save structure",
          defaultPath: suggestedSavePath(store.getState(), reaction),
          filters: reaction ? [rxn, ...structure] : [...structure, rxn],
        });
        if (path) await saveTo(path);
      }),
    [attempt, saveTo, store],
  );

  const save = useCallback(() => {
    const path = store.getState().savedPath;
    return path ? attempt("Save", () => saveTo(path)) : saveAs();
  }, [attempt, saveAs, saveTo, store]);

  const exportSvg = useCallback(
    () =>
      attempt("Export", async () => {
        const { savedPath, openedName } = store.getState();
        const named = savedPath ?? openedName;
        const path = await saveDialog({
          title: "Export as SVG",
          defaultPath: named ? `${stem(named)}.svg` : "structure.svg",
          filters: [{ name: "SVG picture", extensions: ["svg"] }],
        });
        if (!path) return;
        const state = store.getState();
        // The style the canvas is drawn in: the document's own, or the app's.
        const style = styleOf(state.docStyle ?? useAppSettings.getState().drawingStyle);
        await writeTextFile(path, drawingSvg(drawnOf(state), state, style));
      }),
    [attempt, store],
  );

  return { save, saveAs, exportSvg, error, dismissError: () => setError(null) };
}

/** Everything the canvas draws: its structures, arrows and "+" signs. */
export function drawnOf(state: Pick<EditorState, "model" | "arrows" | "pluses">): Drawn {
  return { ...state.model, arrows: state.arrows, pluses: state.pluses };
}
