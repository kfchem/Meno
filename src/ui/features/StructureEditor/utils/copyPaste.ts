/**
 * What a copy takes and puts on the clipboard, and what a paste makes of
 * what it finds there - pure, over the editor's model (the clipboard
 * itself is lib/clipboard).
 */
import type { ClipItem } from "../../../../lib/clipboard";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { writeMolfile, writeMolfile3d } from "../../../../lib/chem/molWriter";
import { arrowEnds } from "../../../../lib/chem/reactionScheme";
import { fragmentOf, partOf } from "../chem/cleanUp";
import { forFlatReaders } from "../chem/drawing";
import { notOneReaction, reactionFileText } from "../chem/reactionFile";
import type { Arrow, Atom, Bond, Carried3D, Drawn, Measure3D, Plus, Sel, Turn3D } from "../store/types";
import { asSeen } from "./molecule3d";

type Pt = { x: number; y: number };

/**
 * What a copy takes: the selected atoms and every bond among them, with
 * the arrows and "+" signs drawn among them - within half a bond of the box
 * round them - or, with nothing selected, the whole structure `around` an
 * atom (the one under the pointer). Null when that is nothing.
 */
export function partToCopy(drawn: Drawn, sel: Sel, around: number | null): Drawn | null {
  const model = { atoms: drawn.atoms, bonds: drawn.bonds };
  const atoms = sel.atoms.size
    ? new Set([...sel.atoms].filter((id) => model.atoms.some((a) => a.id === id)))
    : around != null && model.atoms.some((a) => a.id === around)
      ? fragmentOf(model, around)
      : new Set<number>();
  if (!atoms.size) return null;
  const part = partOf(model, atoms);
  if (!sel.atoms.size) return part;
  const { arrows, pluses } = schemeAmong(drawn, atoms);
  return {
    ...part,
    ...(arrows.length ? { arrows } : {}),
    ...(pluses.length ? { pluses } : {}),
  };
}

/**
 * The arrows and "+" signs drawn among the atoms `ids`: within half a bond
 * of the box round them, an arrow from end to end. What goes with a
 * selection that is copied, cut, deleted or moved.
 */
export function schemeAmong(drawn: Drawn, ids: Set<number>): { arrows: Arrow[]; pluses: Plus[] } {
  const atoms = drawn.atoms.filter((a) => ids.has(a.id));
  if (!atoms.length) return { arrows: [], pluses: [] };
  const reach = NOMINAL_BOND_LENGTH / 2;
  const xs = atoms.map((a) => a.x);
  const ys = atoms.map((a) => a.y);
  const within = (p: Pt) =>
    p.x >= Math.min(...xs) - reach &&
    p.x <= Math.max(...xs) + reach &&
    p.y >= Math.min(...ys) - reach &&
    p.y <= Math.max(...ys) + reach;
  return {
    arrows: (drawn.arrows ?? []).filter((a) => {
      const { from, to } = arrowEnds(a);
      return within(from) && within(to);
    }),
    pluses: (drawn.pluses ?? []).filter(within),
  };
}

/** Meno's own record of a structure on the clipboard, and its version. */
const RECORD = "meno-structure";
const VERSION = 1;

/**
 * What a copy puts on the clipboard: Meno's own record, which loses
 * nothing - labels, wedges' ends, a drawing in perspective, a reaction's
 * arrow and "+" signs - and a MOL file for other chemistry programs, as a
 * saved file has it; for a reaction, an RXN file too.
 */
export function clipItems(part: Drawn): ClipItem[] {
  // molecules in 3D alone: a molfile in 3D, as they are seen
  if (!part.atoms.length) {
    const ms = part.molecules3d ?? [];
    if (!ms.length) return [];
    const placed = ms.length > 1;
    const seen = ms.map((m) => asSeen(m, m.turn, m.frame, placed));
    const offsets = seen.map((_, i) => seen.slice(0, i).reduce((n, a) => n + a.length, 0));
    return [
      { flavor: "meno", text: recordText(part) },
      {
        flavor: "mol",
        text: writeMolfile3d(
          seen.flat(),
          ms.flatMap((m, i) => m.bonds.map((b) => ({ a1: b.a1 + offsets[i], a2: b.a2 + offsets[i], order: b.order }))),
          { title: ms.length === 1 ? ms[0].name?.replace(/\.[^.]*$/, "") : undefined },
        ),
      },
    ];
  }
  return [
    { flavor: "meno", text: recordText(part) },
    { flavor: "mol", text: writeMolfile(forFlatReaders(part)) },
    ...(notOneReaction(part) ? [] : [{ flavor: "rxn" as const, text: reactionFileText(part) }]),
  ];
}

/**
 * Meno's own record of a structure, as text: what a picture of it carries
 * too. A reaction's arrows and pluses go with it, where it has them; a
 * reader that knows nothing of them reads the structures.
 */
export function recordText(part: Drawn): string {
  return JSON.stringify({
    format: RECORD,
    version: VERSION,
    atoms: part.atoms,
    bonds: part.bonds,
    ...(part.arrows?.length ? { arrows: part.arrows } : {}),
    ...(part.pluses?.length ? { pluses: part.pluses } : {}),
    ...(part.molecules3d?.length ? { molecules3d: part.molecules3d } : {}),
  });
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The structure in Meno's own record, or null if `text` is not one this version reads. */
export function readRecord(text: string): Drawn | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const r = data as {
    format?: unknown;
    version?: unknown;
    atoms?: unknown;
    bonds?: unknown;
    arrows?: unknown;
    pluses?: unknown;
    molecules3d?: unknown;
  };
  if (r?.format !== RECORD || r.version !== VERSION || !Array.isArray(r.atoms) || !Array.isArray(r.bonds)) return null;
  const atoms = r.atoms as Partial<Atom>[];
  const bonds = r.bonds as Partial<Bond>[];
  if (!atoms.every((a) => isNum(a.id) && isNum(a.x) && isNum(a.y) && typeof a.el === "string")) return null;
  const ids = new Set(atoms.map((a) => a.id));
  if (!bonds.every((b) => isNum(b.id) && ids.has(b.a) && ids.has(b.b) && [1, 2, 3].includes(b.order as number))) {
    return null;
  }
  // (arrows and pluses that do not read are left out, not the structure)
  const arrows = (Array.isArray(r.arrows) ? (r.arrows as Partial<Arrow>[]) : []).filter(
    (a) => isNum(a.id) && isNum(a.x) && isNum(a.y) && isNum(a.angle) && isNum(a.length),
  ) as Arrow[];
  const pluses = (Array.isArray(r.pluses) ? (r.pluses as Partial<Plus>[]) : []).filter(
    (p) => isNum(p.id) && isNum(p.x) && isNum(p.y),
  ) as Plus[];
  const molecules3d = (Array.isArray(r.molecules3d) ? r.molecules3d : []).flatMap((m) => {
    const read = readCarried3D(m);
    return read ? [read] : [];
  });
  return {
    atoms: atoms.map((a) => ({ r: 0.9, ...a }) as Atom),
    bonds: bonds as Bond[],
    ...(arrows.length ? { arrows } : {}),
    ...(pluses.length ? { pluses } : {}),
    ...(molecules3d.length ? { molecules3d } : {}),
  };
}

/** A molecule in 3D in Meno's own record, or null where it does not read as one. */
export function readCarried3D(given: unknown): Carried3D | null {
  const m = given as Partial<Record<keyof Carried3D, unknown>>;
  if (!m || !Array.isArray(m.atoms) || !Array.isArray(m.bonds) || !m.at) return null;
  const atoms = m.atoms as Partial<Carried3D["atoms"][number]>[];
  const n = atoms.length;
  if (!n || !atoms.every((a) => typeof a.el === "string" && isNum(a.x) && isNum(a.y) && isNum(a.z))) return null;
  const index = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;
  const bonds = m.bonds as Partial<Carried3D["bonds"][number]>[];
  if (!bonds.every((b) => index(b.a1) && index(b.a2) && Number.isInteger(b.order))) return null;
  const at = m.at as Partial<Pt>;
  if (!isNum(at.x) || !isNum(at.y)) return null;
  // (what does not read is left out, not the molecule)
  const frames = (Array.isArray(m.frames) ? (m.frames as unknown[]) : []).filter(
    (f): f is number[] => Array.isArray(f) && f.length === 3 * n && f.every(isNum),
  );
  const energies = Array.isArray(m.energies) && m.energies.every(isNum) && m.energies.length === frames.length + 1 ? (m.energies as number[]) : undefined;
  const measures = (Array.isArray(m.measures) ? (m.measures as Partial<Measure3D>[]) : []).filter(
    (x): x is Measure3D => isNum(x.id) && Array.isArray(x.atoms) && x.atoms.length >= 2 && x.atoms.length <= 4 && x.atoms.every(index),
  );
  const turn = Array.isArray(m.turn) && m.turn.length === 4 && m.turn.every(isNum) ? (m.turn as Turn3D) : undefined;
  return {
    atoms: atoms as Carried3D["atoms"],
    bonds: bonds as Carried3D["bonds"],
    at: { x: at.x, y: at.y },
    ...(frames.length ? { frames } : {}),
    ...(energies ? { energies } : {}),
    ...(m.look === "space" || m.look === "balls" ? { look: m.look } : {}),
    ...(measures.length ? { measures } : {}),
    ...(typeof m.name === "string" ? { name: m.name } : {}),
    ...(turn ? { turn } : {}),
    ...(Number.isInteger(m.frame) ? { frame: m.frame as number } : {}),
  };
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

/** `drawn` moved so that the middle of the box round it - its arrows and pluses too - is at `p`. */
export function centredAt<D extends Drawn>(drawn: D, p: Pt): D {
  const points = [
    ...drawn.atoms,
    ...(drawn.arrows ?? []).flatMap((a) => Object.values(arrowEnds(a))),
    ...(drawn.pluses ?? []),
    ...(drawn.molecules3d ?? []).map((m) => m.at),
  ];
  if (!points.length) return drawn;
  const xs = points.map((a) => a.x);
  const ys = points.map((a) => a.y);
  const dx = p.x - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = p.y - (Math.min(...ys) + Math.max(...ys)) / 2;
  const moved = <T extends Pt>(t: T): T => ({ ...t, x: t.x + dx, y: t.y + dy });
  return {
    ...drawn,
    atoms: drawn.atoms.map(moved),
    ...(drawn.arrows ? { arrows: drawn.arrows.map(moved) } : {}),
    ...(drawn.pluses ? { pluses: drawn.pluses.map(moved) } : {}),
    ...(drawn.molecules3d ? { molecules3d: drawn.molecules3d.map((m) => ({ ...m, at: moved(m.at) })) } : {}),
  };
}
