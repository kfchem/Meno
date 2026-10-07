/**
 * A molecule rising out of its drawing, in seconds from when it began: its
 * atoms grow out of the drawing's, where they lie on the page, and go over
 * to their places in 3D as it comes up off the page; then it goes over to
 * rest beside the drawing (components/Molecule3DView). As it rises it is
 * seen in perspective for a moment, and back (`dollyMatrix`).
 */
import * as THREE from "three";
import { PAGE_DISTANCE } from "./page";

export const RISE_GROW = 0.3;
export const RISE_UP = 0.6;
export const RISE_ACROSS_FROM = 0.45;
export const RISE_END = 1.15;

/**
 * The widest the angle a rising molecule is seen at opens, in degrees: at
 * the middle of its rise - unless that would bring the eye nearer the page
 * than a view in perspective stands (`PAGE_DISTANCE`), where a molecule
 * standing up off it would be seen far larger than it is.
 */
export const DOLLY_FOV = 40;

/**
 * How far a rising molecule is seen in perspective, 0 to 1, at `now` (ms,
 * as `performance.now()`), its rise begun at `starts` (or, for several,
 * the first of them): none before it begins and once it is up, all of it
 * halfway, easing in and out so that it neither sets off nor stops at a
 * jump.
 */
export function dollyAt(now: number, starts: readonly number[]): number {
  if (!starts.length) return 0;
  const from = Math.min(...starts);
  const to = Math.max(...starts) + RISE_END * 1000;
  const u = (now - from) / (to - from);
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(Math.PI * u) ** 2;
}

/**
 * What a rising molecule is drawn through - `amount` of the way to its
 * widest angle - for it alone to be seen in perspective by the view's
 * orthographic camera: each point `z` above the page seen out from under
 * the eye, d / (d - z) times as far, where d is how far an eye seeing the
 * view's page at that angle would stand; the page itself, z = 0, as it
 * was (a dolly zoom). As a matrix that divides by 1 - z / d, the
 * orthographic projection after it does the rest. None where `amount` is
 * nothing.
 */
export function dollyMatrix(
  view: { position: { x: number; y: number }; left: number; right: number; top: number; bottom: number; zoom: number },
  amount: number,
): THREE.Matrix4 | null {
  if (amount <= 1e-4) return null;
  const halfH = (view.top - view.bottom) / (2 * view.zoom);
  // (the angle at the middle of the rise: DOLLY_FOV, or narrower, the eye no nearer than PAGE_DISTANCE)
  const widest = Math.min((DOLLY_FOV / 180) * Math.PI, 2 * Math.atan(halfH / PAGE_DISTANCE));
  const d = halfH / Math.tan((widest * amount) / 2);
  // (under the eye: the middle of the view)
  const ex = view.position.x + (view.left + view.right) / (2 * view.zoom);
  const ey = view.position.y + (view.top + view.bottom) / (2 * view.zoom);
  const seen = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1 / d, 1);
  return new THREE.Matrix4()
    .makeTranslation(ex, ey, 0)
    .multiply(seen)
    .multiply(new THREE.Matrix4().makeTranslation(-ex, -ey, 0));
}
