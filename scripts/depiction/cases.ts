// The cases the sheet draws.
//
// Two kinds. A *file* case is a structure read through the app's own import
// path, which is the only way to get the coordinates the app actually draws:
// the importer scales every structure so the average bond comes out at
// NOMINAL_BOND_LENGTH, and a case built from raw file coordinates is a case
// about a molecule nobody will ever see.
//
// A *sweep* case is one arrangement drawn over and over with a number
// changed - an angle, usually. Faults in this drawing code have a habit of
// living in a narrow band of some parameter and looking fine either side of
// it, so a single example proves very little. The wedge join that was broken
// between 141 and 149 degrees drew correctly at 140 and at 150.

import { NOMINAL_BOND_LENGTH } from "../../src/lib/chem/acs";
import type { Atom, Bond } from "../../src/lib/chem/layout2d";

export type Structure = { atoms: Atom[]; bonds: Bond[] };
export type Frame = { label: string; structure: Structure };
export type Sweep = { title: string; note: string; frames: Frame[] };

const L = NOMINAL_BOND_LENGTH;

/** A point `deg` round from straight-on, at bond length, from `from`. */
function bend(from: Atom, deg: number, id: number, el = "C"): Atom {
  const a = (deg * Math.PI) / 180;
  return {
    id,
    x: from.x + L * Math.cos(Math.PI - a),
    y: from.y + L * Math.sin(Math.PI - a),
    el,
  };
}

/**
 * A wedge widening onto an atom that one bond carries on from, at `deg`
 * between the two. The wedge narrows towards atom 0, which needs two more
 * bonds of its own for the layout to put the narrow end there.
 */
function wedgeWithNeighbour(deg: number): Structure {
  const a0: Atom = { id: 0, x: 0, y: 0, el: "C" };
  const a1: Atom = { id: 1, x: L, y: 0, el: "C" };
  return {
    atoms: [
      a0,
      a1,
      bend(a1, deg, 2),
      { id: 3, x: -L * 0.5, y: L * 0.87, el: "C" },
      { id: 4, x: -L * 0.5, y: -L * 0.87, el: "C" },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 1, stereo: "up" },
      { a1: 1, a2: 2, order: 1, stereo: "none" },
      { a1: 0, a2: 3, order: 1, stereo: "none" },
      { a1: 0, a2: 4, order: 1, stereo: "none" },
    ],
  };
}

/** Two double bonds sharing an atom, at `deg` between them. */
function doublePair(deg: number, mode: Bond["doubleMode"]): Structure {
  const a0: Atom = { id: 0, x: 0, y: 0, el: "C" };
  const a1: Atom = { id: 1, x: L, y: 0, el: "C" };
  return {
    atoms: [a0, a1, bend(a1, deg, 2)],
    bonds: [
      { a1: 0, a2: 1, order: 2, stereo: "none", doubleMode: mode },
      { a1: 1, a2: 2, order: 2, stereo: "none", doubleMode: mode },
    ],
  };
}

/** A bond of the given kind onto an atom of the given element. */
function bondOnto(
  el: string,
  stereo: Bond["stereo"],
  order: 1 | 2 | 3 = 1,
): Structure {
  return {
    atoms: [
      { id: 0, x: 0, y: 0, el: "C" },
      { id: 1, x: L, y: 0, el },
      { id: 2, x: -L * 0.5, y: L * 0.87, el: "C" },
      { id: 3, x: -L * 0.5, y: -L * 0.87, el: "C" },
    ],
    bonds: [
      { a1: 0, a2: 1, order, stereo },
      { a1: 0, a2: 2, order: 1, stereo: "none" },
      { a1: 0, a2: 3, order: 1, stereo: "none" },
    ],
  };
}

const ANGLES = [90, 110, 120, 135, 140, 145, 150, 155, 160, 170, 180];

export const sweeps: Sweep[] = [
  {
    title: "A wedge's wide end, with one bond carrying on from it",
    note:
      "The end is cut along that bond so the two read as one shape. Past the " +
      "mitre limit it is cut square across instead, and the bond leaves it " +
      "with a step - that is the limit working, not a fault. What is a fault " +
      "is the bond standing apart from the wedge with a gap, or the end " +
      "slewed across the wedge at an angle of its own.",
    frames: ANGLES.map((d) => ({
      label: `${d}°`,
      structure: wedgeWithNeighbour(d),
    })),
  },
  {
    title: "Two double bonds sharing an atom",
    note:
      "The line beside each bond has to run on to meet its neighbour's, in " +
      "every mode. Two lines ending at the same point still leave the corner " +
      "they turn open, so there is a cap over it.",
    frames: (["auto", "center", "left", "right"] as const).flatMap((mode) =>
      [90, 120, 150, 180].map((d) => ({
        label: `${mode} ${d}°`,
        structure: doublePair(d, mode === "auto" ? undefined : mode),
      })),
    ),
  },
  {
    title: "Bonds of every kind, onto a plain atom and onto a label",
    note:
      "A label takes the bond's end away with it, and it must take the same " +
      "amount whatever the bond is: hashes and waves are placed on the bond " +
      "itself and then clipped, so a label should remove hashes rather than " +
      "crowd them together.",
    frames: (
      [
        ["plain", "none", 1],
        ["double", "none", 2],
        ["triple", "none", 3],
        ["wedge", "up", 1],
        ["hashed", "down", 1],
        ["wavy", "wavy", 1],
      ] as [string, Bond["stereo"], 1 | 2 | 3][]
    ).flatMap(([name, stereo, order]) =>
      ["C", "O", "N", "Br"].map((el) => ({
        label: `${name} → ${el}`,
        structure: bondOnto(el, stereo, order),
      })),
    ),
  },
];

/** Structure files drawn as they arrive, read through the app's importer. */
export const files = [
  {
    title: "depiction-check.mol",
    note:
      "Six fragments: a chain, a stereocentre with three wedges and a hashed " +
      "one, hashed wedges onto a carbon and onto an OH, wavy bonds the same " +
      "way, labels of four widths, and a wedge meeting a double and a triple " +
      "bond.",
    path: "scripts/gui/fixtures/depiction-check.mol",
    format: "mol",
  },
];
