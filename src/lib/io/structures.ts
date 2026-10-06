/**
 * Meno's own reading of structures' files - MOL, SD, RXN and XYZ files - as
 * a reader under the contract (docs/FILE-IO.md): what such a file holds, as
 * Meno's reader gives it, run in Meno's own worker (lib/calc/menoReads);
 * and the checks the page makes of it, as of any reader's answer.
 */
import { buildEditorModelFromRXN, moleculesToEditorModel, readMoleculesFromText, type EditorModel } from "../../utils/importers";
import { energiesOf } from "../../utils/xyzEnergies";
import type { Molecule, ParsedAtom, ParsedBond } from "../chem/molecule";

/** The kinds of structures' files Meno reads itself. */
export type StructureKind = "mol" | "sdf" | "rxn" | "xyz";

/** A molecule in 3D as a file holds it: not yet placed on the page; showing its first frame, or the one `frame` says. */
export type FileMolecule3D = {
  atoms: ParsedAtom[];
  bonds: ParsedBond[];
  /** The rest of its frames: x, y, z of every atom, frame by frame. */
  frames?: number[][];
  /** Each frame's energy, in hartrees, the first frame's first. */
  energies?: number[];
  /** The file it came from. */
  name?: string;
  frame?: number;
};

/**
 * What a structure's file holds: the drawing - its atoms and bonds where
 * the file lays them out, about `centroid`, and a reaction's arrow and "+"
 * signs - and its molecules in 3D, as the file has them. The caller places
 * them: centred for a file opened, at the drop for one dropped.
 */
export type StructureRead = {
  model: EditorModel;
  centroid: { x: number; y: number };
  arrow?: { x1: number; y1: number; x2: number; y2: number };
  /** A reaction's "+" signs: their middles. */
  pluses?: { x: number; y: number }[];
  molecules3d?: FileMolecule3D[];
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

/** Why a file holds nothing to read, as the chemist is told. */
const noMolecules = (name: string) => new Error(`No molecules found in ${name}. Supported formats: MOL, SDF, RXN, XYZ.`);

/**
 * What a structure's file of `kind` holds: an RXN file's reaction, laid out
 * with its arrow and "+" signs; an XYZ file's frames, one molecule's, in
 * 3D, each with its energy where the comment lines give one; a MOL or SD
 * file's records, each a drawing or - where the file says it is 3D, or its
 * atoms spread in depth - a molecule in 3D.
 */
export function readStructures(kind: StructureKind, filename: string, content: string): StructureRead {
  const name = filename || "the file";
  if (kind === "rxn") {
    // RXN format: uses pre-computed layout with arrow
    const rxnLayout = buildEditorModelFromRXN(content);
    if (!rxnLayout.model.atoms.length) throw noMolecules(name);
    return {
      model: rxnLayout.model,
      centroid: rxnLayout.centroid,
      ...(rxnLayout.arrow ? { arrow: rxnLayout.arrow } : {}),
      ...(rxnLayout.pluses ? { pluses: rxnLayout.pluses } : {}),
    };
  }

  // MOL, SDF, XYZ formats: parse molecules and convert to editor model
  const molecules = readMoleculesFromText(content, kind);

  // 3D structures stand on the page as they are: an XYZ file's frames are
  // one molecule's, a MOL or SD file's records each a molecule of its own -
  // where the file says it is 3D, or its atoms spread in depth.
  if (kind === "xyz" && molecules.length && molecules[0].atoms.length) {
    const [first, ...rest] = molecules;
    // (and each frame's energy, as programs write it on the comment lines)
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
  const said = kind === "sdf" || kind === "mol" ? saysThreeD(content) : [];
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
  if (!model.atoms.length) throw noMolecules(name);
  return { model, centroid, ...(molecules3d.length ? { molecules3d } : {}) };
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPoint = (p: unknown): p is { x: number; y: number } => finite((p as { x?: unknown })?.x) && finite((p as { y?: unknown })?.y);

/**
 * A reader's answer of structures, as the page takes it - checked as any
 * reader's is, whoever gave it: the drawing's atoms each placed and of an
 * element, its bonds between them; each molecule in 3D's atoms placed in
 * 3D, its bonds between them, its frames each as long as its atoms are.
 * Throws, saying what does not read.
 */
export function checkedStructures(raw: unknown, name: string): StructureRead {
  const s = raw as Partial<StructureRead> | null;
  const bad = (what: string) => new Error(`${name} could not be read: ${what}.`);
  const atoms = s?.model?.atoms;
  const bonds = s?.model?.bonds;
  if (!Array.isArray(atoms) || !Array.isArray(bonds) || !isPoint(s?.centroid)) throw bad("no drawing came back");
  if (!atoms.every((a) => isPoint(a) && finite(a.id) && typeof a.el === "string")) throw bad("an atom of its drawing is not placed");
  const ids = new Set(atoms.map((a) => a.id));
  if (!bonds.every((b) => finite(b.id) && ids.has(b.a) && ids.has(b.b))) throw bad("a bond of its drawing joins no atoms");
  if (s!.arrow != null && ![s!.arrow.x1, s!.arrow.y1, s!.arrow.x2, s!.arrow.y2].every(finite)) throw bad("its arrow is not placed");
  if (s!.pluses != null && !(Array.isArray(s!.pluses) && s!.pluses.every(isPoint))) throw bad("a \"+\" sign is not placed");
  for (const m of s!.molecules3d ?? []) {
    const n = m?.atoms?.length ?? 0;
    if (!n || !m.atoms.every((a) => isPoint(a) && finite(a.z) && typeof a.el === "string")) throw bad("a molecule in 3D is not placed");
    if (!(m.bonds ?? []).every((b) => finite(b.a1) && finite(b.a2) && b.a1 >= 0 && b.a2 >= 0 && b.a1 < n && b.a2 < n)) {
      throw bad("a bond of a molecule in 3D joins no atoms");
    }
    if (!(m.frames ?? []).every((f) => Array.isArray(f) && f.length === 3 * n && f.every(finite))) throw bad("a frame of a molecule in 3D is not whole");
  }
  return s as StructureRead;
}
