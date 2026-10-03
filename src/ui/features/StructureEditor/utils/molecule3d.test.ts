import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import type { Molecule3D } from "../store/types";
import { atomAt, bondLines, frameOf, partAt, poseOf, ringsOf, rowAbout, seenOnPage, solidOf, standingHeight, WORLD_PER_ANGSTROM } from "./molecule3d";

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
    expect(Array.from(s.frames[0])).toEqual([-0.75 * WORLD_PER_ANGSTROM, 0, 0, 0.75 * WORLD_PER_ANGSTROM, 0, 0].map((v) => expect.closeTo(v, 6)));
    // a carbon's ball: a fifth of its van der Waals radius (1.7 Å); space-filling, all of it
    expect(s.radii.balls[0]).toBeCloseTo(0.34 * WORLD_PER_ANGSTROM, 6);
    expect(s.radii.space[0]).toBeCloseTo(1.7 * WORLD_PER_ANGSTROM, 6);
    expect(s.reach.balls).toBeCloseTo((0.75 + 0.34) * WORLD_PER_ANGSTROM, 6);
    expect(s.reach.space).toBeCloseTo((0.75 + 1.7) * WORLD_PER_ANGSTROM, 6);
  });

  it("stands as high as it reaches, so that no turn takes it behind the page", () => {
    const s = solidOf(ethane(), STYLE_3D);
    expect(standingHeight(s)).toBeCloseTo(s.reach.balls, 9);
    expect(standingHeight(s, "space")).toBeCloseTo(s.reach.space, 9);
  });

  it("is seen larger than it would be lying on the page, being nearer the camera", () => {
    const m = ethane();
    const s = solidOf(m, STYLE_3D);
    const seen = seenOnPage(poseOf(m, s, "balls"), new THREE.Vector3(0, 0, 60));
    const k = 60 / (60 - standingHeight(s));
    expect(seen[1].x).toBeCloseTo(0.75 * WORLD_PER_ANGSTROM * k, 6);
    expect(seen[1].r).toBeCloseTo(s.radii.balls[1] * k, 6);
    // turned a quarter about y, it is end on: one atom over the other
    const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const end = seenOnPage(poseOf(m, s, "balls", [quarter.x, quarter.y, quarter.z, quarter.w]), new THREE.Vector3(0, 0, 60));
    expect(end[0].x).toBeCloseTo(0, 6);
    expect(end[1].x).toBeCloseTo(0, 6);
    // and the nearer of the two is the one seen there
    expect(atomAt(poseOf(m, s, "balls", [quarter.x, quarter.y, quarter.z, quarter.w]), new THREE.Vector3(0, 0, 60), 0, 0)).toBe(end[0].z > end[1].z ? 0 : 1);
  });

  it("has its frames, each about its own centre, and reaches as far as any of them", () => {
    // (the second frame stretched, and moved: its centre is its own)
    const m = { ...ethane(), frames: [[0, 0, 0, 3, 0, 0], [1, 2]] };
    const s = solidOf(m, STYLE_3D);
    expect(s.frames).toHaveLength(2);
    expect(s.frames[1][0]).toBeCloseTo(-1.5 * WORLD_PER_ANGSTROM, 6);
    expect(s.reach.balls).toBeCloseTo((1.5 + 0.34) * WORLD_PER_ANGSTROM, 6);
    expect([frameOf(s, undefined), frameOf(s, 1), frameOf(s, 7), frameOf(s, -1)]).toEqual([0, 1, 1, 0]);
  });
});

describe("a molecule's bonds in 3D", () => {
  /** Ethene, flat in the xy plane, with its hydrogens. */
  const ethene = (): Molecule3D => ({
    id: 3,
    atoms: [
      { el: "C", x: 0, y: 0, z: 0 },
      { el: "C", x: 1.34, y: 0, z: 0 },
      { el: "H", x: -0.55, y: 0.95, z: 0 },
      { el: "H", x: 1.89, y: 0.95, z: 0 },
    ],
    bonds: [
      { a1: 0, a2: 1, order: 2 },
      { a1: 0, a2: 2, order: 1 },
      { a1: 1, a2: 3, order: 1 },
    ],
    at: { x: 0, y: 0 },
  });

  it("draws a single bond as one line, a double as two thinner, side by side in the plane of its atoms", () => {
    const m = ethene();
    const lines = bondLines(m, solidOf(m, STYLE_3D).frames[0], 0.1);
    expect(lines).toHaveLength(4);
    const [d1, d2] = lines;
    expect(d1.r).toBeLessThan(0.1);
    // apart across the bond, in the molecule's plane (z = 0)
    expect(Math.abs(d1.a.y - d2.a.y)).toBeGreaterThan(0.1);
    expect(d1.a.z).toBeCloseTo(0, 6);
    expect(d2.b.z).toBeCloseTo(0, 6);
  });

  it("draws a triple bond as three, about its axis", () => {
    const m: Molecule3D = {
      id: 4,
      atoms: [
        { el: "C", x: 0, y: 0, z: 0 },
        { el: "N", x: 1.16, y: 0, z: 0 },
      ],
      bonds: [{ a1: 0, a2: 1, order: 3 }],
      at: { x: 0, y: 0 },
    };
    const lines = bondLines(m, solidOf(m, STYLE_3D).frames[0], 0.1);
    expect(lines).toHaveLength(3);
    expect(lines[1].a.distanceTo(new THREE.Vector3(-0.58 * WORLD_PER_ANGSTROM, 0, 0))).toBeCloseTo(0, 6);
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
    const pose = poseOf(m, solidOf(m, STYLE_3D), "balls");
    const seen = seenOnPage(pose, camera);
    const at = (x: number, y: number) => partAt(m, pose, camera, x, y, zoom, STYLE_3D.bondRadius);
    expect(at(seen[0].x, seen[0].y)).toBe("body");
    expect(at((seen[0].x + seen[1].x) / 2, (seen[0].y + seen[1].y) / 2)).toBe("body");
    expect(at(0, 0)).toBe("body");
  });

  it("moves it on the rim just outside its outline, and is nothing beyond", () => {
    const m = benzene();
    const pose = poseOf(m, solidOf(m, STYLE_3D), "balls");
    const seen = seenOnPage(pose, camera);
    const at = (x: number, y: number) => partAt(m, pose, camera, x, y, zoom, STYLE_3D.bondRadius);
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
