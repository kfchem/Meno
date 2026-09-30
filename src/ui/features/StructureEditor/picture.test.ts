import { describe, expect, it } from "vitest";
import { writeClipboard } from "../../../lib/clipboard";
import { withText } from "../../../lib/binary/png";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { ACS_1996 } from "../../../lib/chem/style";
import { structureOnClipboard } from "./chem/fromClipboard";
import { pictureItems, structureInPicture } from "./picture";
import type { Model } from "./store/types";
import { readRecord, recordText } from "./utils/copyPaste";

const L = NOMINAL_BOND_LENGTH;
const model: Model = {
  atoms: [
    { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
    { id: 2, x: L, y: 0, r: 0.9, el: "N", charge: 1 },
  ],
  bonds: [{ id: 3, a: 1, b: 2, order: 1, stereo: "none" }],
};
const aromatic = { aromaticEnabled: false, aromaticRings: {} };
const PIXEL = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"),
  (c) => c.charCodeAt(0),
);

describe("pictures of a structure", () => {
  it("are Office's clip format and an EMF (and a PNG where there is a page to draw it in), each carrying the structure", async () => {
    const items = await pictureItems(model, aromatic, ACS_1996);
    expect(items.map((i) => i.flavor)).toEqual(["gvml", "emf", "embed"]);
    expect(await structureInPicture(items[0])).toEqual(model);
    // the record, for the app to make an object for Office out of on Windows
    expect(readRecord(items[2].text!)).toEqual(model);
  });

  it("give the structure back when pasted, as Office hands the clip format back", async () => {
    const items = await pictureItems(model, aromatic, ACS_1996);
    // only the picture: as Word or PowerPoint put it on the clipboard
    await writeClipboard([items[0]]);
    expect(await structureOnClipboard()).toEqual(model);
  });

  it("read the structure out of a PNG that carries it, and nothing out of one that does not", async () => {
    const png = withText(PIXEL, "meno-structure", recordText(model));
    expect(await structureInPicture({ flavor: "png", bytes: png })).toEqual(model);
    expect(await structureInPicture({ flavor: "png", bytes: PIXEL })).toBeNull();
    expect(await structureInPicture({ flavor: "gvml", bytes: new Uint8Array(8) })).toBeNull();
  });
});
