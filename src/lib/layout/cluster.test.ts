import { describe, expect, it } from "vitest";
import { OCTAHEDRON_EDGES } from "../chem/ligands";
import { layout2D, type LayoutInput } from "./engine";

/** Six coppers as an octahedron, a hydride bridging each edge round its side, each copper's PPh3 written by name. */
function stryker(): LayoutInput {
  const atoms: LayoutInput["atoms"][number][] = [];
  const bonds: { a: number; b: number; order: number }[] = [];
  for (let k = 0; k < 6; k++) atoms.push({ el: "Cu", hs: 0 });
  for (const [p, q] of OCTAHEDRON_EDGES) bonds.push({ a: p, b: q, order: 1 });
  for (let k = 0; k < 6; k++) {
    atoms.push({ el: "H", hs: 0 });
    bonds.push({ a: 6 + k, b: k, order: 1 }, { a: 6 + k, b: (k + 1) % 6, order: 1 });
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
  const centre = { x: [0, 1, 2, 3, 4, 5].reduce((t, i) => t + out.x[i], 0) / 6, y: [0, 1, 2, 3, 4, 5].reduce((t, i) => t + out.y[i], 0) / 6 };
  const fromCentre = (i: number) => Math.hypot(out.x[i] - centre.x, out.y[i] - centre.y);

  it("is drawn as the solid it is, seen down an axis its hydrides leave clear: a hexagon, a corner up", () => {
    const r = [0, 1, 2, 3, 4, 5].map(fromCentre);
    for (const v of r) expect(v / r[0]).toBeCloseTo(1, 1);
    expect([0, 1, 2, 3, 4, 5].some((i) => Math.abs(out.x[i] - centre.x) < 1e-6 && out.y[i] > centre.y)).toBe(true);
    // (its corners at their depths: an edge behind another is drawn broken there)
    for (let i = 0; i < 6; i++) expect(out.depth[i]).not.toBeNull();
    // and its metals' contacts dashed, as they are written
    expect(out.dashed).toHaveLength(12);
  });

  it("sets each hydride outside the edge it bridges, and each phosphine straight out", () => {
    for (let k = 0; k < 6; k++) {
      expect(fromCentre(6 + k)).toBeGreaterThan(Math.max(fromCentre(k), fromCentre((k + 1) % 6)) * Math.cos(Math.PI / 6));
      expect(fromCentre(12 + k)).toBeGreaterThan(fromCentre(k) + 0.8);
    }
  });

  it("puts no atom on another", () => {
    for (let i = 0; i < 18; i++) {
      for (let j = i + 1; j < 18; j++) {
        expect(Math.hypot(p(i).x - p(j).x, p(i).y - p(j).y)).toBeGreaterThan(0.6);
      }
    }
  });
});
