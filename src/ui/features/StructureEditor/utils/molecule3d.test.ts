import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import type { Molecule3D } from "../store/types";
import { footprint, frameOf, partOfFrame, rowAbout, solidOf, standingHeight, WORLD_PER_ANGSTROM } from "./molecule3d";

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

  it("covers more of the page than it would lying on it, being nearer the camera", () => {
    const m = ethane();
    const s = solidOf(m, STYLE_3D);
    const fp = footprint(m, s, undefined, new THREE.Vector3(0, 0, 60));
    const k = 60 / (60 - standingHeight(s));
    expect(fp.maxX).toBeCloseTo(s.reach * k, 6);
    expect(fp.minX).toBeCloseTo(-s.reach * k, 6);
    // turned a quarter about y, it is end on: as narrow as one atom
    const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const end = footprint(m, s, [quarter.x, quarter.y, quarter.z, quarter.w], new THREE.Vector3(0, 0, 60));
    expect(end.maxX - end.minX).toBeLessThan(fp.maxX - fp.minX);
  });
});

describe("its frame", () => {
  const frame = { minX: -10, minY: -5, maxX: 10, maxY: 5 };
  it("turns the molecule within, moves it on the edge, and is nothing outside", () => {
    const zoom = 10; // (the edge is 7 px either side: 0.7 world units)
    expect(partOfFrame(frame, 0, 0, zoom)).toBe("body");
    expect(partOfFrame(frame, 9, 0, zoom)).toBe("body");
    expect(partOfFrame(frame, 10, 0, zoom)).toBe("edge");
    expect(partOfFrame(frame, 9.5, 0, zoom)).toBe("edge");
    expect(partOfFrame(frame, 10.5, 0, zoom)).toBe("edge");
    expect(partOfFrame(frame, 11, 0, zoom)).toBeNull();
    expect(partOfFrame(frame, 10.6, 5.6, zoom)).toBeNull();
  });
  it("keeps room about the molecule, at least ten pixels", () => {
    const f = frameOf({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 1000);
    expect(f.minX).toBeCloseTo(-0.63, 6);
    expect(frameOf({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 1).minX).toBeCloseTo(-10, 6);
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
