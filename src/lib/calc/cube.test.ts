import { describe, expect, it } from "vitest";
import { CUBE_MARK, cubeGrid, readCube } from "./cube";
import { outputKindOf } from "./catalog";
import { floatsOf, readGrid, readResults } from "./results";

const BOHR = 0.529177210903;

// a cube of two orbitals on a 2 × 2 × 3 grid about H2, written by hand as
// Gaussian writes one: the number of atoms negative, the orbitals listed,
// both orbitals' values at each point together, the last axis fastest
const twoOrbitals = [
  " H2 orbitals",
  " MO coefficients",
  "   -2   -1.000000   -1.000000   -1.500000",
  "    2    2.000000    0.000000    0.000000",
  "    2    0.000000    2.000000    0.000000",
  "    3    0.000000    0.000000    1.500000",
  "    1    1.000000    0.000000    0.000000   -0.700000",
  "    1    1.000000    0.000000    0.000000    0.700000",
  "    2    1    2",
  // (point by point: orbital 1, orbital 2)
  "  1.0E-01 -1.0E-01  2.0E-01 -2.0E-01  3.0E-01 -3.0E-01",
  "  4.0E-01  4.0E-01  5.0E-01  5.0E-01  6.0E-01  6.0E-01",
  "  7.0E-02 -7.0E-02  8.0E-02 -8.0E-02  9.0E-02 -9.0E-02",
  "  1.0E-02  1.0E-02  2.0E-02  2.0E-02  3.0E-02  3.0E-02",
].join("\n");

// a density's cube, in ångströms (the axes' counts negative)
const density = [
  "Electron density",
  "PySCF Version: 2.14.0  Date: today",
  "    1    0.000000    0.000000    0.000000",
  "   -2    0.500000    0.000000    0.000000",
  "   -2    0.000000    0.500000    0.000000",
  "   -2    0.000000    0.000000    0.500000",
  "    2    2.000000    0.250000    0.250000    0.250000",
  "  0.1 0.2 0.3 0.4",
  "  0.5 0.6 0.7 0.8",
].join("\n");

describe("a cube file", () => {
  it("is told by its layout, whatever it is called", () => {
    expect(CUBE_MARK.test(twoOrbitals)).toBe(true);
    expect(outputKindOf(density)?.id).toBe("cube");
    expect(outputKindOf("3\nwater\nO 0 0 0\nH 0 0 1\nH 0 1 0\n")).toBeNull();
  });

  it("reads as its molecule, in ångströms, and a list of its grids - each a promise - shown as it comes", () => {
    const out = readCube("h2.cube", twoOrbitals);
    expect(out.atoms).toEqual(["H", "H"]);
    expect(out.frames[0][5]).toBeCloseTo(0.7 * BOHR, 6);
    const [list] = readResults(out.results, 2, 1, "Cube files");
    expect(list.on).toBe("list");
    if (list.on !== "list") return;
    expect(list.label).toBe("Orbitals");
    expect(list.rows.map((r) => r.cells[0])).toEqual(["Orbital 1", "Orbital 2"]);
    expect(list.rows[1].surface).toEqual({ ask: "grid:1" });
    expect(list.rows[0].frame).toBe(0);
    expect(list.shown).toBe(0);
  });

  it("gives each grid asked for, its values its own, its axes in ångströms, an orbital two-signed", () => {
    const g = readGrid(cubeGrid("h2.cube", twoOrbitals, "grid:1"))!;
    expect(g.counts).toEqual([2, 2, 3]);
    expect(g.origin[2]).toBeCloseTo(-1.5 * BOHR, 6);
    expect(g.axes[2][2]).toBeCloseTo(1.5 * BOHR, 6);
    expect(Array.from(floatsOf(g.values)).map((v) => +v.toFixed(3))).toEqual([-0.1, -0.2, -0.3, 0.4, 0.5, 0.6, -0.07, -0.08, -0.09, 0.01, 0.02, 0.03]);
    expect(g.signed).toBe(true);
    expect(g.iso).toBe(0.05);
    expect(() => cubeGrid("h2.cube", twoOrbitals, "grid:2")).toThrow(/no grid:2/);
  });

  it("gives a density one-signed, drawn at a density's value, named by what its comments say", () => {
    const out = readCube("rho.cube", density);
    const list = out.results![0] as { rows: { cells: unknown[] }[] };
    expect(list.rows[0].cells[0]).toBe("Electron density");
    const g = readGrid(cubeGrid("rho.cube", density, "grid:0"))!;
    expect(g.axes[0][0]).toBe(0.5);
    expect(g.signed).toBeUndefined();
    expect(g.iso).toBe(0.002);
  });

  it("says when it is no cube, or ends before its grid does", () => {
    expect(() => readCube("x.cube", "a\nb\nnot numbers\n")).toThrow(/does not read as a cube/);
    expect(() => cubeGrid("x.cube", density.split("\n").slice(0, 8).join("\n"), "grid:0")).toThrow(/ends before/);
  });
});
