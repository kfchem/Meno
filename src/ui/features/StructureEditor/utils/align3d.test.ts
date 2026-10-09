import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { turnAfter, turnOnto, turnOver } from "./align3d";

/** Points on the page, and the same points stood up in 3D by the turn `q` undone. */
function stoodUp(page: [number, number][], q: THREE.Quaternion) {
  const back = q.clone().invert();
  return page.flatMap(([x, y]) => new THREE.Vector3(x, y, 0).applyQuaternion(back).toArray());
}

describe("turnOnto", () => {
  const page: [number, number][] = [[0, 0], [1.5, 0.2], [2.4, 1.4], [1.1, 2.6], [-0.6, 1.9], [3.3, -0.8]];

  it("finds the turn that lays flat points back on the page, wherever they were", () => {
    for (const axis of [new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-2, 0.5, 1)]) {
      const q = new THREE.Quaternion().setFromAxisAngle(axis.normalize(), 2.1);
      const from = stoodUp(page, q);
      const t = new THREE.Quaternion(...turnOnto(from, page.flat()));
      for (let i = 0; i < page.length; i++) {
        const p = new THREE.Vector3(from[3 * i], from[3 * i + 1], from[3 * i + 2]).applyQuaternion(t);
        expect(p.x).toBeCloseTo(page[i][0], 6);
        expect(p.y).toBeCloseTo(page[i][1], 6);
        expect(p.z).toBeCloseTo(0, 6);
      }
    }
  });

  it("lays a puckered set as near the page's points as a turn can, the same turn each time", () => {
    const from = stoodUp(page, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.7));
    // (lifted off the page, alternately up and down)
    for (let i = 0; i < page.length; i++) from[3 * i + 2] += i % 2 ? 0.4 : -0.4;
    const t = turnOnto(from, page.flat());
    expect(turnOnto(from, page.flat())).toEqual(t);
    const q = new THREE.Quaternion(...t);
    let err = 0;
    for (let i = 0; i < page.length; i++) {
      const p = new THREE.Vector3(from[3 * i], from[3 * i + 1], from[3 * i + 2]).applyQuaternion(q);
      err += (p.x - page[i][0]) ** 2 + (p.y - page[i][1]) ** 2;
    }
    expect(Math.sqrt(err / page.length)).toBeLessThan(0.45);
  });

  it("leaves one point, or none, as it is", () => {
    expect(turnOnto([1, 2, 3], [0, 0])).toEqual([0, 0, 0, 1]);
  });
});

describe("turnOver", () => {
  // (methanol, as a file gave it)
  const methanol = [-0.3706, -0.0212, -0.0012, 0.945, -0.3921, -0.3697, -0.4924, -0.1322, 1.0791, -1.0808, -0.6737, -0.5145, -0.5536, 1.0154, -0.2947, 1.5524, 0.2038, 0.101];
  const moved = (xyz: number[], q: THREE.Quaternion, by: THREE.Vector3) =>
    Array.from({ length: xyz.length / 3 }, (_, i) => new THREE.Vector3(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]).applyQuaternion(q).add(by).toArray()).flat();

  it("finds the turn that lays a molecule a program turned and moved back over it as it went in", () => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.3, -1, 0.6).normalize(), 2.7);
    // (as Gaussian gives it: turned to its principal axes, its centre moved)
    const out = moved(methanol, q, new THREE.Vector3(0.2, -0.1, 0.05));
    const t = new THREE.Quaternion(...turnOver(out, methanol));
    // (turned about their centres, the two lie on each other: each atom as far from the centre, in the same direction)
    const centre = (xyz: number[]) => [0, 1, 2].map((a) => xyz.filter((_, k) => k % 3 === a).reduce((s, v) => s + v, 0) / (xyz.length / 3));
    const [co, cm] = [centre(out), centre(methanol)];
    for (let i = 0; i < methanol.length / 3; i++) {
      const p = new THREE.Vector3(out[3 * i] - co[0], out[3 * i + 1] - co[1], out[3 * i + 2] - co[2]).applyQuaternion(t);
      expect(p.x).toBeCloseTo(methanol[3 * i] - cm[0], 6);
      expect(p.y).toBeCloseTo(methanol[3 * i + 1] - cm[1], 6);
      expect(p.z).toBeCloseTo(methanol[3 * i + 2] - cm[2], 6);
    }
  });

  it("leaves a molecule that went in and came back as it was as it is", () => {
    const [x, y, z, w] = turnOver(methanol, methanol);
    expect([x, y, z]).toEqual([expect.closeTo(0, 9), expect.closeTo(0, 9), expect.closeTo(0, 9)]);
    expect(w).toBeCloseTo(1, 9);
    expect(turnOver([1, 2, 3], [0, 0, 0])).toEqual([0, 0, 0, 1]);
  });
});

describe("turnAfter", () => {
  it("is the one turn that makes the first, then the other", () => {
    const first = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.8);
    const then = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 1).normalize(), -1.3);
    const both = new THREE.Quaternion(...turnAfter([then.x, then.y, then.z, then.w], [first.x, first.y, first.z, first.w]));
    const p = new THREE.Vector3(0.4, -1.2, 2);
    const a = p.clone().applyQuaternion(first).applyQuaternion(then);
    const b = p.clone().applyQuaternion(both);
    expect(b.distanceTo(a)).toBeLessThan(1e-12);
  });
});
