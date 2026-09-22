import * as THREE from "three";
import type { Vec2 } from "../../../../lib/chem/layout2d";

/**
 * Triangle indices for a simple polygon. Wedge outlines are no longer
 * triangles: the wide end is cut, can be dented inwards where two bonds carry
 * on from it, and the corners are rounded.
 */
export function polyTriangles(points: Vec2[]): number[] {
  if (points.length < 3) return [];
  if (points.length === 3) return [0, 1, 2];
  const contour = points.map((p) => new THREE.Vector2(p.x, p.y));
  // indices into the contour, three per triangle
  return THREE.ShapeUtils.triangulateShape(contour, []).flat();
}
