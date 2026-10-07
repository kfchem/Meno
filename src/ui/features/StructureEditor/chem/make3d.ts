/**
 * A drawn structure made in 3D: its conformers, by the plugin that fills
 * that role (RDKit's: ETKDG, then MMFF94), set on the page as a molecule in
 * 3D that rises out of the drawing - laid over it at first, turned to match
 * it - and comes to rest beside it, tied to it atom by atom
 * (docs/WORKSPACE.md, stage 2).
 */
import * as THREE from "three";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Style3D } from "../../../../lib/chem/style3d";
import type { ChemClient, Conformers, Like } from "../../../../lib/roles/client";
import type { OptionValues } from "../../../../lib/options";
import { chemMolblock, molIndex } from "../../../../lib/roles/molblock";
import { writeMolfile3d } from "../../../../lib/chem/molWriter";
import { editorModelOf, processFileContent } from "../utils/io";
import type { Model, Molecule3D, Turn3D } from "../store/types";
import { turnOnto } from "../utils/align3d";
import { signatureOf } from "../utils/drawnLink";
import { solidOf } from "../utils/molecule3d";
import { fragmentsHolding, laidOut, partOf } from "./cleanUp";

export { linkOf, signatureOf } from "../utils/drawnLink";

/** How long a structure's conformers may take: a large one's, on a slow machine, minutes. */
export const CONFORMERS_MS = 5 * 60_000;
/** The room between a drawing and the molecule in 3D that rises out of it, and between molecules. */
const GAP = 1.5 * NOMINAL_BOND_LENGTH;

/**
 * A structure as the plugin is asked about it, and which of the drawing's
 * atoms and bonds each of the block's is; made again, where the one made
 * before has its atoms (`likeOf`).
 */
export type Block = { molblock: string; atoms: number[]; bonds: number[]; part: Model; like?: Like };

/** The structures that hold these atoms, each as the plugin is asked about it; a lone atom's none. */
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
    drawnAs: signatureOf(block.part, block.atoms),
    conformerSet: true,
    ...(c.how?.length ? { made: { how: c.how } } : {}),
    stereo: {
      atoms: numbered(c.cip?.atoms),
      bonds: numbered(c.cip?.bonds),
      ...(Object.keys(c.chosen.atoms).length || Object.keys(c.chosen.bonds).length
        ? { chosen: { atoms: Object.keys(c.chosen.atoms).map(Number), bonds: Object.keys(c.chosen.bonds).map(Number) } }
        : {}),
    },
  };
}

const numbered = (r: Record<string, string> | undefined): Record<number, string> =>
  Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [Number(k), v]));

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
export type Turned = { turn: Turn3D; start: { x: number; y: number }; reach: Box; flat: number[]; height: number };

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
  return { turn, start, reach, flat, height: solid.reach.balls };
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
 * How a box on the page is seen when what is in it stands `height` above the
 * page - as high again at its top: as it is, by an orthographic camera (the
 * canvas's); by one in perspective `eyeHeight` over the view's middle,
 * larger, and further out from the middle.
 */
function seenAs(b: Box, view: Box, height: number, eyeHeight?: number): Box {
  if (eyeHeight == null) return b;
  const cx = (view.x0 + view.x1) / 2;
  const cy = (view.y0 + view.y1) / 2;
  const k = eyeHeight / Math.max(eyeHeight - 2 * height, 1);
  return { x0: cx + (b.x0 - cx) * k, x1: cx + (b.x1 - cx) * k, y0: cy + (b.y0 - cy) * k, y1: cy + (b.y1 - cy) * k };
}

/**
 * Where molecules in 3D made from a drawing come to rest: in a row beside
 * it - to its right, its left, below it or above it, the first of those
 * where the whole row is in view, as the camera sees it (`eyeHeight`, for one
 * in perspective) - and whether it is. In none, to its right.
 */
export function placeRow(
  items: Turned[],
  drawing: Box,
  view: Box | null,
  eyeHeight?: number,
): { at: { x: number; y: number }[]; inView: boolean } {
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
  const height = Math.max(...items.map((t) => t.height));
  for (const side of sides) {
    const row = side();
    if (view && inside(seenAs(row.box, view, height, eyeHeight), view)) return { at: row.at, inView: true };
  }
  return { at: sides[0]().at, inView: !view };
}

/** A row of molecules in 3D starting where `at` is - where one made again stood - each after the last. */
export function rowFrom(items: Turned[], at: { x: number; y: number }): { x: number; y: number }[] {
  let x = at.x;
  return items.map((t, i) => {
    if (i > 0) x += items[i - 1].reach.x1 + GAP - t.reach.x0;
    return { x, y: at.y };
  });
}

/** Each stereoisomer asked for, its conformers made - with the options the plugin takes for the role, as chosen in Settings: what `conformers` answers. */
export async function conformersOf(chem: ChemClient, block: Block, isomers: "one" | "all", options: OptionValues = {}): Promise<Conformers[]> {
  const like = block.like ? { like: block.like } : {};
  return (await chem.request("conformers", { molblock: block.molblock, isomers, ...like, options }, CONFORMERS_MS)).isomers;
}

/**
 * Where a molecule in 3D made before from the drawing has the block's atoms,
 * by their index in the block: for it to be made again as it was where the
 * drawing leaves its configuration open.
 */
export function likeOf(block: Block, before: Pick<Molecule3D, "atoms" | "drawnFrom">): Like {
  const index = new Map<number, number>();
  before.drawnFrom?.forEach((id, i) => {
    if (id != null) index.set(id, i);
  });
  const like: Like = {};
  block.atoms.forEach((id, k) => {
    const a = before.atoms[index.get(id) ?? -1];
    if (a) like[k] = [a.x, a.y, a.z];
  });
  return like;
}

/**
 * A molecule in 3D drawn as a formula, by Meno's own engine (as a SMILES is):
 * the frame it shows, its heavy atoms, wedged as it is in 3D - its bonds'
 * orders found where it has none (all single, as a file of coordinates
 * gives them). And which of the formula's atoms each of its atoms is: none
 * for a hydrogen.
 */
export async function formulaOf(chem: ChemClient, m: Molecule3D, frame: number): Promise<{ model: Model; link: (number | null)[] }> {
  const xyz = frame > 0 && m.frames?.[frame - 1] ? m.frames[frame - 1] : m.atoms.flatMap((a) => [a.x, a.y, a.z]);
  const atoms = m.atoms.map((a, i) => ({ el: a.el, charge: a.charge, x: xyz[3 * i], y: xyz[3 * i + 1], z: xyz[3 * i + 2] }));
  const perceive = m.bonds.length > 0 && m.bonds.every((b) => b.order === 1);
  const { molblock } = await chem.request("drawing_of", { molblock: writeMolfile3d(atoms, m.bonds), perceive });
  const drawn = editorModelOf((await processFileContent("formula.mol", molblock)).model);
  const model = await laidOut(drawn).catch(() => drawn);
  // (its heavy atoms came back in their order)
  let k = 0;
  const link = m.atoms.map((a) => (a.el === "H" ? null : (drawn.atoms[k++]?.id ?? null)));
  return { model, link };
}

/** Where a formula drawn of a molecule in 3D goes: beside it, to its left, level with it. */
export function formulaPlace(m: Molecule3D, formula: Model, style: Style3D): { x: number; y: number } {
  const solid = solidOf(m, style);
  const xs = formula.atoms.map((a) => a.x);
  const width = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  return { x: m.at.x - solid.reach.balls - GAP - width / 2, y: m.at.y };
}
