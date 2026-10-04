import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { turnOnto } from "./align3d";

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
