import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useCallback, useState } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { createSVG, layoutMolecule } from "../../../lib/chem/layout2d";
import { writeMolfile, writeSdf } from "../../../lib/chem/molWriter";
import { styleOf, type DrawingStyle } from "../../../lib/chem/style";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { editorLayoutOptions, layoutBonds } from "./layoutOptions";
import { useEditorStore } from "./store";
import type { EditorState, Model } from "./store/types";

/** A file's name without its folder or its extension. */
function stem(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "";
  return name.replace(/\.[^.]*$/, "");
}

/**
 * The structure as the file at `path` is to hold it: an SD file for `.sdf`,
 * a MOL file for anything else, titled with the file's own name.
 */
export function structureFileText(model: Model, path: string): string {
  const title = stem(path);
  return /\.sdf$/i.test(path)
    ? writeSdf(model, { title })
    : writeMolfile(model, { title });
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
 * The drawing as SVG, exactly as the canvas lays it out, at the style's own
 * size. Lines keep their true width however thin - the canvas's on-screen
 * minimum is for the screen - and the margin round it is a few pixels.
 */
export function drawingSvg(
  model: Model,
  aromatic: Pick<EditorState, "aromaticEnabled" | "aromaticRings">,
  style: DrawingStyle,
): string {
  const atoms = model.atoms.map((a) => ({ id: a.id, x: a.x, y: a.y, el: a.el }));
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
  return createSVG(layoutMolecule(atoms, bonds, opts, exportPxPerWorld(style)), opts);
}

/**
 * Save, Save As and Export SVG for the canvas this is called in. Save writes
 * where the canvas was last saved, or asks where the first time; either way
 * the document is then saved, and the tab's unsaved mark goes. An export is
 * a copy, and leaves that alone. `error` says what went wrong, if anything.
 */
export function useFileActions() {
  const store = useEditorStore();
  const [error, setError] = useState<string | null>(null);

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
      await writeTextFile(path, structureFileText(store.getState().model, path));
      store.getState().markSavedAs(path);
    },
    [store],
  );

  const saveAs = useCallback(
    () =>
      attempt("Save", async () => {
        const path = await saveDialog({
          title: "Save structure",
          defaultPath: store.getState().savedPath ?? "structure.mol",
          filters: [
            { name: "MOL file", extensions: ["mol"] },
            { name: "SD file", extensions: ["sdf"] },
          ],
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
        const saved = store.getState().savedPath;
        const path = await saveDialog({
          title: "Export as SVG",
          defaultPath: saved ? `${stem(saved)}.svg` : "structure.svg",
          filters: [{ name: "SVG picture", extensions: ["svg"] }],
        });
        if (!path) return;
        const state = store.getState();
        // The style the canvas is drawn in: the document's own, or the app's.
        const style = styleOf(state.docStyle ?? useAppSettings.getState().drawingStyle);
        await writeTextFile(path, drawingSvg(state.model, state, style));
      }),
    [attempt, store],
  );

  return { save, saveAs, exportSvg, error, dismissError: () => setError(null) };
}
