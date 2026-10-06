/**
 * The measurement asked for on 2026-10-06 (docs/FILE-IO.md, *Response*):
 * Meno's own readers on the page or in a web worker. Not to be merged -
 * each case is what a reader of Meno's does with a file of that size, run
 * the same either way.
 */
import { moleculesToEditorModel, readMoleculesFromText } from "../utils/importers";
import { cubeGrid } from "../lib/calc/cube";

export type CaseId = "mol" | "sdf" | "xyz" | "cube";

/** What a reader does with each case's file: the molecules read, a drawing's laid out; a cube's grid read. */
export function runCase(id: CaseId, text: string): unknown {
  switch (id) {
    case "mol":
    case "sdf":
      return moleculesToEditorModel(readMoleculesFromText(text, id));
    case "xyz":
      return readMoleculesFromText(text, "xyz");
    case "cube":
      return cubeGrid("bench.cube", text, "grid:0");
  }
}
