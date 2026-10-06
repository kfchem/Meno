import { describe, expect, it } from "vitest";
import {
  alsoReadersFor,
  anyKindById,
  MENO,
  OFFERED,
  PLUGINS,
  pluginsFilling,
  READER_PLUGINS,
  pluginOf,
  READERS,
  WRITER_PLUGINS,
  readerFor,
  readerIdOfLine,
  readerNameOf,
  readersOf,
  type PythonPlugin,
  type ReaderPlugin,
} from "./catalog";

const none = { read: {}, also: {} };

describe("the readers Meno knows of", () => {
  it("are Meno's own, then each plugin from its manifest in its folder", () => {
    expect(READERS.map((r) => r.id)).toEqual(["meno", "cclib", "pyscf"]);
    // (the structure files Meno reads on the page, and the cube, under the readers' contract)
    expect(MENO.reads).toEqual(["meno-workspace", "rxn", "mol", "sdf", "xyz", "pdb", "cube"]);
    const [cclib, pyscf] = READER_PLUGINS;
    expect(cclib).toMatchObject({
      name: "cclib",
      version: "1.9rc1",
      profile: "plugin-cclib",
      lock: "resources/plugins/cclib/requirements.lock",
      worker: "resources/plugins/cclib/worker.py",
    });
    expect(cclib.env).toBeUndefined();
    // (every program cclib reads, each a kind it brings itself)
    expect(cclib.reads).toEqual(expect.arrayContaining(["orca", "gaussian", "gaussian-fchk", "xtb", "nwchem", "psi4", "qchem", "gamess", "molpro"]));
    expect(cclib.reads.length).toBeGreaterThan(15);
    expect(pyscf).toMatchObject({
      name: "PySCF",
      profile: "plugin-pyscf",
      lock: "resources/plugins/pyscf/pixi.lock",
      worker: "resources/plugins/pyscf/worker.py",
      env: "pixi",
      reads: ["orca", "gaussian", "gaussian-fchk", "molden"],
    });
  });

  it("are every plugin - those that read files, and those that fill roles, as RDKit does - each in an environment named for it", () => {
    expect(PLUGINS.map((p) => p.id)).toEqual(["cclib", "gaussian-input", "pyscf", "rdkit"]);
    const rdkit = PLUGINS.find((p) => p.id === "rdkit")!;
    expect(rdkit).toMatchObject({ reads: [], profile: "plugin-rdkit", lock: "resources/plugins/rdkit/requirements.lock", worker: "resources/plugins/rdkit/worker.py" });
    expect(rdkit.roles).toEqual(["smiles", "checks", "stereo-labels", "stereoisomers", "conformers", "drawing"]);
    expect(READER_PLUGINS.map((p) => p.id)).toEqual(["cclib", "pyscf"]);
    expect(pluginsFilling("smiles").map((p) => p.id)).toEqual(["rdkit"]);
    expect(pluginsFilling("conformers").map((p) => p.id)).toEqual(["rdkit"]);
    // (and those that write files: Gaussian's input, its plugin set up as any is)
    expect(WRITER_PLUGINS.map((p) => p.id)).toEqual(["gaussian-input"]);
    expect(WRITER_PLUGINS[0]).toMatchObject({ reads: [], roles: [], profile: "plugin-gaussian-input", worker: "resources/plugins/gaussian-input/worker.py" });
  });

  it("each reads the kinds it brings, and Meno's: none a kind only another plugin brings, which it does not know", () => {
    const nbo = pluginOf({
      id: "nbo",
      name: "NBO",
      version: "7",
      description: "",
      licence: "",
      homepage: "",
      environment: { maker: "uv", lock: "requirements.lock" },
      worker: "worker.py",
      reads: ["nbo-47", "xyz", "gaussian"],
      roles: [],
      writes: [],
      kinds: [{ id: "nbo-47", name: "NBO input", program: "NBO", extensions: [".47"], marks: [{ text: "$GENNBO" }] }],
    });
    expect(nbo).toMatchObject({ reads: ["nbo-47", "xyz"], lock: "resources/plugins/nbo/requirements.lock", worker: "resources/plugins/nbo/worker.py" });
    for (const p of READER_PLUGINS) {
      for (const id of p.reads) expect(anyKindById(id), `${p.id} reads ${id}`).toBeDefined();
    }
    // (the kinds of every plugin on offer, Meno's with them: what a file nothing added reads would be read as)
    expect(OFFERED.kinds.map((k) => k.id)).toEqual(expect.arrayContaining(["mol", "cube", "orca", "molden", "nwchem"]));
    expect(OFFERED.refused).toEqual([]);
  });

  it("are known by id - a molecule keeps each as its id and version - and named by it", () => {
    expect(readerIdOfLine("cclib 1.9rc1")).toBe("cclib");
    expect(readerIdOfLine("meno")).toBe("meno");
    expect(readerNameOf("pyscf")).toBe("PySCF");
    expect(readerNameOf("meno")).toBe("Meno");
    expect(readerNameOf("nbo")).toBe("nbo");
  });
});

describe("who reads a kind", () => {
  // another reader of ORCA's output, and of cubes
  const other: ReaderPlugin = { ...(READER_PLUGINS[0] as PythonPlugin), id: "orca-own", name: "Meno's ORCA reader", reads: ["orca", "cube"], profile: "plugin-orca-own" };
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
