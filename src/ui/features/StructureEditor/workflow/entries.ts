/**
 * What a box holds (docs/WORKFLOWS.md, *An input: boxing molecules*): what
 * lies inside its frame - each structure drawn, and each molecule in 3D,
 * whose middle is inside it - in the order they lie; what kind of set that
 * is; and its entries, each a structure with what has been found of it.
 */
import type { ParsedAtom, ParsedBond } from "../../../../lib/chem/molecule";
import type { Model, Molecule3D, WorkflowBox } from "../store/types";
import type { SetKind } from "./kinds";

type Pt = { x: number; y: number };
export type Frame = Pick<WorkflowBox, "x0" | "y0" | "x1" | "y1">;
export type Page = { model: Model; molecules3d?: readonly Molecule3D[] };

/** Whether `p` is inside a frame. */
export const inside = (b: Frame, p: Pt) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;

/** The structures drawn on the page, each its atoms' ids, as their bonds join them. */
export function structuresOf(model: Model): number[][] {
  const around = new Map<number, number[]>();
  for (const b of model.bonds) {
    around.set(b.a, [...(around.get(b.a) ?? []), b.b]);
    around.set(b.b, [...(around.get(b.b) ?? []), b.a]);
  }
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const a of model.atoms) {
    if (seen.has(a.id)) continue;
    const part: number[] = [];
    const todo = [a.id];
    seen.add(a.id);
    while (todo.length) {
      const id = todo.pop()!;
      part.push(id);
      for (const n of around.get(id) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          todo.push(n);
        }
      }
    }
    out.push(part);
  }
  return out;
}

/** The middle of a structure's atoms. */
export function middleOfAtoms(model: Model, ids: readonly number[]): Pt {
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  let x = 0;
  let y = 0;
  for (const id of ids) {
    const a = byId.get(id)!;
    x += a.x;
    y += a.y;
  }
  return { x: x / ids.length, y: y / ids.length };
}

/** Whether `p` lies before `q`: higher on the page, or - about level, within half a bond's height - to its left. */
const before = (p: Pt, q: Pt) => (Math.abs(p.y - q.y) > 0.9 ? q.y - p.y : p.x - q.x);

/** What lies inside a frame: the structures drawn (each its atoms' ids) and the molecules in 3D (by id) whose middles are inside it, each in the order they lie. */
export function boxMembers(page: Page, box: Frame): { structures: number[][]; molecules: number[] } {
  const structures = structuresOf(page.model)
    .map((ids) => ({ ids, at: middleOfAtoms(page.model, ids) }))
    .filter((s) => inside(box, s.at))
    .sort((p, q) => before(p.at, q.at))
    .map((s) => s.ids);
  const molecules = (page.molecules3d ?? [])
    .filter((m) => inside(box, m.at))
    .sort((p, q) => before(p.at, q.at))
    .map((m) => m.id);
  return { structures, molecules };
}

/** What kind of set a box holds: what made it says; drawn by the chemist, molecules in 3D - or structures, where any is drawn. */
export function setOf(page: Page, box: WorkflowBox): SetKind {
  if (box.made) return box.made.set;
  return boxMembers(page, box).structures.length ? "structures" : "molecules";
}

/** How many entries a box holds, of what kind of set: a structure each, a frame each of a molecule in 3D. */
export function countOf(page: Page, box: WorkflowBox): { set: SetKind; entries: number; compounds: number } {
  const set = setOf(page, box);
  const { structures, molecules } = boxMembers(page, box);
  const byId = new Map((page.molecules3d ?? []).map((m) => [m.id, m]));
  const frames = molecules.reduce((n, id) => n + framesOf(byId.get(id)!), 0);
  const entries = structures.length + frames;
  return { set, entries, compounds: set === "conformers" ? molecules.length : entries };
}

/** How many frames a molecule in 3D has: its own geometry, and the rest. */
export const framesOf = (m: Pick<Molecule3D, "frames">) => 1 + (m.frames?.length ?? 0);

/** One entry of a set of molecules in 3D, as a step takes it: its compound by its place among the set's, its number among that compound's conformers, its atoms and bonds, its geometry, its energy. */
export type SetEntry = {
  compound: number;
  number: number;
  atoms: readonly ParsedAtom[];
  bonds: readonly ParsedBond[];
  /** Its atoms' x, y and z in turn, in ångströms. */
  xyz: readonly number[];
  /** In hartrees, where it has one. */
  energy?: number;
  name?: string;
};

/** A molecule's frame `f`: its atoms' x, y and z in turn. */
export function frameXyz(m: Pick<Molecule3D, "atoms" | "frames">, f: number): number[] {
  return f === 0 ? m.atoms.flatMap((a) => [a.x, a.y, a.z]) : (m.frames?.[f - 1] ?? []);
}

/**
 * The entries of molecules in 3D, as a set of `set`. In a compound set
 * each frame of each molecule is a compound of its own - a file of many
 * geometries is many compounds, not conformers because they are many
 * (docs/WORKFLOWS.md, *Compound sets and conformer sets*); in a conformer
 * set each molecule is a compound, its frames its conformers.
 */
export function setEntries(molecules: readonly Molecule3D[], set: "molecules" | "conformers"): SetEntry[] {
  const out: SetEntry[] = [];
  molecules.forEach((m, i) => {
    const n = framesOf(m);
    const energies = m.energies?.length === n ? m.energies : undefined;
    for (let f = 0; f < n; f++) {
      out.push({
        compound: set === "conformers" ? i : out.length,
        number: set === "conformers" ? (m.numbers?.[f] ?? f + 1) : 1,
        atoms: m.atoms,
        bonds: m.bonds,
        xyz: frameXyz(m, f),
        ...(energies ? { energy: energies[f] } : {}),
        ...(m.name ? { name: m.name } : {}),
      });
    }
  });
  return out;
}

/** A compound's letter, by its place among a set's: a to z, then aa, ab... */
export function compoundLetter(i: number): string {
  const a = "abcdefghijklmnopqrstuvwxyz";
  return i < 26 ? a[i] : compoundLetter(Math.floor(i / 26) - 1) + a[i % 26];
}
