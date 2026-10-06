import { afterEach, describe, expect, it, vi } from "vitest";
import { kindOfFile } from "./probe";
import { whoReads } from "./read";
import { kindById, registerKinds } from "../io/kinds";
import { MANIFESTS } from "../plugins/known";

// (no plugin's worker in tests: what is added is said by each test)
vi.mock("./workers", () => ({
  addedReaders: async () => new Set(["meno"]),
  readerClient: () => Promise.reject(new Error("no workers in tests")),
}));

const ORCA = "\n\n                                 * O   R   C   A *\n";
const MOL = "ethane\n\n\n  2  1  0  0  0  0  0  0  0  0999 V2000\nM  END\n";

describe("what a file opened or dropped is", () => {
  afterEach(() => registerKinds([]));

  it("is a kind a plugin added brings, by what it holds", async () => {
    registerKinds(MANIFESTS);
    const kind = await kindOfFile("job.out", ORCA);
    expect(kind?.id).toBe("orca");
    expect(kindById("orca")).toBe(kind);
  });

  it("is, where no plugin added brings it, what a plugin on offer would read it as - so that Meno says which to add", async () => {
    const kind = (await kindOfFile("job.out", ORCA))!;
    expect(kind.id).toBe("orca");
    expect(kindById("orca")).toBeUndefined();
    const why = whoReads(kind, "job.out", new Set(["meno"]), { read: {}, also: {} });
    expect((why as Error).message).toBe("To read job.out (ORCA output), add cclib or PySCF in Settings, Plugins.");
    // (a banner is stronger evidence than a molfile's markers, added or not)
    expect((await kindOfFile("job.out", ORCA + MOL))?.id).toBe("orca");
  });

  it("is Meno's own, or text, where no plugin on offer would read it either", async () => {
    expect((await kindOfFile("ethane.mol", MOL))?.id).toBe("mol");
    expect(await kindOfFile("build.log", "compiled in 3 s\n")).toBeNull();
  });
});
