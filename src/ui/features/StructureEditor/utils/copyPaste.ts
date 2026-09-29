/**
 * What a copy takes and puts on the clipboard, and what a paste makes of
 * what it finds there - pure, over the editor's model (the clipboard
 * itself is lib/clipboard).
 */
import type { ClipItem } from "../../../../lib/clipboard";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { fragmentOf, partOf } from "../chem/cleanUp";
import { forFlatReaders } from "../chem/drawing";
import type { Atom, Bond, Model, Sel } from "../store/types";

type Pt = { x: number; y: number };

/**
 * What a copy takes: the selected atoms and every bond among them - or,
 * with nothing selected, the whole structure `around` an atom (the one
 * under the pointer). Null when that is nothing.
 */
export function partToCopy(model: Model, sel: Sel, around: number | null): Model | null {
  const atoms = sel.atoms.size
    ? new Set([...sel.atoms].filter((id) => model.atoms.some((a) => a.id === id)))
    : around != null && model.atoms.some((a) => a.id === around)
      ? fragmentOf(model, around)
      : new Set<number>();
  return atoms.size ? partOf(model, atoms) : null;
}

/** Meno's own record of a structure on the clipboard, and its version. */
const RECORD = "meno-structure";
const VERSION = 1;

/**
 * What a copy puts on the clipboard: Meno's own record, which loses
 * nothing - labels, wedges' ends, a drawing in perspective - and a MOL
 * file for other chemistry programs, as a saved file has it.
 */
export function clipItems(part: Model): ClipItem[] {
  return [
    { flavor: "meno", text: recordText(part) },
    { flavor: "mol", text: writeMolfile(forFlatReaders(part)) },
  ];
}

/** Meno's own record of a structure, as text: what a picture of it carries too. */
export function recordText(part: Model): string {
  return JSON.stringify({ format: RECORD, version: VERSION, atoms: part.atoms, bonds: part.bonds });
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The structure in Meno's own record, or null if `text` is not one this version reads. */
export function readRecord(text: string): Model | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const r = data as { format?: unknown; version?: unknown; atoms?: unknown; bonds?: unknown };
  if (r?.format !== RECORD || r.version !== VERSION || !Array.isArray(r.atoms) || !Array.isArray(r.bonds)) return null;
  const atoms = r.atoms as Partial<Atom>[];
  const bonds = r.bonds as Partial<Bond>[];
  if (!atoms.every((a) => isNum(a.id) && isNum(a.x) && isNum(a.y) && typeof a.el === "string")) return null;
  const ids = new Set(atoms.map((a) => a.id));
  if (!bonds.every((b) => isNum(b.id) && ids.has(b.a) && ids.has(b.b) && [1, 2, 3].includes(b.order as number))) {
    return null;
  }
  return { atoms: atoms.map((a) => ({ r: 0.9, ...a }) as Atom), bonds: bonds as Bond[] };
}

/** Whether plain text is a MOL file (or an SD file) rather than, say, a SMILES. */
export function looksLikeMolfile(text: string): boolean {
  return /^M {2}END\s*$/m.test(text) && /V[23]000/.test(text);
}

/**
 * Whether plain text could be a SMILES: one word of the characters one is
 * written in. RDKit has the last word on it.
 */
export function looksLikeSmiles(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length < 5000 && /^[A-Za-z0-9@+\-=#$%:.()[\]/\\*~>]+$/.test(t);
}

/** `model` moved so that the middle of the box round it is at `p`. */
export function centredAt(model: Model, p: Pt): Model {
  if (!model.atoms.length) return model;
  const xs = model.atoms.map((a) => a.x);
  const ys = model.atoms.map((a) => a.y);
  const dx = p.x - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = p.y - (Math.min(...ys) + Math.max(...ys)) / 2;
  return { ...model, atoms: model.atoms.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })) };
}
