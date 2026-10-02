import { describe, expect, it } from "vitest";
import { OCTAHEDRON_EDGES } from "../chem/ligands";
import { layout2D, type LayoutInput } from "./engine";

/**
 * Six coppers as an octahedron, a hydride bridging each edge of two
 * opposite faces (Stryker's reagent), each copper's PPh3 written by name.
 */
function stryker(): LayoutInput {
  const atoms: LayoutInput["atoms"][number][] = [];
  const bonds: { a: number; b: number; order: number }[] = [];
  for (let k = 0; k < 6; k++) atoms.push({ el: "Cu", hs: 0 });
  for (const [p, q] of OCTAHEDRON_EDGES) bonds.push({ a: p, b: q, order: 1 });
  for (let k = 0; k < 6; k++) {
    atoms.push({ el: "H", hs: 0 });
    bonds.push({ a: 6 + k, b: k, order: 1 }, { a: 6 + k, b: (k + 2) % 6, order: 1 });
  }
  for (let k = 0; k < 6; k++) {
    atoms.push({ el: "PPh3", hs: 0 });
    bonds.push({ a: 12 + k, b: k, order: 1 });
  }
  return { atoms, bonds };
}

describe("an octahedral cluster", () => {
  const out = layout2D(stryker());
  const p = (i: number) => ({ x: out.x[i], y: out.y[i] });
  const metals = [0, 1, 2, 3, 4, 5];
  const centre = { x: metals.reduce((t, i) => t + out.x[i], 0) / 6, y: metals.reduce((t, i) => t + out.y[i], 0) / 6 };
  const fromCentre = (i: number) => Math.hypot(out.x[i] - centre.x, out.y[i] - centre.y);
  const apart = (i: number, j: number) => Math.hypot(p(i).x - p(j).x, p(i).y - p(j).y);

  it("is drawn as the solid it is, upright, its metals' contacts dashed", () => {
    // (a corner at the top, straight above the middle)
    const top = metals.reduce((a, b) => (out.y[b] > out.y[a] ? b : a));
    expect(Math.abs(out.x[top] - centre.x)).toBeLessThan(0.3);
    for (const i of metals) expect(out.depth[i]).not.toBeNull();
    expect(out.dashed).toHaveLength(12);
  });

  it("keeps its metals a label's width apart, and no atom on another", () => {
    for (const i of metals) for (const j of metals) if (i < j) expect(apart(i, j)).toBeGreaterThan(1);
    for (let i = 0; i < 18; i++) for (let j = i + 1; j < 18; j++) expect(apart(i, j)).toBeGreaterThan(0.6);
  });

  it("sets each phosphine straight out from the middle", () => {
    for (let k = 0; k < 6; k++) expect(fromCentre(12 + k)).toBeGreaterThan(fromCentre(k) + 0.8);
  });
});
