import { describe, expect, it } from "vitest";
import { chemMolblock, isElementSymbol, molIndex } from "./molblock";

describe("chemMolblock", () => {
  it("writes V3000, and a label that is not an element as any atom", () => {
    const block = chemMolblock({
      atoms: [
        { id: 1, x: 0, y: 0, el: "C" },
        { id: 2, x: 1, y: 0, el: "Me" },
        { id: 3, x: 2, y: 0, el: "Cl" },
        { id: 4, x: 3, y: 0, el: "メチル" },
      ],
      bonds: [
        { a: 1, b: 2, order: 1 },
        { a: 1, b: 3, order: 1 },
        { a: 1, b: 4, order: 1 },
      ],
    });
    expect(block).toContain("V3000");
    const lines = block.split("\n");
    const atoms = lines
      .slice(lines.indexOf("M  V30 BEGIN ATOM") + 1, lines.indexOf("M  V30 END ATOM"))
      .map((l) => l.split(" ")[4]);
    expect(atoms).toEqual(["C", "*", "Cl", "*"]);
  });
});

describe("isElementSymbol", () => {
  it("knows the elements as they are written, and nothing else", () => {
    expect(isElementSymbol("C")).toBe(true);
    expect(isElementSymbol("Og")).toBe(true);
    expect(isElementSymbol("cl")).toBe(false);
    expect(isElementSymbol("R")).toBe(false);
    expect(isElementSymbol("OH")).toBe(false);
  });
});

describe("molIndex", () => {
  it("lists the bonds the writer writes, in its order", () => {
    const model = {
      atoms: [{ id: 1 }, { id: 2 }],
      bonds: [
        { id: 5, a: 1, b: 2 },
        { id: 6, a: 1, b: 9 }, // an atom that is not there: not written
      ],
    };
    expect(molIndex(model).bonds.map((b) => b.id)).toEqual([5]);
  });
});
