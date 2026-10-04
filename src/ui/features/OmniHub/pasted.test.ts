import { describe, expect, it } from "vitest";
import type { Drawn } from "../StructureEditor/store/types";
import { readRecord } from "../StructureEditor/utils/copyPaste";
import { canvasHolding } from "./pasted";

describe("canvasHolding", () => {
  it("makes a structure canvas, named as the New menu names one, holding what was pasted", () => {
    const found: Drawn = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
        { id: 2, x: 1.5, y: 0, r: 0.9, el: "O" },
      ],
      bonds: [{ id: 3, a: 1, b: 2, order: 1, stereo: "none" }],
    };
    const next = canvasHolding(found);
    expect(next).toMatchObject({ kind: "structure", label: "Structure Canvas", filename: "clipboard.meno" });
    // (opened as a document's structure is: Meno's record, read back as it was)
    expect(readRecord(next.payload)).toMatchObject({ atoms: found.atoms, bonds: found.bonds });
  });
});
