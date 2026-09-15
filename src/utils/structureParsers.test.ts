import { describe, expect, it } from "vitest";
import { parseSDF, parseXYZ } from "./structureParsers";
import sampleXyz from "../assets/KEF20633_b_296.xyz?raw";

describe("parseXYZ", () => {
  it("parses the bundled sample and infers bonds", () => {
    const frames = parseXYZ(sampleXyz);
    expect(frames).toHaveLength(1);
    expect(frames[0].atoms).toHaveLength(76);
    expect(frames[0].bonds.length).toBeGreaterThan(0);
  });

  it("parses multiple frames", () => {
    const frame = "2\ncomment\nC 0 0 0\nC 1.54 0 0";
    const frames = parseXYZ(`${frame}\n${frame}`);
    expect(frames).toHaveLength(2);
    expect(frames[1].bonds).toEqual([{ a1: 0, a2: 1, order: 1 }]);
  });
});

describe("parseSDF", () => {
  it("reads V2000 bond stereo codes", () => {
    const mol = [
      "wedge",
      "",
      "",
      "  2  1  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 C   0  0",
      "    1.0000    0.0000    0.0000 O   0  0",
      "  1  2  1  6",
      "M  END",
    ].join("\n");
    const [m] = parseSDF(mol);
    expect(m.atoms.map((a) => a.element)).toEqual(["C", "O"]);
    expect(m.bonds[0]).toEqual({ a1: 0, a2: 1, order: 1, stereoCode: 6 });
  });

  it("splits multi-record SDF on $$$$", () => {
    const rec = [
      "r",
      "",
      "",
      "  1  0  0  0  0  0  0  0  0  0999 V2000",
      "    0.0000    0.0000    0.0000 N   0  0",
      "M  END",
    ].join("\n");
    expect(parseSDF(`${rec}\n$$$$\n${rec}\n$$$$\n`)).toHaveLength(2);
  });

  it("reads V3000 atoms, bonds and CFG stereo", () => {
    const mol = [
      "v3000",
      "",
      "",
      "  0  0  0     0  0            999 V3000",
      "M  V30 BEGIN CTAB",
      "M  V30 COUNTS 2 1 0 0 0",
      "M  V30 BEGIN ATOM",
      "M  V30 1 C 0 0 0 0",
      "M  V30 2 Cl 1.5 0 0 0",
      "M  V30 END ATOM",
      "M  V30 BEGIN BOND",
      "M  V30 1 1 1 2 CFG=1",
      "M  V30 END BOND",
      "M  V30 END CTAB",
      "M  END",
    ].join("\n");
    const [m] = parseSDF(mol);
    expect(m.atoms.map((a) => a.element)).toEqual(["C", "Cl"]);
    expect(m.bonds).toEqual([{ a1: 0, a2: 1, order: 1, stereoCode: 1 }]);
  });
});
