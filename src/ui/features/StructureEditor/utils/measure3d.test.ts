import { describe, expect, it } from "vitest";
import { WORLD_PER_ANGSTROM } from "./molecule3d";
import { kindOf, measureMarks, measureText, measureValue } from "./measure3d";

/** Atoms' places in world units, from ångströms. */
const places = (...xyz: number[][]) => Float32Array.from(xyz.flat(), (v) => v * WORLD_PER_ANGSTROM);

describe("a measurement on a molecule in 3D", () => {
  it("is a distance, an angle or a torsion angle by how many atoms it takes", () => {
    expect([kindOf([0, 1]), kindOf([0, 1, 2]), kindOf([0, 1, 2, 3])]).toEqual(["distance", "angle", "torsion"]);
  });

  it("comes to the distance in ångströms", () => {
    expect(measureValue(places([0, 0, 0], [1.2, 0.9, 0]), [0, 1])).toBeCloseTo(1.5, 6);
  });

  it("comes to the angle at the middle atom", () => {
    expect(measureValue(places([1, 0, 0], [0, 0, 0], [0, 2, 0]), [0, 1, 2])).toBeCloseTo(90, 6);
    expect(measureValue(places([1, 0, 0], [0, 0, 0], [-1, 1, 0]), [0, 1, 2])).toBeCloseTo(135, 6);
  });

  it("comes to the torsion angle with IUPAC's sign: clockwise, looking along the middle bond, positive", () => {
    // looking from atom 1 to atom 2 (along +z), atom 0 up, atom 3 to the
    // viewer's right: a quarter clockwise
    const p = places([0, 1, 0], [0, 0, 0], [0, 0, 1.5], [-1, 0, 1.5]);
    expect(measureValue(p, [0, 1, 2, 3])).toBeCloseTo(90, 6);
    expect(measureValue(places([0, 1, 0], [0, 0, 0], [0, 0, 1.5], [1, 0, 1.5]), [0, 1, 2, 3])).toBeCloseTo(-90, 6);
    // anti, and the same read from the other end
    expect(Math.abs(measureValue(places([0, 1, 0], [0, 0, 0], [0, 0, 1.5], [0, -1, 1.5]), [0, 1, 2, 3]))).toBeCloseTo(180, 6);
    expect(measureValue(p, [3, 2, 1, 0])).toBeCloseTo(90, 6);
  });

  it("is written as a chemist writes it", () => {
    expect(measureText("distance", 1.5349)).toBe("1.53 Å");
    expect(measureText("angle", 109.47)).toBe("109.5°");
    expect(measureText("torsion", -60.24)).toBe("−60.2°");
    expect(measureText("torsion", -0.01)).toBe("0.0°");
  });

  it("is shown by a dashed line for a distance, its value at the middle", () => {
    const marks = measureMarks(places([0, 0, 0], [1.5, 0, 0]), [0, 1]);
    expect(marks.dashed).toBe(true);
    expect(marks.lines).toHaveLength(2);
    expect(marks.label.x).toBeCloseTo(0.75 * WORLD_PER_ANGSTROM, 6);
  });

  it("is shown by an arc between the bonds for an angle, the value beyond its middle", () => {
    const marks = measureMarks(places([1, 0, 0], [0, 0, 0], [0, 1, 0]), [0, 1, 2]);
    expect(marks.dashed).toBe(false);
    // the arc's ends on the two bonds, the same way out
    const first = marks.lines[0];
    const last = marks.lines[marks.lines.length - 1];
    expect(first.y).toBeCloseTo(0, 6);
    expect(last.x).toBeCloseTo(0, 6);
    expect(first.length()).toBeCloseTo(last.length(), 6);
    expect(marks.label.x).toBeCloseTo(marks.label.y, 6);
    expect(marks.label.length()).toBeGreaterThan(first.length());
    expect(marks.fan.length % 3).toBe(0);
  });

  it("is shown about the middle bond for a torsion angle, square to it", () => {
    const marks = measureMarks(places([0, 1, 0], [0, 0, 0], [0, 0, 1.5], [-1, 0, 1.5]), [0, 1, 2, 3]);
    for (const p of marks.lines) expect(p.z).toBeCloseTo(0.75 * WORLD_PER_ANGSTROM, 6);
  });
});
