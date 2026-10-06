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
  kinds: [{ id: "nbo-47", name: "NBO input", program: "NBO", extensions: [".47"], marks: [{ text: "$GENNBO", at: "line-start" }] }],
};

describe("a plugin's manifest", () => {
  it("is read as data: what it is, what makes its environment and runs its worker, what it reads, and the kinds it brings", () => {
    expect(acceptManifest(good)).toEqual(good);
    // (each plugin Meno carries, from its folder: Meno names none of them)
    expect(MANIFESTS.map((m) => m.id)).toEqual(["cclib", "pyscf"]);
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
