import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { dollyAt, dollyMatrix, RISE_END } from "./rise";
import { EYE_HEIGHT } from "./page";

describe("a molecule seen in perspective as it rises", () => {
  it("comes and goes with the rise, all of it halfway, easing at both ends", () => {
    const end = RISE_END * 1000;
    expect(dollyAt(0, [])).toBe(0);
    expect(dollyAt(-1, [0])).toBe(0);
    expect(dollyAt(end, [0])).toBe(0);
    expect(dollyAt(end / 2, [0])).toBeCloseTo(1);
    // (eased: barely begun at the start, as barely left at the end)
    expect(dollyAt(end * 0.02, [0])).toBeLessThan(0.01);
    expect(dollyAt(end * 0.98, [0])).toBeLessThan(0.01);
    // (several, staggered: from the first's start to the last's end)
    expect(dollyAt((end + 240) / 2, [0, 120, 240])).toBeCloseTo(1);
  });

  it("leaves the page as it was, and sees what stands above it larger and further out from under the eye", () => {
    const cam = new THREE.OrthographicCamera(-640, 640, 430, -430, 0.1, 2 * EYE_HEIGHT);
    cam.zoom = 32;
    cam.position.set(3, -2, EYE_HEIGHT);
    const m = dollyMatrix(cam, 1)!;
    for (const [x, y] of [[0, 0], [10, 5], [-15, 12]]) {
      const page = new THREE.Vector3(x, y, 0).applyMatrix4(m);
      expect(page.x).toBeCloseTo(x, 9);
      expect(page.y).toBeCloseTo(y, 9);
      expect(page.z).toBeCloseTo(0, 9);
    }
    // (5 units up, off to the right of the eye at (3, -2): further right, and above it no larger than up)
    const up = new THREE.Vector3(13, -2, 5).applyMatrix4(m);
    expect(up.x).toBeGreaterThan(13);
    expect(up.y).toBeCloseTo(-2, 9);
    // (straight under the eye: where it was)
    expect(new THREE.Vector3(3, -2, 5).applyMatrix4(m).x).toBeCloseTo(3, 9);
    // (nothing of it at all: as it is)
    expect(dollyMatrix(cam, 0)).toBeNull();
  });

  it("brings the eye no nearer the page than a view in perspective stands, zoomed in as far as may be", () => {
    const near = new THREE.OrthographicCamera(-640, 640, 430, -430, 0.1, 2 * EYE_HEIGHT);
    near.zoom = 200;
    const m = dollyMatrix(near, 1)!;
    // (10 up, 1 out: seen 60 / 50 as far out)
    expect(new THREE.Vector3(1, 0, 10).applyMatrix4(m).x).toBeCloseTo(60 / 50, 6);
  });
});
