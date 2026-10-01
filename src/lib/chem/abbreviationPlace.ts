import { layout2D } from "../layout/engine";
import { abbreviationStructure } from "./abbreviations";
import type { AbbreviationStructure } from "./molecule";

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
