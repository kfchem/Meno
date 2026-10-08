import { describe, expect, it } from "vitest";
import { eigenvalues, rmsd } from "./rmsd";

// four atoms, not in a plane
const water = [0, 0, 0, 0.96, 0, 0, -0.24, 0.93, 0, 0.3, 0.2, 0.8];

/** `xyz` turned by `angle` about the axis (1, 1, 1), and moved by (5, -2, 3). */
function turned(xyz: readonly number[], angle: number): number[] {
  const k = [1, 1, 1].map((v) => v / Math.sqrt(3));
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out: number[] = [];
  for (let i = 0; i < xyz.length; i += 3) {
    const v = [xyz[i], xyz[i + 1], xyz[i + 2]];
    const dot = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    const cross = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
    // Rodrigues' rotation
    for (let a = 0; a < 3; a++) out.push(v[a] * c + cross[a] * s + k[a] * dot * (1 - c) + [5, -2, 3][a]);
  }
  return out;
}

describe("rmsd", () => {
  it("is nought for a geometry and itself, moved and turned", () => {
    expect(rmsd(water, water)).toBeCloseTo(0, 6);
    expect(rmsd(water, turned(water, 1.1))).toBeCloseTo(0, 6);
    expect(rmsd(turned(water, -2.5), water)).toBeCloseTo(0, 6);
  });

  it("is the atoms' deviation where no turn brings them closer", () => {
    // two atoms each 0.1 out along the line between them: nothing turns that back
    const a = [0, 0, 0, 1, 0, 0];
    const b = [-0.1, 0, 0, 1.1, 0, 0];
    expect(rmsd(a, b)).toBeCloseTo(0.1, 6);
  });

  it("does not see symmetric atoms swapped", () => {
    const swapped = [water[3], water[4], water[5], water[0], water[1], water[2], ...water.slice(6)];
    expect(rmsd(water, swapped)).toBeGreaterThan(0.1);
  });
});

describe("eigenvalues", () => {
  it("are a diagonal matrix's diagonal, and a symmetric one's roots", () => {
    expect(eigenvalues([[3, 0], [0, -1]]).sort()).toEqual([-1, 3]);
    const got = eigenvalues([[2, 1], [1, 2]]).sort((p, q) => p - q);
    expect(got[0]).toBeCloseTo(1, 10);
    expect(got[1]).toBeCloseTo(3, 10);
  });
});
