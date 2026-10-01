import { layout2D } from "../layout/engine";
import { abbreviationStructure } from "./abbreviations";
import type { GroupStructure } from "./ligands";
import { kekuleOrders } from "./kekulize";
import type { AbbreviationStructure, AtomChem } from "./molecule";
import { readSmiles } from "./smiles";

type P = { x: number; y: number };

/**
 * The atoms an abbreviation stands for, placed: laid out by Meno's own
 * engine, `bondLength` apart, and turned so that the bond into it runs on
 * from `neighbour` - where the atom it is bonded to is, from the label's
 * atom - through the label's atom, where its first attachment sits.
 * Positions are from that atom (from a complex's first metal, for one
 * attached by nothing), as an abbreviation from a file has them. A pi
 * system's star is set at its centre. Nothing, for a label Meno does not
 * know.
 */
export function placedAbbreviation(
  label: string,
  neighbour: P | null,
  bondLength: number,
): AbbreviationStructure | null {
  const s = abbreviationStructure(label);
  return s ? placedStructure(s, neighbour, bondLength) : null;
}

/** A structure laid out as `placedAbbreviation` lays out an abbreviation's. */
export function placedStructure(s: GroupStructure, neighbour: P | null, bondLength: number): AbbreviationStructure {
  const stars = new Map((s.haptic ?? []).map((h) => [h.star, h.atoms]));
  // laid out without the stars: a haptic bond to one stands in for a bond
  // to the first atom of its pi system
  const end = (i: number) => (stars.has(i) ? stars.get(i)![0] : i);
  const head = s.attach[0] ?? 0;
  const from = s.atoms.length;
  const laid = layout2D({
    atoms: [...s.atoms.map((a) => ({ el: a.el === "*" ? "C" : a.el, ...(a.charge ? { charge: a.charge } : {}) })), { el: "C" }],
    bonds: [
      ...s.bonds.map((b) => ({ a: end(b.a1), b: end(b.a2), order: b.coordination ? 1 : b.order })).filter((b) => b.a !== b.b),
      ...(s.attach.length ? [{ a: from, b: end(head), order: 1 }] : []),
    ],
  });
  // each star at its pi system's centre
  for (const [star, ring] of stars) {
    laid.x[star] = ring.reduce((t, k) => t + laid.x[k], 0) / ring.length;
    laid.y[star] = ring.reduce((t, k) => t + laid.y[k], 0) / ring.length;
  }
  const at = { x: laid.x[head], y: laid.y[head] };
  const into = { x: at.x - laid.x[from], y: at.y - laid.y[from] };
  // the way the bond runs now: from the neighbour to the label's atom
  const want = neighbour && s.attach.length ? { x: -neighbour.x, y: -neighbour.y } : into;
  const turn = s.attach.length ? Math.atan2(want.y, want.x) - Math.atan2(into.y, into.x) : 0;
  const cos = Math.cos(turn) * bondLength;
  const sin = Math.sin(turn) * bondLength;
  return {
    atoms: s.atoms.map((a, i) => {
      const dx = laid.x[i] - at.x;
      const dy = laid.y[i] - at.y;
      const { hs: _hs, ...chem } = a;
      return { ...chem, x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    }),
    bonds: s.bonds.map((b) => ({
      a1: b.a1,
      a2: b.a2,
      order: (b.coordination ? 1 : b.order) as 1 | 2 | 3,
      ...(b.coordination ? { coordination: true } : {}),
      ...(b.endpoints ? { endpoints: b.endpoints, attach: "all" as const } : {}),
    })),
    attach: s.attach,
    ...(s.haptic?.length ? { haptic: s.haptic } : {}),
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
