import { describe, expect, it, vi } from "vitest";
import { askFor, calcShowing, givenValue, rememberOutput, useAsks, askKey } from "./asks";
import type { Reader } from "./client";
import type { CalcInfo } from "./output";
import { resultKey } from "./results";

vi.mock("./workers", () => ({ readerClient: () => Promise.reject(new Error("no workers in tests")) }));

// a molecule read from a cube file: its grids a list, each a promise
const calcOf = (source?: CalcInfo["source"], from = "meno"): CalcInfo => ({
  readers: [from],
  source,
  results: [
    {
      id: "grids",
      on: "list",
      group: "Orbitals",
      label: "Orbitals",
      from,
      columns: [{ label: "Grid" }],
      rows: [{ cells: ["Orbital 4"], surface: { ask: "grid:0" } }, { cells: ["Orbital 5"], surface: { ask: "grid:1" } }],
    },
  ],
});
const reader = (answer: (key: string, text: string) => unknown): Reader & { asked: string[] } => {
  const asked: string[] = [];
  return {
    version: "",
    asked,
    read: () => Promise.reject(new Error("not here")),
    ask: async (kind, key, _name, text) => (asked.push(`${kind} ${key}`), answer(key, text)),
    probe: async () => false,
  };
};
// a cube file's start, as one told by its layout
const CUBE = ["density", "of water", "    1    0.0 0.0 0.0", "    2    0.5 0.0 0.0", "    2    0.0 0.5 0.0", "    2    0.0 0.0 0.5", "    8    8.0 0.0 0.0 0.0", ""].join("\n");

describe("a promise", () => {
  it("is asked for of the reader that gave it, the output sent again, and kept once given", async () => {
    const source = await rememberOutput("water.cube", "the cube's text", "cube");
    const calc = calcOf(source);
    const r = reader((key, text) => ({ key, text }));
    const value = await askFor(calc, "meno", "grid:1", async () => r);
    expect(value).toEqual({ key: "grid:1", text: "the cube's text" });
    expect(givenValue(source, "meno", "grid:1")).toEqual(value);
    expect(useAsks.getState().state[askKey(source, "meno", "grid:1")]).toBe("given");
    // (asked for again: not asked of the reader again)
    await askFor(calc, "meno", "grid:1", async () => r);
    expect(r.asked).toEqual(["cube grid:1"]);
  });

  it("is worked out once, however often it is asked for meanwhile", async () => {
    const source = await rememberOutput("twice.cube", "another text", "cube");
    const r = reader((key) => key);
    await Promise.all([askFor(calcOf(source), "meno", "grid:0", async () => r), askFor(calcOf(source), "meno", "grid:0", async () => r)]);
    expect(r.asked).toEqual(["cube grid:0"]);
  });

  it("says to open its output again, where it is not open this session", async () => {
    const calc = calcOf({ name: "gone.cube", sha256: "0".repeat(64) });
    await expect(askFor(calc, "meno", "grid:0", async () => reader(() => 1))).rejects.toThrow("Open gone.cube again to show this.");
    expect(useAsks.getState().state[askKey(calc.source, "meno", "grid:0")]).toEqual({ error: "Open gone.cube again to show this." });
  });

  it("kept without its kind, as before kinds were kept, is asked for with its kind told again", async () => {
    const source = await rememberOutput("old.cube", CUBE, "cube");
    const { kind: _kind, ...before } = source;
    const r = reader((key) => key);
    await askFor(calcOf(before), "meno", "grid:0", async () => r);
    expect(r.asked).toEqual(["cube grid:0"]);
  });

  it("given and shown, is saved as what it came to; one not shown, or not given, stays a promise", async () => {
    const source = await rememberOutput("saved.cube", "saved text", "cube");
    const calc = calcOf(source);
    await askFor(calc, "meno", "grid:0", async () => reader(() => ({ the: "grid" })));
    const rows = (c: CalcInfo) => (c.results![0] as { rows: { surface?: unknown }[] }).rows.map((r) => r.surface);
    const grids = resultKey({ id: "grids", from: "meno" });
    expect(rows(calcShowing(calc, grids, 0))).toEqual([{ the: "grid" }, { ask: "grid:1" }]);
    expect(rows(calcShowing(calc, grids, 1))).toEqual([{ ask: "grid:0" }, { ask: "grid:1" }]);
    expect(calcShowing(calc, grids, null)).toBe(calc);
  });
});
