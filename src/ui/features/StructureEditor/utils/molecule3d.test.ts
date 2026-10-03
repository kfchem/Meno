import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import type { Molecule3D } from "../store/types";
import { partAt, ringsOf, rowAbout, seenOnPage, solidOf, standingHeight, WORLD_PER_ANGSTROM } from "./molecule3d";

/** Two carbons 1.5 Å apart along x, standing at `at`. */
const ethane = (at = { x: 0, y: 0 }): Molecule3D => ({
  id: 1,
  atoms: [
    { el: "C", x: 10, y: 5, z: 1 },
    { el: "C", x: 11.5, y: 5, z: 1 },
  ],
  bonds: [{ a1: 0, a2: 1, order: 1 }],
  at,
});

describe("a molecule in 3D as it is drawn", () => {
  it("is laid about its centre, a bond of 1.5 Å as long as a drawn one", () => {
    const s = solidOf(ethane(), STYLE_3D);
    expect(Array.from(s.local)).toEqual([-0.75 * WORLD_PER_ANGSTROM, 0, 0, 0.75 * WORLD_PER_ANGSTROM, 0, 0].map((v) => expect.closeTo(v, 6)));
    // a carbon's ball: a fifth of its van der Waals radius (1.7 Å)
    expect(s.radii[0]).toBeCloseTo(0.34 * WORLD_PER_ANGSTROM, 6);
    expect(s.reach).toBeCloseTo((0.75 + 0.34) * WORLD_PER_ANGSTROM, 6);
  });

  it("stands as high as it reaches, so that no turn takes it behind the page", () => {
    const s = solidOf(ethane(), STYLE_3D);
    expect(standingHeight(s)).toBeCloseTo(s.reach, 9);
  });

  it("is seen larger than it would be lying on the page, being nearer the camera", () => {
    const m = ethane();
    const s = solidOf(m, STYLE_3D);
    const seen = seenOnPage(m, s, undefined, new THREE.Vector3(0, 0, 60));
    const k = 60 / (60 - standingHeight(s));
    expect(seen[1].x).toBeCloseTo(0.75 * WORLD_PER_ANGSTROM * k, 6);
    expect(seen[1].r).toBeCloseTo(s.radii[1] * k, 6);
    // turned a quarter about y, it is end on: one atom over the other
    const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const end = seenOnPage(m, s, [quarter.x, quarter.y, quarter.z, quarter.w], new THREE.Vector3(0, 0, 60));
    expect(end[0].x).toBeCloseTo(0, 6);
    expect(end[1].x).toBeCloseTo(0, 6);
  });
});

/** Benzene's six carbons, flat, 1.4 Å apart, standing at the origin. */
const benzene = (): Molecule3D => ({
  id: 2,
  atoms: Array.from({ length: 6 }, (_, i) => ({
    el: "C",
    x: 1.4 * Math.cos((i * Math.PI) / 3),
    y: 1.4 * Math.sin((i * Math.PI) / 3),
    z: 0,
  })),
  bonds: Array.from({ length: 6 }, (_, i) => ({ a1: i, a2: (i + 1) % 6, order: 1 })),
  at: { x: 0, y: 0 },
});

describe("what a point is to a molecule in 3D", () => {
  const camera = new THREE.Vector3(0, 0, 60);
  const zoom = 20; // (pixels per world unit: the rim is 9 px wide, 0.45 world units)
  it("finds its rings", () => {
    expect(ringsOf(benzene()).map((r) => [...r].sort())).toEqual([[0, 1, 2, 3, 4, 5]]);
    expect(ringsOf(ethane())).toEqual([]);
  });

  it("turns it on an atom, on a bond, and within a ring", () => {
    const m = benzene();
    const s = solidOf(m, STYLE_3D);
    const seen = seenOnPage(m, s, undefined, camera);
    const at = (x: number, y: number) => partAt(m, s, undefined, camera, x, y, zoom, STYLE_3D.bondRadius);
    expect(at(seen[0].x, seen[0].y)).toBe("body");
    expect(at((seen[0].x + seen[1].x) / 2, (seen[0].y + seen[1].y) / 2)).toBe("body");
    expect(at(0, 0)).toBe("body");
  });

  it("moves it on the rim just outside its outline, and is nothing beyond", () => {
    const m = benzene();
    const s = solidOf(m, STYLE_3D);
    const seen = seenOnPage(m, s, undefined, camera);
    const at = (x: number, y: number) => partAt(m, s, undefined, camera, x, y, zoom, STYLE_3D.bondRadius);
    const edge = seen[0].x + seen[0].r;
    expect(at(edge + 2 / zoom, 0)).toBe("body");
    expect(at(edge + 8 / zoom, 0)).toBe("rim");
    expect(at(edge + 20 / zoom, 0)).toBeNull();
  });
});

describe("molecules placed in a row", () => {
  it("stand about the point, each clear of the next by a bond", () => {
    const at = rowAbout({ x: 0, y: 2 }, [3, 1]);
    expect(at).toEqual([
      // (9.8 wide in all: 6 and 2 across, and a bond, 1.8, between)
      { x: expect.closeTo(-1.9, 6), y: 2 },
      { x: expect.closeTo(3.9, 6), y: 2 },
    ]);
  });
});
