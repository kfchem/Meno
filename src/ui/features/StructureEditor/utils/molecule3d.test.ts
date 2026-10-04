import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import type { Molecule3D } from "../store/types";
import {
  asSeen,
  atomAt,
  bondAt,
  bondLines,
  chosenPath,
  frameOf,
  onMolecule,
  pictureMarks,
  poseOf,
  ringsOf,
  rowAbout,
  seenBounds,
  seenOnPage,
  solidOf,
  standingHeight,
  turnedInPlane,
  turnedTogether,
  WORLD_PER_ANGSTROM,
  populations,
  type Turning3D,
} from "./molecule3d";
import type { SolidMark } from "../../../../lib/chem/layout2d";

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

  it("stands as high as a turn of several put it, where one did", () => {
    const m = ethane({ x: 0, y: 0, z: 7 } as Molecule3D["at"]);
    expect(poseOf(m, solidOf(m, STYLE_3D), "balls").height).toBe(7);
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

  it("reaches further out on the page seen from off to its side, as perspective has it", () => {
    const m = ethane({ x: 20, y: 0 });
    const pose = poseOf(m, solidOf(m, STYLE_3D), "balls");
    const above = seenBounds(pose, 60);
    const aside = seenBounds(pose, 60, { x: 0, y: 0 });
    // the same size seen straight on, but out from the eye by its height's share
    expect(aside.maxX - aside.minX).toBeCloseTo(above.maxX - above.minX, 6);
    expect((aside.minX + aside.maxX) / 2).toBeCloseTo(20 * (60 / (60 - pose.height)), 4);
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
  const zoom = 20; // (pixels per world unit)
  it("finds its rings", () => {
    expect(ringsOf(benzene()).map((r) => [...r].sort())).toEqual([[0, 1, 2, 3, 4, 5]]);
    expect(ringsOf(ethane())).toEqual([]);
  });

  it("is on it on an atom, on a bond, and within a ring", () => {
    const m = benzene();
    const pose = poseOf(m, solidOf(m, STYLE_3D), "balls");
    const seen = seenOnPage(pose, camera);
    const on = (x: number, y: number) => onMolecule(m, pose, camera, x, y, zoom, STYLE_3D.bondRadius);
    expect(on(seen[0].x, seen[0].y)).toBe(true);
    expect(on((seen[0].x + seen[1].x) / 2, (seen[0].y + seen[1].y) / 2)).toBe(true);
    expect(on(0, 0)).toBe(true);
  });

  it("is on it a few pixels outside its outline, and not beyond", () => {
    const m = benzene();
    const pose = poseOf(m, solidOf(m, STYLE_3D), "balls");
    const seen = seenOnPage(pose, camera);
    const on = (x: number, y: number) => onMolecule(m, pose, camera, x, y, zoom, STYLE_3D.bondRadius);
    const edge = seen[0].x + seen[0].r;
    expect(on(edge + 2 / zoom, 0)).toBe(true);
    expect(on(edge + 8 / zoom, 0)).toBe(false);
  });

  it("finds the bond under a point between two atoms, and none on an atom's ball or within the ring", () => {
    const m = benzene();
    const pose = poseOf(m, solidOf(m, STYLE_3D), "balls");
    const seen = seenOnPage(pose, camera);
    const mid = { x: (seen[0].x + seen[1].x) / 2, y: (seen[0].y + seen[1].y) / 2 };
    expect(bondAt(m, pose, camera, mid.x, mid.y, STYLE_3D.bondRadius)).toBe(0);
    expect(atomAt(pose, camera, mid.x, mid.y)).toBeNull();
    expect(bondAt(m, pose, camera, 0, 0, STYLE_3D.bondRadius)).toBeNull();
  });
});

describe("what is chosen in a molecule, measured", () => {
  // butane's four carbons in a row, bonds 0-1, 1-2, 2-3
  const butane = { bonds: [0, 1, 2].map((i) => ({ a1: i, a2: i + 1, order: 1 })) };
  it("is the atoms chosen, two to four, in the order chosen", () => {
    expect(chosenPath(butane, { atoms: [2, 0], bonds: [] })).toEqual([2, 0]);
    expect(chosenPath(butane, { atoms: [0], bonds: [] })).toBeNull();
  });

  it("is a bond's two atoms, two bonds' angle and three bonds' torsion, chosen in any order", () => {
    expect(chosenPath(butane, { atoms: [], bonds: [1] })).toEqual([1, 2]);
    expect(chosenPath(butane, { atoms: [], bonds: [1, 0] })).toEqual([0, 1, 2]);
    expect(chosenPath(butane, { atoms: [], bonds: [2, 0, 1] })).toEqual([0, 1, 2, 3]);
  });

  it("goes on from a bond to an atom bonded to its end, and is nothing for bonds or atoms apart", () => {
    expect(chosenPath(butane, { atoms: [3], bonds: [1] })).toEqual([1, 2, 3]);
    expect(chosenPath(butane, { atoms: [], bonds: [0, 2] })).toBeNull();
    expect(chosenPath(butane, { atoms: [3], bonds: [0] })).toBeNull();
  });
});

describe("molecules turned together, as one body", () => {
  const q = (x: number, y: number, z: number, angle: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z).normalize(), angle);
  const ms: Turning3D[] = [
    { id: 1, at: { x: -5, y: 0 }, standing: 2 },
    { id: 2, at: { x: 5, y: 1 }, standing: 3 },
    { id: 3, at: { x: 0, y: 6 }, standing: 2.5 },
  ];
  const where = (t: { at: { x: number; y: number; z?: number } }, standing: number) => new THREE.Vector3(t.at.x, t.at.y, t.at.z ?? standing);

  it("keeps how far each is from each other, and turns each with the whole", () => {
    const turn = q(1, 2, 0.5, 0.9);
    const out = turnedTogether(ms, turn);
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        const before = where(ms[i], ms[i].standing).distanceTo(where(ms[j], ms[j].standing));
        expect(where(out[i], 0).distanceTo(where(out[j], 0))).toBeCloseTo(before, 9);
      }
      expect(new THREE.Quaternion(...out[i].turn).angleTo(turn)).toBeCloseTo(0, 6);
    }
  });

  it("rests on the page: the lowest for its reach as high as it stands alone", () => {
    const out = turnedTogether(ms, q(1, 0, 0, 1.2));
    const above = out.map((t, i) => t.at.z - ms[i].standing);
    expect(Math.min(...above)).toBeCloseTo(0, 9);
    expect(above.every((h) => h >= -1e-9)).toBe(true);
    // not turned at all, they stand as they did
    const still = turnedTogether(ms, new THREE.Quaternion());
    still.forEach((t, i) => expect(t.at).toEqual({ x: ms[i].at.x, y: ms[i].at.y, z: ms[i].standing }));
  });

  it("turned a half about the upright, swaps sides and faces about", () => {
    const two: Turning3D[] = [
      { id: 1, at: { x: -5, y: 0 }, standing: 2 },
      { id: 2, at: { x: 5, y: 0 }, standing: 2 },
    ];
    const out = turnedTogether(two, q(0, 1, 0, Math.PI));
    expect(out[0].at.x).toBeCloseTo(5, 9);
    expect(out[1].at.x).toBeCloseTo(-5, 9);
  });

  it("with a drawing, turns in its plane about its middle, each as high as it was", () => {
    const out = turnedInPlane([{ id: 1, at: { x: 2, y: 0, z: 4 }, standing: 2 }], { x: 0, y: 0 }, Math.PI / 2);
    expect(out[0].at.x).toBeCloseTo(0, 9);
    expect(out[0].at.y).toBeCloseTo(2, 9);
    expect(out[0].at.z).toBe(4);
    expect(new THREE.Quaternion(...out[0].turn).angleTo(q(0, 0, 1, Math.PI / 2))).toBeCloseTo(0, 6);
  });

  it("keeps their heights apart in a file for another program", () => {
    const a = asSeen({ ...ethane({ x: 0, y: 0, z: 0 } as Molecule3D["at"]) }, undefined, 0, true);
    const b = asSeen({ ...ethane({ x: 0, y: 0, z: 3 * WORLD_PER_ANGSTROM } as Molecule3D["at"]) }, undefined, 0, true);
    expect(b[0].z - a[0].z).toBeCloseTo(3, 9);
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

describe("a molecule in 3D in a picture", () => {
  it("is balls and sticks from the back forward, the sticks cut back to their balls", () => {
    const m = { ...ethane({ x: 0, y: 0 }), atoms: [{ el: "C", x: 0, y: 0, z: 0 }, { el: "O", x: 1.5, y: 0, z: 1 }] };
    const marks = pictureMarks(m, STYLE_3D);
    expect(marks.map((x) => x.kind)).toEqual(["ball", "stick", "ball"]);
    const [far, stick, near] = marks as [Extract<SolidMark, { kind: "ball" }>, Extract<SolidMark, { kind: "stick" }>, Extract<SolidMark, { kind: "ball" }>];
    // the nearer is the O, larger as it is nearer
    expect(near.color).not.toBe(far.color);
    expect(stick.a.x).toBeGreaterThan(far.c.x);
    expect(stick.b.x).toBeLessThan(near.c.x);
  });

  it("is balls alone, space-filling", () => {
    const marks = pictureMarks({ ...ethane(), look: "space" }, STYLE_3D);
    expect(marks.every((x) => x.kind === "ball")).toBe(true);
  });
});

describe("populations", () => {
  const HARTREE = 627.509474;
  it("shares a conformer set by Boltzmann at room temperature, adding up to one", () => {
    expect(populations([0, 0])).toEqual([0.5, 0.5]);
    // 1.364 kcal/mol above: a tenth as much, at 298 K
    const [low, high] = populations([-0.5, -0.5 + 1.3642 / HARTREE]);
    expect(low / high).toBeCloseTo(10, 1);
    expect(low + high).toBeCloseTo(1, 12);
    expect(populations([])).toEqual([]);
  });
});
