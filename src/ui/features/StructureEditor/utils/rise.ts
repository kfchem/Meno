/**
 * A molecule rising out of its drawing, in seconds from when it began: its
 * atoms grow out of the drawing's, where they lie on the page, and go over
 * to their places in 3D as it comes up off the page; then it goes over to
 * rest beside the drawing (components/Molecule3DView). While any rises,
 * the view sees the page in perspective for a moment, and back
 * (components/DollyRise).
 */
import * as THREE from "three";
import { PAGE_DISTANCE } from "./page";

export const RISE_GROW = 0.3;
export const RISE_UP = 0.6;
export const RISE_ACROSS_FROM = 0.45;
export const RISE_END = 1.15;

/**
 * The widest the view's angle opens as molecules rise, in degrees: at the
 * middle of their rise - unless that would bring the camera nearer the page
 * than a view in perspective stands (`PAGE_DISTANCE`), where a molecule
 * standing up off it would be seen far larger than it is.
 */
export const DOLLY_FOV = 40;

/**
 * How far the view is in perspective, 0 to 1, at `now` (ms, as
 * `performance.now()`), with molecules rising that began at `starts`: none
 * before the first begins and once the last is up, all of it halfway,
 * easing in and out so that it neither sets off nor stops at a jump.
 */
export function dollyAt(now: number, starts: readonly number[]): number {
  if (!starts.length) return 0;
  const from = Math.min(...starts);
  const to = Math.max(...starts) + RISE_END * 1000;
  const u = (now - from) / (to - from);
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(Math.PI * u) ** 2;
}

/** How far a rise's depth reaches above and below the page, in world units: what the view's depth holds. */
const DEPTH = 500;

/**
 * An orthographic view's projection as one in perspective - `amount` of the
 * way to its widest angle - that sees the page, the plane z = 0, just as it did
 * (a dolly zoom): the camera, `eye` above the page, as if drawn back until
 * the page fills the same width at the wider angle. What stands above the
 * page is seen larger, and out from the middle; the drawing on it does not
 * move. None where `amount` is nothing.
 */
export function dollyProjection(
  view: { left: number; right: number; top: number; bottom: number; zoom: number },
  eye: number,
  amount: number,
): THREE.Matrix4 | null {
  if (amount <= 1e-4) return null;
  const halfW = (view.right - view.left) / (2 * view.zoom);
  const halfH = (view.top - view.bottom) / (2 * view.zoom);
  const midX = (view.right + view.left) / (2 * view.zoom);
  const midY = (view.top + view.bottom) / (2 * view.zoom);
  // (the angle at the middle of the rise: DOLLY_FOV, or narrower, the camera no nearer than PAGE_DISTANCE)
  const widest = Math.min((DOLLY_FOV / 180) * Math.PI, 2 * Math.atan(halfH / PAGE_DISTANCE));
  const d = halfH / Math.tan((widest * amount) / 2);
  const near = Math.max(1e-3, d - DEPTH);
  const far = d + DEPTH;
  const s = near / d;
  const persp = new THREE.Matrix4().makePerspective(
    (midX - halfW) * s,
    (midX + halfW) * s,
    (midY + halfH) * s,
    (midY - halfH) * s,
    near,
    far,
  );
  // (the page, `eye` before the camera, put `d` before it)
  return persp.multiply(new THREE.Matrix4().makeTranslation(0, 0, eye - d));
}
