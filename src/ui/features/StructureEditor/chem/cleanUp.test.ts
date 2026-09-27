import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { MOL_BOND_LENGTH } from "../../../../lib/chem/molWriter";
import type { Model } from "../store/types";
import { fragmentOf, partOf, relayoutOf } from "./cleanUp";

const atom = (id: number, x: number, y: number) => ({ id, x, y, r: 0.9, el: "C" });

// a methyl on a wedge from a CH with two more carbons, and apart from them
// an ethane
const model: Model = {
  atoms: [
    atom(1, 0, 0),
    atom(2, 1, 0),
    atom(3, -1, 0),
    atom(4, 0, 1),
    atom(5, 10, 0),
    atom(6, 11, 0),
  ],
  bonds: [
    { id: 7, a: 1, b: 2, order: 1 },
    { id: 8, a: 1, b: 3, order: 1 },
    { id: 9, a: 1, b: 4, order: 1, stereo: "up" },
    { id: 10, a: 5, b: 6, order: 1 },
  ],
};

describe("fragmentOf and partOf", () => {
  it("find the atoms bonded to an atom, and the bonds among them", () => {
    expect([...fragmentOf(model, 4)].sort()).toEqual([1, 2, 3, 4]);
    expect([...fragmentOf(model, 6)].sort()).toEqual([5, 6]);
    const part = partOf(model, fragmentOf(model, 5));
    expect(part.atoms.map((a) => a.id)).toEqual([5, 6]);
    expect(part.bonds.map((b) => b.id)).toEqual([10]);
  });
});

describe("relayoutOf", () => {
  const coords: [number, number][] = [
    [0, 0],
    [1.5, 0],
    [-1.5, 0],
    [0, 1.5],
  ];
  const part = partOf(model, fragmentOf(model, 1));
  const k = NOMINAL_BOND_LENGTH / MOL_BOND_LENGTH;

  it("moves the part's atoms, back in the editor's units, and nothing else", () => {
    const r = relayoutOf(model, part, { coords, wedges: null });
    expect(r.atoms).toEqual([
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1.5 * k, y: 0 },
      { id: 3, x: -1.5 * k, y: 0 },
      { id: 4, x: 0, y: 1.5 * k },
    ]);
    expect(r.bonds).toEqual([]);
  });

  it("puts wedges where RDKit says, narrow at the stereocentre, and no others", () => {
    const r = relayoutOf(model, part, {
      coords,
      // a hashed wedge from atom 1 (index 0) to atom 2 (index 1)
      wedges: [{ bond: 0, narrow: 0, stereo: "down" }],
    });
    expect(r.bonds).toEqual([
      // atom 1 has more bonds than atom 2, so narrow there is the usual way
      { id: 7, stereo: "down", stereoOrient: "principle" },
      { id: 9, stereo: "none", stereoOrient: "principle" },
    ]);
  });

  it("turns a wedge round when it is narrow at the end with fewer bonds", () => {
    const r = relayoutOf(model, part, {
      coords,
      wedges: [{ bond: 2, narrow: 3, stereo: "up" }],
    });
    expect(r.bonds).toEqual([{ id: 9, stereo: "up", stereoOrient: "reverse" }]);
  });
});
