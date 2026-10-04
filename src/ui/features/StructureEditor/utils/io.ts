import {
  detectFormat,
  readMoleculesFromText,
  moleculesToEditorModel,
  buildEditorModelFromRXN,
  type EditorModel,
} from "../../../../utils/importers";
import { bondChem, chemistry, type Molecule } from "../../../../lib/chem/molecule";
import type { Carried3D, Drawn, Model, Molecule3D } from "../store/types";
import { currentStyle3D } from "../style3d";
import { lookOf, rowAbout, solidOf } from "./molecule3d";
import { energiesOf } from "../../../../lib/calc/readers";

/** Extensions the file pickers offer that have no parser yet. */
const UNSUPPORTED_EXTENSIONS = new Set(["pdb", "ket"]);

export type ProcessedFileResult = {
  model: EditorModel;
  centroid: { x: number; y: number };
  arrow?: { x1: number; y1: number; x2: number; y2: number };
  /** A reaction's "+" signs: their middles. */
  pluses?: { x: number; y: number }[];
  /** Molecules in 3D, as a file of 3D structures has them: not yet placed on the page. */
  molecules3d?: Omit<Molecule3D, "id" | "at">[];
};

/**
 * Whether each molfile of a MOL or SD file says it is 3D: its header's
 * second line, columns 21 and 22 (CTfile Formats).
 */
function saysThreeD(text: string): boolean[] {
  return text
    .split(/^\$\$\$\$[ \t]*\r?$/m)
    .filter((rec) => rec.trim())
    // (each record after the first begins with the line break that ended "$$$$";
    // a molfile's name line may itself be blank)
    .map((rec) => rec.replace(/^\r?\n/, "").split(/\r?\n/)[1]?.substring(20, 22).toUpperCase() === "3D");
}

/** An XYZ file's comment lines, one for each frame: what is left of it once its geometry is read. */
export function xyzComments(text: string): string[] {
  const lines = text.replace(/^\s+/, "").split(/\r?\n/);
  const comments: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const n = parseInt(lines[i].trim(), 10);
    if (!Number.isFinite(n) || n <= 0) break;
    comments.push(lines[i + 1] ?? "");
    i += 2 + n;
  }
  return comments;
}

/** How far a molecule's atoms spread in depth, in its file's units. */
function depthOf(m: Molecule): number {
  if (!m.atoms.length) return 0;
  const zs = m.atoms.map((a) => a.z);
  return Math.max(...zs) - Math.min(...zs);
}

/**
 * Process file content and return a standardized result.
 *
 * Detects file format, parses the content, and returns the model with centroid and optional arrow.
 * The caller is responsible for:
 * - Centering (subtract centroid from all atoms) for replace operations
 * - Shifting by drop point for append operations
 * - Adding the arrow to the store (for RXN files)
 */
export async function processFileContent(
  filename: string,
  content: string,
): Promise<ProcessedFileResult> {
  const format = detectFormat(filename, content);
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const name = filename || "the file";
  // Errors are shown to the user as-is, so keep the messages readable.
  if (!format && UNSUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(
      `${ext.toUpperCase()} files are not supported yet (${name}).`,
    );
  }
  const noMolecules = () =>
    new Error(
      `No molecules found in ${name}. Supported formats: MOL, SDF, RXN, XYZ.`,
    );

  if (format === "rxn") {
    // RXN format: uses pre-computed layout with arrow
    const rxnLayout = buildEditorModelFromRXN(content);
    if (!rxnLayout.model.atoms.length) throw noMolecules();
    return {
      model: rxnLayout.model,
      centroid: rxnLayout.centroid,
      arrow: rxnLayout.arrow ?? undefined,
      pluses: rxnLayout.pluses,
    };
  }

  // MOL, SDF, XYZ formats: parse molecules and convert to editor model
  // If no format detected, try to parse as MOL anyway (or fail gracefully)
  const molecules = readMoleculesFromText(content, format || "mol");

  // 3D structures stand on the page as they are: an XYZ file's frames are
  // one molecule's, a MOL or SD file's records each a molecule of its own -
  // where the file says it is 3D, or its atoms spread in depth.
  if (format === "xyz" && molecules.length && molecules[0].atoms.length) {
    const [first, ...rest] = molecules;
    // (what else the file says - each frame's energy - is a calculation
    // reader's to find: lib/calc)
    const energies = rest.length ? energiesOf(xyzComments(content)) : undefined;
    return {
      model: { atoms: [], bonds: [] },
      centroid: { x: 0, y: 0 },
      molecules3d: [
        {
          atoms: first.atoms,
          bonds: first.bonds,
          ...(rest.length ? { frames: rest.map((f) => f.atoms.flatMap((a) => [a.x, a.y, a.z])) } : {}),
          ...(energies?.length === molecules.length ? { energies } : {}),
          ...(filename ? { name: filename } : {}),
        },
      ],
    };
  }
  // (in a MOL or SD file, each record is a drawing or a molecule in 3D)
  const said = format === "sdf" || format === "mol" ? saysThreeD(content) : [];
  const inDepth = (m: Molecule, i: number) => m.atoms.length > 0 && (said[i] || depthOf(m) > 0.1);
  const molecules3d = molecules
    .filter(inDepth)
    .map((m) => ({ atoms: m.atoms, bonds: m.bonds, ...(filename ? { name: filename } : {}) }));
  const flat = molecules.filter((m, i) => !inDepth(m, i));
  if (molecules3d.length && !flat.some((m) => m.atoms.length)) {
    return { model: { atoms: [], bonds: [] }, centroid: { x: 0, y: 0 }, molecules3d };
  }
  const { model, centroid } = moleculesToEditorModel(flat);
  // The MOL parser returns an empty molecule rather than nothing for
  // unrecognised text, so check atoms, not molecules.
  if (!model.atoms.length) throw noMolecules();

  return {
    model,
    centroid,
    ...(molecules3d.length ? { molecules3d } : {}),
  };
}

/**
 * An imported model as the editor holds it: every atom and bond with the
 * fields the drawing needs, defaults filled in.
 */
export function editorModelOf(mdl: { atoms: any[]; bonds: any[] }): Model {
  return {
    atoms: mdl.atoms.map((a) => ({
      id: a.id,
      x: a.x,
      y: a.y,
      r: a.r ?? 0.9,
      el: a.el ?? "C",
      ...chemistry(a),
    })),
    bonds: mdl.bonds.map((b) => ({
      id: b.id,
      a: b.a,
      b: b.b,
      order: (b.order as 1 | 2 | 3) ?? 1,
      stereo: b.stereo ?? "none",
      stereoOrient: b.stereoOrient ?? "principle",
      ...(b.doubleMode ? { doubleMode: b.doubleMode } : {}),
      ...(b.display ? { display: b.display } : {}),
      ...(b.dative ? { dative: true } : {}),
      ...bondChem(b),
    })),
  };
}

/** What a file read holds as the editor draws it: the structures, and a reaction's arrow and "+" signs. */
export function drawnOf(result: ProcessedFileResult): Drawn {
  const a = result.arrow;
  return {
    ...editorModelOf(result.model),
    ...(a
      ? {
          arrows: [
            {
              id: 1,
              x: (a.x1 + a.x2) / 2,
              y: (a.y1 + a.y2) / 2,
              angle: Math.atan2(a.y2 - a.y1, a.x2 - a.x1),
              length: Math.hypot(a.x2 - a.x1, a.y2 - a.y1),
            },
          ],
        }
      : {}),
    ...(result.pluses?.length ? { pluses: result.pluses.map((p, i) => ({ id: i + 1, ...p })) } : {}),
    ...(result.molecules3d?.length ? { molecules3d: inRow(result.molecules3d) } : {}),
  };
}

/** A file's molecules in 3D, standing in a row about the origin, each clear of the next. */
function inRow(ms: Omit<Molecule3D, "id" | "at">[]): Carried3D[] {
  const placed = ms.map((m) => ({ ...m, id: 0, at: { x: 0, y: 0 } }));
  const style = currentStyle3D();
  const at = rowAbout({ x: 0, y: 0 }, placed.map((m) => solidOf(m, style).reach[lookOf(m, style)]));
  return ms.map((m, i) => ({ ...m, at: at[i] }));
}
