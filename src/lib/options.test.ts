import { describe, expect, it } from "vitest";
import { valuesOf, type Option } from "./options";

const OPTIONS: Option[] = [
  { id: "version", label: "Version", type: "choice", choices: [{ value: "auto", label: "Auto" }, { value: "V3000", label: "V3000" }], default: "auto" },
  { id: "scale", label: "Scale", type: "number", default: 1, min: 0.25, max: 4, unit: "×" },
  { id: "title", label: "Title", type: "text", default: "" },
  { id: "hydrogens", label: "Hydrogens", type: "switch", default: false },
];

describe("a role's options", () => {
  it("are their defaults, where nothing was chosen before", () => {
    expect(valuesOf(OPTIONS)).toEqual({ version: "auto", scale: 1, title: "", hydrogens: false });
  });

  it("are the chemist's last choices, each where it still fits its option", () => {
    expect(valuesOf(OPTIONS, { version: "V3000", scale: 2, title: "run 3", hydrogens: true })).toEqual({ version: "V3000", scale: 2, title: "run 3", hydrogens: true });
    // (a choice no longer offered, a number out of range, a value of the wrong sort: the default)
    expect(valuesOf(OPTIONS, { version: "V9000", scale: 40, title: 3, hydrogens: "yes", gone: 1 })).toEqual({ version: "auto", scale: 1, title: "", hydrogens: false });
  });
});
