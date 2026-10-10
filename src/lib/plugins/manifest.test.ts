import { describe, expect, it } from "vitest";
import { acceptManifest, folded, holdsMark, markAt } from "./manifest";
import { MANIFESTS } from "./known";

const good = {
  id: "nbo",
  name: "NBO",
  version: "7.0",
  description: "Natural bond orbitals.",
  licence: "Commercial",
  homepage: "https://nbo7.chem.wisc.edu",
  environment: { maker: "uv", lock: "requirements.lock" },
  worker: "worker.py",
  reads: ["gaussian", "nbo-47"],
  roles: [],
  kinds: [{ id: "nbo-47", name: "NBO input", program: "NBO", extensions: [".47"], marks: [{ text: "$GENNBO", at: "line-start" }] }],
  writes: [],
  texts: [],
  roleOptions: {},
  steps: [],
  systems: [],
  installed: [],
};

describe("a plugin's manifest", () => {
  it("is read as data: what it is, what makes its environment and runs its worker, what it reads, and the kinds it brings", () => {
    expect(acceptManifest(good)).toEqual(good);
    // (each plugin Meno carries, from its folder: Meno names none of them)
    expect(MANIFESTS.map((m) => m.id)).toEqual(["cclib", "crest", "gaussian", "orca", "pyscf", "rdkit", "xtb"]);
  });

  it("may write kinds rather than read them: each named, its files' names, what it is given, and its options as data", () => {
    const writer = {
      ...good,
      reads: [],
      kinds: [],
      writes: [
        {
          id: "nbo-input",
          name: "NBO input",
          extensions: [".47", "47", ".NOT/AN/EXT"],
          takes: "molecule",
          options: [
            { id: "charge", label: "Charge", type: "number", default: 0, from: "charge" },
            { id: "bad", label: "Bad", type: "choice", choices: [{ value: "a", label: "A" }], default: "b" },
            { id: "run", label: "Run", type: "code", default: "rm -rf /" },
          ],
        },
        { id: "no-takes", name: "No takes", extensions: [".x"] },
        { id: "no-extension", name: "No extension", extensions: [], takes: "molecule" },
      ],
    };
    expect(acceptManifest(writer)?.writes).toEqual([
      { id: "nbo-input", name: "NBO input", extensions: [".47"], takes: "molecule", options: [{ id: "charge", label: "Charge", type: "number", default: 0, from: "charge" }] },
    ]);
    // (the plugin Meno carries that writes Gaussian's input: read as any would be)
    const gaussian = MANIFESTS.find((m) => m.id === "gaussian")!;
    expect(gaussian.writes.map((w) => [w.id, w.extensions, w.takes])).toEqual([["gaussian-input", [".gjf", ".com"], "molecule"]]);
    expect(gaussian.writes[0].options.map((o) => o.id)).toEqual(["job", "method", "basis", "dispersion", "keywords", "charge", "multiplicity", "title", "checkpoint", "processors", "memory"]);
  });

  it("takes options for the roles it fills, read as data - for those only", () => {
    const opts = { conformers: [{ id: "count", label: "Conformers sought", type: "number", default: 30, min: 1 }], smiles: [{ id: "x", label: "X", type: "switch", default: true }] };
    const read = acceptManifest({ ...good, reads: [], kinds: [], roles: ["conformers"], roleOptions: opts })!;
    expect(read.roleOptions).toEqual({ conformers: [{ id: "count", label: "Conformers sought", type: "number", default: 30, min: 1 }] });
    // (RDKit's, as it carries them)
    const rdkit = MANIFESTS.find((m) => m.id === "rdkit")!;
    expect(rdkit.roleOptions.conformers.map((o) => o.id)).toEqual(["count", "field", "iters", "same", "seed"]);
  });

  it("may fill kinds of step: each kind once, its programs by name - never a path - and its options as data", () => {
    const steps = {
      ...good,
      reads: [],
      kinds: [],
      steps: [
        { kind: "optimise", programs: ["xtb", "../bin/sh", "/usr/bin/xtb", "xtb"], options: [{ id: "level", label: "Level", type: "choice", choices: [{ value: "tight", label: "Tight" }], default: "tight" }] },
        { kind: "optimise", programs: ["other"] },
        { kind: "Not A Kind", programs: ["xtb"] },
        { kind: "conformers", takes: ["molecules", "drawings", "conformers"] },
        { kind: "duplicates", takes: [] },
      ],
    };
    expect(acceptManifest(steps)?.steps).toEqual([
      { kind: "optimise", programs: ["xtb"], options: [{ id: "level", label: "Level", type: "choice", choices: [{ value: "tight", label: "Tight" }], default: "tight" }] },
      // (what it takes, of what flows: none said, all its kind takes)
      { kind: "conformers", programs: [], options: [], takes: ["molecules", "conformers"] },
      { kind: "duplicates", programs: [], options: [] },
    ]);
    // (xTB's, as Meno carries it)
    const xtb = MANIFESTS.find((m) => m.id === "xtb")!;
    expect(xtb.steps.map((d) => [d.kind, d.programs])).toEqual([
      ["optimise", ["xtb"]],
      ["energy", ["xtb"]],
      ["frequencies", ["xtb"]],
    ]);
    expect(xtb.steps[0].options.map((o) => o.id)).toEqual(["method", "solvent", "level"]);
  });

  it("may say the systems it can be added on - those Meno knows of; none said, every one", () => {
    const steps = { ...good, reads: [], kinds: [], steps: [{ kind: "conformers", programs: ["crest"] }] };
    expect(acceptManifest({ ...steps, systems: ["macos", "linux", "beos"] })?.systems).toEqual(["macos", "linux"]);
    expect(acceptManifest(steps)?.systems).toEqual([]);
    // (CREST's, as Meno carries it: conda-forge has it for macOS and Linux)
    expect(MANIFESTS.find((m) => m.id === "crest")?.systems).toEqual(["macos", "linux"]);
    expect(MANIFESTS.find((m) => m.id === "xtb")?.systems).toEqual([]);
  });

  it("may run programs installed separately: each by its name, what it is called and its file on each system - only those its steps run", () => {
    const steps = { ...good, reads: [], kinds: [], steps: [{ kind: "energy", programs: ["orca"] }] };
    const installed = [
      { name: "orca", label: "ORCA", files: { macos: "orca", linux: "orca", windows: "orca.exe", beos: "orca" } },
      { name: "orca", label: "Again", files: { linux: "orca" } },
      { name: "unrun", label: "Not run by a step", files: { linux: "unrun" } },
      { name: "pathed", label: "A path", files: { linux: "/usr/bin/pathed" } },
      { name: "../x", label: "X", files: { linux: "x" } },
    ];
    expect(acceptManifest({ ...steps, installed })?.installed).toEqual([{ name: "orca", label: "ORCA", files: { macos: "orca", windows: "orca.exe", linux: "orca" } }]);
    expect(acceptManifest(steps)?.installed).toEqual([]);
  });

  it("may fill roles rather than read files - but a plugin that does neither is none", () => {
    const roles = { ...good, reads: [], kinds: [], roles: ["smiles", "checks", "Not A Role"] };
    expect(acceptManifest(roles)?.roles).toEqual(["smiles", "checks"]);
    expect(acceptManifest({ ...good, reads: [], kinds: [], roles: [], writes: [] })).toBeNull();
  });

  it("is none where it cannot be used: no id, a lock or worker outside its folder, nothing it reads", () => {
    expect(acceptManifest({ ...good, id: "Not An Id" })).toBeNull();
    expect(acceptManifest({ ...good, environment: { maker: "uv", lock: "/etc/passwd" } })).toBeNull();
    expect(acceptManifest({ ...good, environment: { maker: "uv", lock: "../chem/requirements.lock" } })).toBeNull();
    expect(acceptManifest({ ...good, environment: { maker: "uv", lock: "env/requirements.lock" } })).toBeNull();
    expect(acceptManifest({ ...good, environment: { maker: "pixi", lock: "requirements.lock" } })).toBeNull();
    expect(acceptManifest({ ...good, environment: { maker: "pixi", lock: "pixi.lock" } })).not.toBeNull();
    expect(acceptManifest({ ...good, worker: "../../evil.py" })).toBeNull();
    expect(acceptManifest({ ...good, worker: "workers/worker.py" })).toBeNull();
    expect(acceptManifest({ ...good, reads: [] })).toBeNull();
    expect(acceptManifest("nbo")).toBeNull();
  });

  it("brings no kind that cannot be told - a mark too short to tell anything, a pattern, no mark and no asking", () => {
    const kinds = (k: unknown[]) => acceptManifest({ ...good, kinds: k })!.kinds;
    expect(kinds([{ ...good.kinds[0], marks: [{ text: "N" }] }])).toEqual([]);
    expect(kinds([{ ...good.kinds[0], marks: [/GENNBO/] }])).toEqual([]);
    expect(kinds([{ ...good.kinds[0], marks: [] }])).toEqual([]);
    // (told by asking its plugin: by its files' names first)
    expect(kinds([{ ...good.kinds[0], marks: [], probe: true }])).toEqual([{ ...good.kinds[0], marks: [], probe: true }]);
    expect(kinds([{ ...good.kinds[0], marks: [], extensions: [], probe: true }])).toEqual([]);
    // (a kind many programs write names no one program)
    const { program: _, ...anyProgram } = good.kinds[0];
    expect(kinds([anyProgram])).toEqual([anyProgram]);
  });
});

describe("a mark", () => {
  it("is text a file's start holds, runs of spaces one, anywhere or at a line's start, in its case or any", () => {
    const head = folded("title\n   * O   R   C   A *\n [Molden Format]\n");
    expect(holdsMark(head, { text: "* O R C A *" })).toBe(true);
    expect(holdsMark(head, { text: "*  O  R  C  A  *" })).toBe(true);
    expect(holdsMark(head, { text: "O R C A", at: "line-start" })).toBe(false);
    expect(holdsMark(head, { text: "[molden format]", at: "line-start" })).toBe(false);
    expect(holdsMark(head, { text: "[molden format]", at: "line-start", anyCase: true })).toBe(true);
  });

  it("is found where it first comes in the file: a program's banner before another's it quotes", () => {
    const head = folded("title\n   * O   R   C   A *\n [Molden Format]\n");
    expect(markAt(head, { text: "* O R C A *" })).toBe(head.indexOf("*"));
    expect(markAt(head, { text: "[Molden Format]", at: "line-start" })).toBe(head.indexOf(" [Molden"));
    expect(markAt(head, { text: "NWChem" })).toBe(-1);
  });
});
