import { describe, expect, it } from "vitest";
import { outputExtensions, READER_PLUGINS, readerFor, readersFor, readersOf, type PythonReader, type ReaderPlugin } from "./catalog";

describe("the kinds of calculation output", () => {
  it("open as files of every kind's names", () => {
    expect(outputExtensions()).toEqual(expect.arrayContaining([".out", ".log", ".fchk"]));
  });
});

describe("which reader reads what", () => {
  // two readers of ORCA's output: cclib's, and another
  const other: ReaderPlugin = { ...(READER_PLUGINS[0] as PythonReader), id: "orca-own", name: "Meno's ORCA reader", reads: ["orca"], profile: "reader-orca-own" };
  const plugins = [...READER_PLUGINS, other];

  it("are, for a kind, every reader that reads it, in Meno's order", () => {
    expect(readersOf("orca", plugins).map((p) => p.id)).toEqual(["cclib", "pyscf", "orca-own"]);
    expect(readersOf("gaussian", plugins).map((p) => p.id)).toEqual(["cclib", "pyscf"]);
    expect(readersOf("molden", plugins).map((p) => p.id)).toEqual(["pyscf"]);
  });

  it("is the one chosen, where it is added; or else the first added", () => {
    const both = new Set(["cclib", "orca-own"]);
    expect(readerFor("orca", both, {}, plugins)?.id).toBe("cclib");
    expect(readerFor("orca", both, { orca: "orca-own" }, plugins)?.id).toBe("orca-own");
    // (chosen, but taken out again: the first added reads it)
    expect(readerFor("orca", new Set(["cclib"]), { orca: "orca-own" }, plugins)?.id).toBe("cclib");
    // (a choice for one kind is no choice for another)
    expect(readerFor("gaussian", both, { orca: "orca-own" }, plugins)?.id).toBe("cclib");
  });

  it("is every one added that reads it, the one chosen first, then Meno's order", () => {
    const both = new Set(["cclib", "orca-own"]);
    expect(readersFor("orca", both, {}, plugins).map((p) => p.id)).toEqual(["cclib", "orca-own"]);
    expect(readersFor("orca", both, { orca: "orca-own" }, plugins).map((p) => p.id)).toEqual(["orca-own", "cclib"]);
    expect(readersFor("orca", new Set(["orca-own"]), { orca: "cclib" }, plugins).map((p) => p.id)).toEqual(["orca-own"]);
  });

  it("is none where no reader that reads it is added", () => {
    expect(readerFor("orca", new Set(), {}, plugins)).toBeNull();
    expect(readerFor("xtb", new Set(["orca-own"]), {}, plugins)).toBeNull();
  });
});
