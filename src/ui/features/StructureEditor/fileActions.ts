import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useCallback, useRef, useState } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { createSVG, labelSetOf, layoutMolecule, measureLabelBox, type Layout, type LayoutOptions } from "../../../lib/chem/layout2d";
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
import { measurePictureMarks } from "./utils/measure3d";
import { MARK_SCALE } from "./chem/marks";
import { currentStyle3D } from "./style3d";
import { withSolidsImage } from "./render3d";
import { chemistry } from "../../../lib/chem/molecule";
import { schemeOutlines } from "../../../lib/chem/reactionScheme";
import type { OptionValues } from "../../../lib/options";
import { WRITERS, type WriterId } from "../../../lib/io/writers";

/** A file's name without its folder. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? "";
}

/** A file's name without its folder or its extension. */
function stem(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "";
  return name.replace(/\.[^.]*$/, "");
}

/** What is on a canvas, as far as what it can be exported as goes. */
export type Holds = { solid: boolean; reaction: boolean; drawn: boolean };

/** What is on the canvas, as far as what it can be exported as goes. */
export const holdsOf = (state: Pick<EditorState, "molecules3d" | "arrows" | "model">): Holds => ({
  solid: state.molecules3d.length > 0,
  reaction: state.arrows.length > 0,
  drawn: state.model.atoms.length > 0,
});

/**
 * What a canvas can be exported as, the one suggested first (docs/FILE-IO.md:
 * Save writes a workspace, everything else is Export): a reaction, as an
 * RXN file first; molecules in 3D with nothing drawn beside them, as an SD
 * file, which keeps them; a structure, as a MOL file first. Always as a
 * picture too.
 */
export function exportKinds(what: Holds): WriterId[] {
  if (what.reaction) return ["rxn", "mol", "sdf", "svg"];
  if (what.solid && !what.drawn) return ["sdf", "svg"];
  return ["mol", "sdf", "svg"];
}

/** `path` with the extension `ext` in place of its own. */
function withExtension(path: string, ext: string): string {
  return `${path.replace(/\.[^.\\/]*$/, "")}.${ext}`;
}

/**
 * Where Save As suggests saving the workspace: where the canvas was last
 * saved; else beside the file last opened over it - in its folder, where
 * Open said where it was; else "workspace.meno".
 */
export function suggestedSavePath(state: Pick<EditorState, "savedPath" | "openedName">): string {
  const from = state.savedPath ?? state.openedName;
  return from ? withExtension(from, "meno") : "workspace.meno";
}

/** The kind of the file the canvas was saved to or opened from, where the canvas can be exported as it. */
export function exportKindOf(state: Pick<EditorState, "savedPath" | "openedName">, what: Holds): WriterId | undefined {
  const from = (state.savedPath ?? state.openedName ?? "").toLowerCase();
  return exportKinds(what).find((k) => from.endsWith(`.${k}`));
}

/**
 * Where Export suggests writing the canvas as `kind` - unless said, the kind
 * of the file it came from, or else the first it can be exported as: the
 * canvas's name - where it was saved, or the file opened over it - as that
 * kind; else a name for what is on it.
 */
export function suggestedExportPath(
  state: Pick<EditorState, "savedPath" | "openedName">,
  what: Holds,
  kind = exportKindOf(state, what) ?? exportKinds(what)[0],
): string {
  const from = state.savedPath ?? state.openedName;
  if (from) return from.toLowerCase().endsWith(`.${kind}`) ? from : withExtension(from, kind);
  return `${what.reaction ? "reaction" : what.solid && !what.drawn ? "molecules" : "structure"}.${kind}`;
}

/**
 * The drawing as the file at `path` is to hold it: an RXN file for `.rxn` -
 * the reaction its arrow shows, throwing where it shows none - an SD file
 * for `.sdf`, a MOL file for anything else, titled with the file's own
 * name, as the writer's options say (lib/io/writers): in V3000, or in V2000
 * where V2000 holds it; an SD file's molecules in 3D in the frame each
 * shows, or in every frame. A cage drawn in perspective is given the wedges
 * that say its stereochemistry, which the file has no other way to hold.
 */
export function structureFileText(drawn: Drawn, path: string, options: OptionValues = {}): string {
  const title = stem(path);
  const version = options.version === "V3000" ? "V3000" : "auto";
  if (/\.rxn$/i.test(path)) return reactionFileText(drawn, title, version);
  const flat = forFlatReaders(drawn);
  if (!/\.sdf$/i.test(path)) return writeMolfile(flat, { title, version });
  // an SD file: the drawing, and each molecule in 3D a record of its own,
  // in 3D - the frame it shows, where its file had it, or each of its
  // frames, numbered, with its energy where it is known
  const records = (drawn.molecules3d ?? []).flatMap((m) => {
    const name = m.name ? stem(m.name) : title;
    if (options.frames !== "all") return [writeMolfile3d(frameAtoms(m, m.frame), m.bonds, { title: name }) + "$$$$\n"];
    const frames = 1 + (m.frames ?? []).filter((f) => f.length === 3 * m.atoms.length).length;
    return Array.from({ length: frames }, (_, i) => {
      const energy = m.energies?.[i];
      const data = energy != null && Number.isFinite(energy) ? `> <Energy (Eh)>\n${energy}\n\n` : "";
      return writeMolfile3d(frameAtoms(m, i), m.bonds, { title: `${name} ${i + 1}` }) + data + "$$$$\n";
    });
  });
  return (drawn.atoms.length ? writeSdf(flat, { title, version }) : "") + records.join("");
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
  // and their measurements, over them: their values as large as the
  // drawing's R and S, and clear of the atoms
  const markSize = (opts.units === "px" ? opts.fontPx / layout.zoom : opts.fontPx) * MARK_SCALE;
  const family = labelSetOf(opts).fontFamily;
  const measures = (model.molecules3d ?? []).flatMap((m) => measurePictureMarks(m, currentStyle3D(), markSize, undefined, family));
  if (measures.length) {
    layout.measures = measures;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const m of measures) {
      for (const [a, b] of m.lines) {
        xs.push(a.x, b.x);
        ys.push(a.y, b.y);
      }
      const box = measureLabelBox(m, family);
      xs.push(box.min.x, box.max.x);
      ys.push(box.min.y, box.max.y);
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
 * Save, Save As and Export for the canvas this is called in. Save writes the
 * workspace - all of it, as it is - where the canvas was last saved, or
 * where the workspace it holds was opened from, or asks where the first
 * time; either way the document is then saved, and the tab's unsaved mark
 * goes. Export writes another kind of file, a copy, with its writer's
 * options (ExportCard), and leaves that alone. `error` says what went
 * wrong, if anything.
 */
export function useFileActions(nameTab?: (label: string) => void) {
  const store = useEditorStore();
  const [error, setError] = useState<string | null>(null);
  // (the tab is named for the file it is saved to, as for one opened in it)
  const naming = useRef(nameTab);
  naming.current = nameTab;

  // (what `run` gives; nothing, where it failed - and then says why)
  const attempt = useCallback(async <T,>(what: string, run: () => Promise<T>): Promise<T | undefined> => {
    try {
      setError(null);
      return await run();
    } catch (e) {
      setError(`${what} failed: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }, []);

  const saveTo = useCallback(
    async (path: string) => {
      await writeTextFile(path, workspaceText(store.getState()));
      store.getState().markSavedAs(path);
      naming.current?.(fileNameOf(path));
    },
    [store],
  );

  /** The canvas saved as a workspace, where the chemist says; whether it was. */
  const saveAs = useCallback(
    async () =>
      (await attempt("Save", async () => {
        const picked = await saveDialog({
          title: "Save workspace",
          defaultPath: suggestedSavePath(store.getState()),
          filters: [{ name: "Meno workspace", extensions: ["meno"] }],
        });
        if (!picked) return false;
        // (a workspace, whatever it was called)
        const path = isWorkspaceFile(picked) ? picked : `${picked}.meno`;
        await saveTo(path);
        return true;
      })) === true,
    [attempt, saveTo, store],
  );

  /** The canvas saved where it was saved last, or else where the chemist says; whether it was. */
  const save = useCallback(async () => {
    const { savedPath: path } = store.getState();
    if (path && isWorkspaceFile(path)) return (await attempt("Save", async () => (await saveTo(path), true))) === true;
    return saveAs();
  }, [attempt, saveAs, saveTo, store]);

  /** The canvas written as `kind` - a MOL, SD or RXN file, a picture - with `options`, where the chemist says. */
  const exportAs = useCallback(
    (kind: WriterId, options: OptionValues) =>
      attempt("Export", async () => {
        const state = store.getState();
        const picked = await saveDialog({
          title: "Export",
          defaultPath: suggestedExportPath(state, holdsOf(state), kind),
          filters: [{ name: WRITERS[kind].name, extensions: [kind] }],
        });
        if (!picked) return;
        // (that kind, whatever it was called)
        const path = picked.toLowerCase().endsWith(`.${kind}`) ? picked : `${picked}.${kind}`;
        // (everything on the canvas, the molecules in 3D as they are seen)
        const drawn = { ...drawnOf(state), molecules3d: carriedOf(state) };
        if (kind === "svg") {
          // The style the canvas is drawn in: the document's own, or the app's.
          const style = styleOf(state.docStyle ?? useAppSettings.getState().drawingStyle);
          await writeTextFile(path, drawingSvg(drawn, state, style, true));
        } else await writeTextFile(path, structureFileText(drawn, path, options));
      }),
    [attempt, store],
  );

  return { save, saveAs, exportAs, error, dismissError: () => setError(null) };
}

/** Everything the canvas draws: its structures, arrows and "+" signs. */
export function drawnOf(state: Pick<EditorState, "model" | "arrows" | "pluses">): Drawn {
  return { ...state.model, arrows: state.arrows, pluses: state.pluses };
}
