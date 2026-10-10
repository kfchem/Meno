/**
 * The last click on the drawing, as the browser counts it: 2 for the
 * second click of a double-click, reckoned by the system's own
 * double-click time (which the user may have set longer than any time the
 * drawing could assume). A click edits its atom's label a moment after it
 * unless the second click of a double-click has come since.
 */

let last = { detail: 0, at: Number.NEGATIVE_INFINITY };

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Notes a click: its `detail`, the count the browser gives it. */
export function noteClick(detail: number): void {
  last = { detail, at: now() };
}

/** Whether the second click of a double-click has come since `since` (a `performance.now()`). */
export function doubleClickedSince(since: number): boolean {
  return last.detail >= 2 && last.at >= since;
}

/** Now, as `doubleClickedSince` takes it. */
export function clickClock(): number {
  return now();
}

/** A press on empty space: when, and where in the window. */
export type EmptyPress = { t: number; x: number; y: number };

/**
 * Which press of a double-click a press on empty space is: the second, soon
 * after a first (within `within` ms) and near it (8 px); else a first - a
 * third among them too, since three on empty space ask for nothing two did
 * not (a chain is Quick Add's: the maintainer, 2026-10-10).
 */
export function pressOnEmpty(last: (EmptyPress & { count: number }) | null, press: EmptyPress, within: number): 1 | 2 {
  const near = !!last && press.t - last.t <= within && Math.hypot(press.x - last.x, press.y - last.y) < 8;
  return near && last!.count === 1 ? 2 : 1;
}
