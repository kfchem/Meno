import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeClipboard } from "../../../lib/clipboard";
import { withText } from "../../../lib/binary/png";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { ACS_1996 } from "../../../lib/chem/style";
import { structureInDrop, structureOnClipboard } from "./chem/fromClipboard";
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

  it("are only those the platform's clipboard takes: no Windows bitmap or object on a Mac", async () => {
    const mac = new Set(["meno", "mol", "text", "gvml", "png"] as const);
    const items = await pictureItems(model, aromatic, ACS_1996, mac);
    expect(items.map((i) => i.flavor)).toEqual(["gvml"]);
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

describe("an object Meno served for Office, as Word or PowerPoint for Mac hand it over", () => {
  // Word for Mac's copy of a structure a Windows Meno served (lib/binary/testdata)
  const storage = new Uint8Array(
    readFileSync(fileURLToPath(new URL("../../../lib/binary/testdata/word-mac-object.cfb", import.meta.url))),
  );

  it("gives the structure back: its record, from the object's storage", async () => {
    const found = (await structureInPicture({ flavor: "object", bytes: storage }))!;
    expect([found.atoms.length, found.bonds.length]).toEqual([8, 6]);
    expect(found.atoms.filter((a) => a.charge).map((a) => [a.el, a.charge])).toEqual([
      ["N", 1],
      ["O", -1],
    ]);
    expect(found.bonds.filter((b) => b.stereo === "up")).toHaveLength(1);
  });

  it("is read from the clipboard before any picture beside it", async () => {
    await writeClipboard([{ flavor: "object", bytes: storage }]);
    const found = (await structureOnClipboard())!;
    expect(found.atoms).toHaveLength(8);
  });

  it("gives nothing back out of storage that holds no structure", async () => {
    expect(await structureInPicture({ flavor: "object", bytes: new Uint8Array(1024) })).toBeNull();
  });
});

describe("a drop", () => {
  it("reads nothing outside the app, where nothing is dragged in", async () => {
    expect(await structureInDrop()).toBeNull();
  });
});
