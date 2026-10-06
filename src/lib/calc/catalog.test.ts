import { describe, expect, it } from "vitest";
import {
  alsoReadersFor,
  MENO,
  READER_PLUGINS,
  READERS,
  readerFor,
  readerIdOf,
  readerLineOf,
  readerNameOf,
  readersOf,
  type PythonReader,
  type ReaderPlugin,
} from "./catalog";

const none = { read: {}, also: {} };

describe("the readers Meno knows of", () => {
  it("are Meno's own, then each plugin from its manifest, as before they had manifests", () => {
    expect(READERS.map((r) => r.id)).toEqual(["meno", "cclib", "pyscf"]);
    // (the structure files Meno reads on the page, and the cube, under the readers' contract)
    expect(MENO.reads).toEqual(["meno-workspace", "rxn", "mol", "sdf", "xyz", "cube"]);
    const [cclib, pyscf] = READER_PLUGINS;
    expect(cclib).toMatchObject({
      name: "cclib",
      version: "1.9rc1",
      profile: "reader-cclib",
      lock: "resources/py/requirements.reader-cclib.lock",
      worker: "resources/workers/reader_cclib.py",
      reads: ["orca", "gaussian", "gaussian-fchk", "xtb"],
    });
    expect(cclib.env).toBeUndefined();
    expect(pyscf).toMatchObject({ name: "PySCF", profile: "reader-pyscf", lock: "resources/pixi/reader-pyscf/pixi.lock", env: "pixi" });
  });

  it("are known by id; what was kept of one before - its name and version, a name it went by - is read as its id", () => {
    expect(readerIdOf("cclib")).toBe("cclib");
    expect(readerIdOf("cclib 1.9rc1")).toBe("cclib");
    expect(readerIdOf("pyscf 2.14.0")).toBe("pyscf");
    expect(readerIdOf("PySCF 2.14.0")).toBe("pyscf");
    expect(readerIdOf("Cube files")).toBe("meno");
    expect(readerIdOf("NBO 7")).toBe("NBO 7");
    expect(readerLineOf("PySCF 2.14.0")).toBe("pyscf 2.14.0");
    expect(readerLineOf("Cube files")).toBe("meno");
    expect(readerLineOf("cclib 1.9rc1")).toBe("cclib 1.9rc1");
    expect(readerNameOf("pyscf")).toBe("PySCF");
    expect(readerNameOf("PySCF 2.14.0")).toBe("PySCF");
    expect(readerNameOf("meno")).toBe("Meno");
    expect(readerNameOf("NBO 7")).toBe("NBO 7");
  });
});

describe("who reads a kind", () => {
  // another reader of ORCA's output, and of cubes
  const other: ReaderPlugin = { ...(READER_PLUGINS[0] as PythonReader), id: "orca-own", name: "Meno's ORCA reader", reads: ["orca", "cube"], profile: "reader-orca-own" };
  const readers = [...READERS, other];

  it("is any reader that reads it, in Meno's order: Meno first, where it reads it", () => {
    expect(readersOf("orca", readers).map((p) => p.id)).toEqual(["cclib", "pyscf", "orca-own"]);
    expect(readersOf("molden", readers).map((p) => p.id)).toEqual(["pyscf"]);
    expect(readersOf("cube", readers).map((p) => p.id)).toEqual(["meno", "orca-own"]);
  });

  it("is the one chosen, where it is added; else Meno, where it reads it; else the first added", () => {
    const both = new Set(["cclib", "orca-own"]);
    expect(readerFor("orca", both, none, readers)?.id).toBe("cclib");
    expect(readerFor("orca", both, { read: { orca: "orca-own" }, also: {} }, readers)?.id).toBe("orca-own");
    // (chosen, but taken out again: the first added reads it)
    expect(readerFor("orca", new Set(["cclib"]), { read: { orca: "orca-own" }, also: {} }, readers)?.id).toBe("cclib");
    // (a choice for one kind is no choice for another)
    expect(readerFor("gaussian", both, { read: { orca: "orca-own" }, also: {} }, readers)?.id).toBe("cclib");
    // (Meno keeps its kinds, a plugin that reads it too added - unless the plugin is chosen)
    expect(readerFor("cube", both, none, readers)?.id).toBe("meno");
    expect(readerFor("cube", both, { read: { cube: "orca-own" }, also: {} }, readers)?.id).toBe("orca-own");
  });

  it("is none where nothing added reads it", () => {
    expect(readerFor("orca", new Set(), none, readers)).toBeNull();
    expect(readerFor("xtb", new Set(["pyscf"]), none, readers)).toBeNull();
  });

  it("reads it alone, unless others are chosen to read it as well - each added, each reading it, the reader not twice", () => {
    const all = new Set(["cclib", "pyscf", "orca-own"]);
    expect(alsoReadersFor("orca", all, none, readers)).toEqual([]);
    const also = { read: {}, also: { orca: ["pyscf", "cclib", "orca-own"], gaussian: ["orca-own"] } };
    expect(alsoReadersFor("orca", all, also, readers).map((p) => p.id)).toEqual(["pyscf", "orca-own"]);
    expect(alsoReadersFor("orca", new Set(["cclib"]), also, readers)).toEqual([]);
    // (orca-own does not read Gaussian's output)
    expect(alsoReadersFor("gaussian", all, also, readers)).toEqual([]);
  });
});
