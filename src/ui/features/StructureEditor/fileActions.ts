import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useCallback, useRef, useState } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { createSVG, layoutMolecule, type Layout, type LayoutOptions } from "../../../lib/chem/layout2d";
import { writeMolfile, writeMolfile3d, writeSdf, type Atom3D } from "../../../lib/chem/molWriter";
import { forFlatReaders } from "./chem/drawing";
import { reactionFileText } from "./chem/reactionFile";
import { styleOf, type DrawingStyle } from "../../../lib/chem/style";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { editorLayoutOptions, layoutBonds } from "./layoutOptions";
import { useEditorStore } from "./store";
import type { Carried3D, Drawn, EditorState } from "./store/types";
import { carriedOf, isWorkspaceFile, workspaceText } from "./utils/workspace";
import { pictureMarks } from "./utils/molecule3d";
import { currentStyle3D } from "./style3d";
import { withSolidsImage } from "./render3d";
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

/** The kinds of file a canvas is saved as, by extension, with their names. */
const FILE_KINDS = { meno: "Meno workspace", sdf: "SD file", mol: "MOL file", rxn: "RXN file" } as const;
type FileKind = keyof typeof FILE_KINDS;

/**
 * What a canvas can be saved as, the one suggested first: with molecules in
 * 3D, only what keeps them - a workspace, or an SD file; a reaction, as an
 * RXN file first; a structure, as a MOL file first.
 */
export function saveKinds(what: { solid: boolean; reaction: boolean }): FileKind[] {
  if (what.solid) return ["meno", "sdf"];
  return what.reaction ? ["rxn", "mol", "sdf", "meno"] : ["mol", "sdf", "rxn", "meno"];
}

/**
 * Where Save As suggests saving: where the canvas was last saved; else the
 * name of the file last opened over it - either as the first kind it can be
 * saved as (`saveKinds`), if it is none of them; else a name for what is
 * drawn.
 */
export function suggestedSavePath(
  state: Pick<EditorState, "savedPath" | "openedName">,
  what: { solid: boolean; reaction: boolean },
): string {
  const kinds = saveKinds(what);
  const from = state.savedPath ?? state.openedName;
  if (from) {
    const fits = kinds.some((k) => from.toLowerCase().endsWith(`.${k}`));
    return fits ? from : `${from.replace(/\.[^.\\/]*$/, "")}.${kinds[0]}`;
  }
  return `${what.solid ? "workspace" : what.reaction ? "reaction" : "structure"}.${kinds[0]}`;
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
  if (!/\.sdf$/i.test(path)) return writeMolfile(flat, { title });
  // an SD file: the drawing, and each molecule in 3D a record of its own,
  // in 3D - the frame it shows, where its file had it
  const records = (drawn.molecules3d ?? []).map(
    (m) => writeMolfile3d(frameAtoms(m, m.frame), m.bonds, { title: m.name ? stem(m.name) : title }) + "$$$$\n",
  );
  return (drawn.atoms.length ? writeSdf(flat, { title }) : "") + records.join("");
}

/** A molecule in 3D's atoms in one of its frames, where its file had them, in ångströms. */
function frameAtoms(m: Carried3D, frame = 0): Atom3D[] {
  const n = m.atoms.length;
  const xyz = [m.atoms.flatMap((a) => [a.x, a.y, a.z]), ...(m.frames ?? []).filter((f) => f.length === 3 * n)][
    Math.min(Math.max(0, frame), m.frames?.length ?? 0)
  ] ?? m.atoms.flatMap((a) => [a.x, a.y, a.z]);
  return m.atoms.map((a, i) => ({
    el: a.el,
    x: xyz[3 * i],
    y: xyz[3 * i + 1],
    z: xyz[3 * i + 2],
    ...(a.charge ? { charge: a.charge } : {}),
    ...(a.isotope ? { isotope: a.isotope } : {}),
  }));
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
  // (what the drawing reaches so far: nothing, with no atoms)
  let drawn = model.atoms.length > 0;
  const take = (xs: number[], ys: number[]) => {
    const { min, max } = layout.bounds;
    layout.bounds = {
      min: { x: Math.min(drawn ? min.x : Infinity, ...xs), y: Math.min(drawn ? min.y : Infinity, ...ys) },
      max: { x: Math.max(drawn ? max.x : -Infinity, ...xs), y: Math.max(drawn ? max.y : -Infinity, ...ys) },
    };
    drawn = true;
  };
  const outlines = schemeOutlines(model, style, NOMINAL_BOND_LENGTH);
  if (outlines.length) {
    const points = outlines.flat();
    layout.polys.push(...outlines.map((o) => ({ points: o })));
    take(
      points.map((p) => p.x),
      points.map((p) => p.y),
    );
  }
  // and molecules in 3D, as they are seen, over it
  const solids = (model.molecules3d ?? []).flatMap((m) => pictureMarks(m, currentStyle3D()));
  if (solids.length) {
    layout.solids = solids;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const m of solids) {
      if (m.kind === "ball") {
        xs.push(m.c.x - m.r, m.c.x + m.r);
        ys.push(m.c.y - m.r, m.c.y + m.r);
      } else {
        xs.push(m.a.x, m.b.x);
        ys.push(m.a.y, m.b.y);
      }
    }
    take(xs, ys);
  }
  return { layout, opts };
}

/**
 * The drawing as SVG (drawingLayout); its molecules in 3D, `seen`, as an
 * image drawn as the canvas draws them (./render3d), where there is WebGL
 * to draw it with.
 */
export function drawingSvg(
  model: Drawn,
  aromatic: Pick<EditorState, "aromaticEnabled" | "aromaticRings">,
  style: DrawingStyle,
  seen = false,
): string {
  const { layout, opts } = drawingLayout(model, aromatic, style);
  if (seen) {
    try {
      withSolidsImage(model.molecules3d ?? [], layout, currentStyle3D());
    } catch {
      // (the marks, then)
    }
  }
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
      const state = store.getState();
      await writeTextFile(
        path,
        isWorkspaceFile(path)
          ? workspaceText(state)
          : structureFileText({ ...drawnOf(state), molecules3d: carriedOf(state) }, path),
      );
      store.getState().markSavedAs(path);
      naming.current?.(fileNameOf(path));
    },
    [store],
  );

  const saveAs = useCallback(
    () =>
      attempt("Save", async () => {
        const state = store.getState();
        const solid = state.molecules3d.length > 0;
        const reaction = state.arrows.length > 0;
        const path = await saveDialog({
          title: solid ? "Save workspace" : reaction ? "Save reaction" : "Save structure",
          defaultPath: suggestedSavePath(state, { solid, reaction }),
          filters: saveKinds({ solid, reaction }).map((k) => ({ name: FILE_KINDS[k], extensions: [k] })),
        });
        if (path) await saveTo(path);
      }),
    [attempt, saveTo, store],
  );

  const save = useCallback(() => {
    const { savedPath: path, molecules3d } = store.getState();
    // (a MOL or RXN file cannot keep molecules in 3D: asked where, then)
    const keeps = path && (!molecules3d.length || /\.(meno|sdf)$/i.test(path));
    return keeps ? attempt("Save", () => saveTo(path)) : saveAs();
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
        // (everything on the canvas, the molecules in 3D as they are seen)
        await writeTextFile(path, drawingSvg({ ...drawnOf(state), molecules3d: carriedOf(state) }, state, style, true));
      }),
    [attempt, store],
  );

  return { save, saveAs, exportSvg, error, dismissError: () => setError(null) };
}

/** Everything the canvas draws: its structures, arrows and "+" signs. */
export function drawnOf(state: Pick<EditorState, "model" | "arrows" | "pluses">): Drawn {
  return { ...state.model, arrows: state.arrows, pluses: state.pluses };
}
