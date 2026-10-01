import { layout2D } from "../layout/engine";
import { abbreviationStructure } from "./abbreviations";
import { kekuleOrders } from "./kekulize";
import type { AbbreviationStructure, AtomChem } from "./molecule";
import { readSmiles } from "./smiles";

type P = { x: number; y: number };

/**
 * The atoms a dictionary abbreviation stands for, placed: laid out by
 * Meno's own engine, `bondLength` apart, and turned so that the bond into
 * it runs on from `neighbour` - where the atom it is bonded to is, from the
 * label's atom - through the label's atom, where its attachment sits.
 * Positions are from the label's atom, as an abbreviation from a file has
 * them. Nothing, for a label the dictionary does not know.
 */
export function placedAbbreviation(
  label: string,
  neighbour: P | null,
  bondLength: number,
): AbbreviationStructure | null {
  const s = abbreviationStructure(label);
  if (!s) return null;
  // the group, and an atom where its bond comes from
  const from = s.atoms.length;
  const laid = layout2D({
    atoms: [...s.atoms.map((a) => ({ el: a.el, ...(a.charge ? { charge: a.charge } : {}) })), { el: "C" }],
    bonds: [
      ...s.bonds.map((b) => ({ a: b.a1, b: b.a2, order: b.order })),
      { a: from, b: s.attach, order: 1 },
    ],
  });
  const at = { x: laid.x[s.attach], y: laid.y[s.attach] };
  const into = { x: at.x - laid.x[from], y: at.y - laid.y[from] };
  // the way the bond runs now: from the neighbour to the label's atom
  const want = neighbour ? { x: -neighbour.x, y: -neighbour.y } : into;
  const turn = Math.atan2(want.y, want.x) - Math.atan2(into.y, into.x);
  const cos = Math.cos(turn) * bondLength;
  const sin = Math.sin(turn) * bondLength;
  return {
    atoms: s.atoms.map((a, i) => {
      const dx = laid.x[i] - at.x;
      const dy = laid.y[i] - at.y;
      const { hs: _hs, ...chem } = a;
      return { ...chem, x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    }),
    bonds: s.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order as 1 | 2 | 3 })),
    attach: [s.attach],
  };
}

/**
 * A structure in SMILES drawn out by Meno's own engine, `bondLength` apart -
 * an abbreviation's, its "*" where it is attached - for a picture of it:
 * atoms with ids from 1, an aromatic ring's bonds in Kekulé form. Null for
 * SMILES that does not read.
 */
export function drawnSmiles(
  smiles: string,
  bondLength: number,
): { atoms: (AtomChem & { id: number; x: number; y: number })[]; bonds: { id: number; a: number; b: number; order: 1 | 2 | 3 }[] } | null {
  let read: ReturnType<typeof readSmiles>;
  try {
    read = readSmiles(smiles);
  } catch {
    return null;
  }
  if (!read.atoms.length) return null;
  const orders = kekuleOrders(read.atoms, read.bonds);
  const laid = layout2D({
    // (the "*" laid out as a carbon would be)
    atoms: read.atoms.map((a) => ({ el: a.el === "*" ? "C" : a.el, ...(a.charge ? { charge: a.charge } : {}) })),
    bonds: read.bonds.map((b, i) => ({ a: b.a1, b: b.a2, order: orders[i] })),
  });
  return {
    atoms: read.atoms.map((a, i) => ({
      id: i + 1,
      x: laid.x[i] * bondLength,
      y: laid.y[i] * bondLength,
      el: a.el,
      ...(a.charge ? { charge: a.charge } : {}),
      ...(a.isotope ? { isotope: a.isotope } : {}),
    })),
    bonds: read.bonds.map((b, i) => ({ id: read.atoms.length + i + 1, a: b.a1 + 1, b: b.a2 + 1, order: orders[i] as 1 | 2 | 3 })),
  };
}
