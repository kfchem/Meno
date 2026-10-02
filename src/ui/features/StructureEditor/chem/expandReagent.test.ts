import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { abbreviationStructure } from "../../../../lib/chem/abbreviations";
import { sameConfiguration } from "../../../../lib/layout/drawn";
import { emptyStructureDocument, expandAbbreviation } from "../document";
import type { Model } from "../store/types";
import { undrawnHydrogens } from "./drawing";
import { layoutJob } from "./engineLayout";

const alone = (el: string): Model => ({ atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el }], bonds: [] });
const expanded = (model: Model, id = 1) => expandAbbreviation({ ...emptyStructureDocument(), model, nextId: 100 }, id).model;

describe("a reagent's label written out on the canvas", () => {
  it("shows the configuration Clean-up reads back as the reagent's own", () => {
    for (const label of ["L-proline", "(S,S)-DPEN", "(S)-CBS", "Shi's catalyst", "(R,R)-Jacobsen's catalyst", "(1S)-CSA"]) {
      const model = expanded(alone(label));
      const s = abbreviationStructure(label)!;
      // (written out alone, its atoms come in the structure's order, the H the engine drew after them)
      const job = layoutJob(model);
      const given = s.atoms.flatMap((a, i) => (a.tetra ? [[i, a.tetra] as const] : []));
      expect(given.length, label).toBeGreaterThan(0);
      for (const [i, t] of given) {
        const read = job.input.atoms[i].tetra;
        expect(read, `${label}: atom ${i}`).toBeDefined();
        expect(sameConfiguration(read!, t), `${label}: atom ${i}`).toBe(true);
      }
    }
  });

  it("binds a ligand's neutral donor by a coordination bond, which takes no H from a carbene's carbon", () => {
    const model: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "Pd" },
        { id: 2, x: L, y: 0, r: 0.9, el: "IPr" },
        { id: 3, x: -L, y: 0, r: 0.9, el: "PPh3" },
      ],
      bonds: [
        { id: 10, a: 1, b: 2, order: 1 },
        { id: 11, a: 1, b: 3, order: 1 },
      ],
    };
    const out = expanded(expanded(model, 2), 3);
    expect(out.bonds.filter((b) => b.id === 10 || b.id === 11).every((b) => b.coordination)).toBe(true);
    const carbene = out.atoms.find((a) => a.id === 2)!;
    expect(carbene.el).toBe("C");
    expect(undrawnHydrogens(out).get(2)).toBe(0);
  });
});
