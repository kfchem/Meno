import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { dollyAt, dollyProjection, RISE_END } from "./rise";
import { EYE_HEIGHT } from "./page";

describe("the page seen in perspective as molecules rise", () => {
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

  it("sees the page as the orthographic view did, and what stands above it larger and further out", () => {
    const cam = new THREE.OrthographicCamera(-640, 640, 430, -430, 0.1, 2 * EYE_HEIGHT);
    cam.zoom = 32;
    cam.position.set(3, -2, EYE_HEIGHT);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const ndc = (p: THREE.Vector3, m: THREE.Matrix4) => p.clone().applyMatrix4(cam.matrixWorldInverse).applyMatrix4(m);
    const m = dollyProjection(cam, EYE_HEIGHT, 1)!;
    for (const [x, y] of [[0, 0], [10, 5], [-15, 12]]) {
      const page = new THREE.Vector3(x, y, 0);
      const a = ndc(page, cam.projectionMatrix);
      const b = ndc(page, m);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.y).toBeCloseTo(a.y, 6);
      expect(Math.abs(b.z)).toBeLessThan(1);
    }
    // (5 units up, away from the middle: seen further out than straight below it)
    const up = ndc(new THREE.Vector3(13, 3, 5), m);
    const below = ndc(new THREE.Vector3(13, 3, 0), m);
    expect(up.x).toBeGreaterThan(below.x);
    expect(up.y).toBeGreaterThan(below.y);
    // (zoomed in, the camera comes no nearer the page than a view in perspective stands: 60)
    const near = new THREE.OrthographicCamera(-640, 640, 430, -430, 0.1, 2 * EYE_HEIGHT);
    near.zoom = 200;
    near.position.set(0, 0, EYE_HEIGHT);
    near.updateProjectionMatrix();
    near.updateMatrixWorld();
    const n = dollyProjection(near, EYE_HEIGHT, 1)!;
    const seen = (z: number) => new THREE.Vector3(1, 0, z).applyMatrix4(near.matrixWorldInverse).applyMatrix4(n).x;
    expect(seen(10) / seen(0)).toBeCloseTo(60 / 50, 3);
    // (nothing of it at all: the orthographic view as it is)
    expect(dollyProjection(cam, EYE_HEIGHT, 0)).toBeNull();
  });
});
