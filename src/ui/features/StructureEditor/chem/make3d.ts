/**
 * A drawn structure made in 3D: its conformers, by RDKit (ETKDG, then
 * MMFF94), set on the page as a molecule in 3D that rises out of the drawing
 * - laid over it at first, turned to match it - and comes to rest beside it,
 * tied to it atom by atom (docs/WORKSPACE.md, stage 2).
 */
import * as THREE from "three";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Style3D } from "../../../../lib/chem/style3d";
import type { ChemClient, Conformers } from "../../../../lib/rdkit/client";
import { chemMolblock, molIndex } from "../../../../lib/rdkit/molblock";
import type { Model, Molecule3D, Turn3D } from "../store/types";
import { turnOnto } from "../utils/align3d";
import { solidOf } from "../utils/molecule3d";
import { fragmentsHolding, partOf } from "./cleanUp";

/** How long a structure's conformers may take: a large one's, on a slow machine, minutes. */
export const CONFORMERS_MS = 5 * 60_000;
/** The room between a drawing and the molecule in 3D that rises out of it, and between molecules. */
const GAP = 1.5 * NOMINAL_BOND_LENGTH;

/** A structure as RDKit is asked about it, and which of the drawing's atoms and bonds each of the block's is. */
export type Block = { molblock: string; atoms: number[]; bonds: number[]; part: Model };

/** The structures that hold these atoms, each as RDKit is asked about it; a lone atom's none. */
export function blocksOf(model: Model, atoms: Iterable<number>): Block[] {
  return fragmentsHolding(model, atoms)
    .map((ids) => partOf(model, ids))
    .filter((part) => part.bonds.length > 0)
    .map((part) => {
      const index = molIndex(part);
      return {
        molblock: chemMolblock(part),
        atoms: index.atoms.map((a) => a.id),
        bonds: index.bonds.map((b) => b.id),
        part,
      };
    });
}

/** What a structure leaves open: its stereocentres and double bonds drawn without a configuration, by id, and how many stereoisomers they make. */
export type Open = { atoms: number[]; bonds: number[]; isomers: number };

/** What `open_stereo` answers for `block`, in the drawing's ids. */
export function openIn(block: Block, answer: { atoms: number[]; bonds: number[]; isomers: number }): Open {
  return {
    atoms: answer.atoms.map((i) => block.atoms[i]).filter((id) => id != null),
    bonds: answer.bonds.map((i) => block.bonds[i]).filter((id) => id != null),
    isomers: answer.isomers,
  };
}

/**
 * A stereoisomer's conformers as a molecule in 3D: the lowest's coordinates
 * as its atoms, the rest as its frames, their energies; and the drawing's
 * atom each of its atoms is - none for a hydrogen made for it, or an atom
 * written out of an abbreviation.
 */
export function moleculeOf(c: Conformers, block: Block): Omit<Molecule3D, "id" | "at"> {
  const first = c.frames[0] ?? [];
  return {
    atoms: c.atoms.map((a, i) => ({
      el: a.el,
      ...(a.charge ? { charge: a.charge } : {}),
      x: first[3 * i] ?? 0,
      y: first[3 * i + 1] ?? 0,
      z: first[3 * i + 2] ?? 0,
    })),
    bonds: c.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order })),
    ...(c.frames.length > 1 ? { frames: c.frames.slice(1) } : {}),
    energies: c.energies,
    drawnFrom: c.atoms.map((_, i) => (i < block.part.atoms.length ? block.atoms[i] : null)),
  };
}

/** A box on the page: from x0 to x1 across, y0 to y1 up. */
export type Box = { x0: number; x1: number; y0: number; y1: number };

/**
 * A molecule in 3D made from a drawing, turned to lie as near as it can over
 * the drawing's atoms: the turn, where its centre then is - over the drawing,
 * where it starts to rise - and how far it reaches from its centre, so
 * turned, across and up. And where each of its atoms starts, about that
 * centre, unturned: on its drawing's atom, flat on the page - a hydrogen made
 * for it on the atom it is bonded to - so that it rises out of the drawing.
 */
export type Turned = { turn: Turn3D; start: { x: number; y: number }; reach: Box; flat: number[] };

export function turnedOver(m: Omit<Molecule3D, "id" | "at">, model: Model, style: Style3D): Turned {
  const solid = solidOf({ ...m, id: 0, at: { x: 0, y: 0 } }, style);
  const places = solid.frames[0];
  const radii = solid.radii.balls;
  const byId = new Map(model.atoms.map((a) => [a.id, a]));
  const from: number[] = [];
  const to: number[] = [];
  (m.drawnFrom ?? []).forEach((id, i) => {
    const a = id == null ? undefined : byId.get(id);
    if (!a) return;
    from.push(places[3 * i], places[3 * i + 1], places[3 * i + 2]);
    to.push(a.x, a.y);
  });
  const turn = turnOnto(from, to);
  const q = new THREE.Quaternion(...turn);
  const v = new THREE.Vector3();
  // over the drawing: the centre that lays its tied atoms' middle on theirs
  let mx = 0, my = 0, dx = 0, dy = 0;
  const k = from.length / 3;
  for (let i = 0; i < k; i++) {
    v.set(from[3 * i], from[3 * i + 1], from[3 * i + 2]).applyQuaternion(q);
    mx += v.x;
    my += v.y;
    dx += to[2 * i];
    dy += to[2 * i + 1];
  }
  const start = k ? { x: (dx - mx) / k, y: (dy - my) / k } : { x: 0, y: 0 };
  // each atom where it starts: its drawing's atom, on the page, turned back
  const back = q.clone().invert();
  const flat = Array.from(places);
  const onDrawing = new Set<number>();
  (m.drawnFrom ?? []).forEach((id, i) => {
    const a = id == null ? undefined : byId.get(id);
    if (!a) return;
    v.set(a.x - start.x, a.y - start.y, 0).applyQuaternion(back);
    flat.splice(3 * i, 3, v.x, v.y, v.z);
    onDrawing.add(i);
  });
  for (const b of m.bonds) {
    const [from, to] = onDrawing.has(b.a1) && !onDrawing.has(b.a2) ? [b.a1, b.a2] : onDrawing.has(b.a2) && !onDrawing.has(b.a1) ? [b.a2, b.a1] : [-1, -1];
    if (from < 0 || m.atoms[to].el !== "H") continue;
    flat.splice(3 * to, 3, flat[3 * from], flat[3 * from + 1], flat[3 * from + 2]);
  }
  const reach: Box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (let i = 0; i < radii.length; i++) {
    v.set(places[3 * i], places[3 * i + 1], places[3 * i + 2]).applyQuaternion(q);
    reach.x0 = Math.min(reach.x0, v.x - radii[i]);
    reach.x1 = Math.max(reach.x1, v.x + radii[i]);
    reach.y0 = Math.min(reach.y0, v.y - radii[i]);
    reach.y1 = Math.max(reach.y1, v.y + radii[i]);
  }
  return { turn, start, reach, flat };
}

/** Where a drawn structure is on the page: its atoms' box, a little round them. */
export function boxOf(part: Model): Box {
  const pad = 0.4 * NOMINAL_BOND_LENGTH;
  const xs = part.atoms.map((a) => a.x);
  const ys = part.atoms.map((a) => a.y);
  return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - pad, y1: Math.max(...ys) + pad };
}

const inside = (b: Box, view: Box) => b.x0 >= view.x0 && b.x1 <= view.x1 && b.y0 >= view.y0 && b.y1 <= view.y1;

/**
 * Where molecules in 3D made from a drawing come to rest: in a row beside
 * it - to its right, its left, below it or above it, the first of those
 * where the whole row is in view - and whether it is. In none, to its right.
 */
export function placeRow(items: Turned[], drawing: Box, view: Box | null): { at: { x: number; y: number }[]; inView: boolean } {
  const cx = (drawing.x0 + drawing.x1) / 2;
  const cy = (drawing.y0 + drawing.y1) / 2;
  const across = items.reduce((a, t) => a + t.reach.x1 - t.reach.x0, 0) + GAP * Math.max(0, items.length - 1);
  const tall = Math.max(...items.map((t) => t.reach.y1 - t.reach.y0));
  const sides: (() => { at: { x: number; y: number }[]; box: Box })[] = [
    // right: from the drawing's right edge on, level with it
    () => {
      let x = drawing.x1 + GAP;
      const at = items.map((t) => {
        const p = { x: x - t.reach.x0, y: cy };
        x = p.x + t.reach.x1 + GAP;
        return p;
      });
      return { at, box: { x0: drawing.x1 + GAP, x1: x - GAP, y0: cy - tall / 2, y1: cy + tall / 2 } };
    },
    // left: from its left edge back
    () => {
      let x = drawing.x0 - GAP;
      const at = items.map((t) => {
        const p = { x: x - t.reach.x1, y: cy };
        x = p.x + t.reach.x0 - GAP;
        return p;
      });
      return { at, box: { x0: x + GAP, x1: drawing.x0 - GAP, y0: cy - tall / 2, y1: cy + tall / 2 } };
    },
    // below, and above: a row under it or over it, centred on it
    ...[-1, 1].map((side) => () => {
      let x = cx - across / 2;
      const edge = side < 0 ? drawing.y0 - GAP : drawing.y1 + GAP;
      const at = items.map((t) => {
        const p = { x: x - t.reach.x0, y: side < 0 ? edge - t.reach.y1 : edge - t.reach.y0 };
        x = p.x + t.reach.x1 + GAP;
        return p;
      });
      const y0 = side < 0 ? edge - tall : edge;
      return { at, box: { x0: cx - across / 2, x1: cx + across / 2, y0, y1: y0 + tall } };
    }),
  ];
  for (const side of sides) {
    const row = side();
    if (view && inside(row.box, view)) return { at: row.at, inView: true };
  }
  return { at: sides[0]().at, inView: !view };
}

/** Each stereoisomer asked for, its conformers made: what `conformers` answers. */
export async function conformersOf(chem: ChemClient, block: Block, isomers: "one" | "all"): Promise<Conformers[]> {
  return (await chem.request("conformers", { molblock: block.molblock, isomers }, CONFORMERS_MS)).isomers;
}
