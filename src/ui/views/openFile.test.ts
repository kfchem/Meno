import { describe, expect, it } from "vitest";
import { openedAs, OPENABLE } from "./openFile";

const MOL = `ethanol
  Meno

  2  1  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
M  END
`;

describe("openedAs", () => {
  it("opens a chemical file on a structure canvas, named for the file", () => {
    expect(openedAs("ethanol.mol", MOL)).toEqual({
      kind: "structure",
      label: "ethanol.mol",
      data: { filename: "ethanol.mol", payload: MOL },
    });
  });

  it("opens an XYZ file and a Meno workspace on a structure canvas too, where 3D stands in 3D", () => {
    const xyz = "3\nwater\nO 0 0 0\nH 0.76 0.59 0\nH -0.76 0.59 0\n";
    expect(openedAs("water.xyz", xyz)).toEqual({ kind: "structure", label: "water.xyz", data: { filename: "water.xyz", payload: xyz } });
    // (known by its content, whatever it is called)
    expect(openedAs("water.out", xyz).kind).toBe("structure");
    expect(openedAs("work.meno", "{}").kind).toBe("structure");
  });

  it("opens text in the text editor, and JSON laid out", () => {
    expect(openedAs("run.py", "print(1)\n")).toMatchObject({ kind: "text", data: { text: "print(1)\n", language: "py" } });
    expect(openedAs("a.json", '{"a":1}')).toMatchObject({ kind: "text", data: { text: '{\n  "a": 1\n}', language: "json" } });
    expect(openedAs("notes.abc", "plain words")).toMatchObject({ kind: "text", data: { text: "plain words", language: "abc" } });
  });

  it("offers chemical files and text to Open", () => {
    for (const ext of [".meno", ".mol", ".sdf", ".rxn", ".xyz", ".txt", ".py"]) expect(OPENABLE.split(",")).toContain(ext);
  });
});
