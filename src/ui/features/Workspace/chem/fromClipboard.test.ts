import { describe, expect, it } from "vitest";
import { writeClipboard } from "../../../../lib/clipboard";
import type { Model } from "../store/types";
import { clipItems } from "../utils/copyPaste";
import { structureOnClipboard } from "./fromClipboard";

const model: Model = {
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 2, x: 1, y: 0, r: 0.9, el: "OMe" },
  ],
  bonds: [{ id: 3, a: 1, b: 2, order: 1, stereo: "down" }],
};

describe("structureOnClipboard", () => {
  it("reads Meno's own record first, losing nothing - a label that is no element among it", async () => {
    await writeClipboard(clipItems(model));
    expect(await structureOnClipboard()).toEqual(model);
  });

  it("reads a MOL file another program put there, or one as plain text", async () => {
    const mol = clipItems({ atoms: model.atoms.map((a) => ({ ...a, el: "C" })), bonds: model.bonds })[1].text!;
    for (const flavor of ["mol", "text"] as const) {
      await writeClipboard([{ flavor, text: mol }]);
      const got = (await structureOnClipboard())!;
      expect(got.atoms.map((a) => a.el)).toEqual(["C", "C"]);
      expect(got.bonds).toHaveLength(1);
    }
  });

  it("finds nothing in text that is no structure", async () => {
    await writeClipboard([{ flavor: "text", text: "two words" }]);
    expect(await structureOnClipboard()).toBeNull();
    await writeClipboard([]);
    expect(await structureOnClipboard()).toBeNull();
  });
});
