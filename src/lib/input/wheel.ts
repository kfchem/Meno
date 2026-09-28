/**
 * What a wheel event asks of a view: to zoom - a mouse wheel, or a pinch -
 * or to move - two fingers on a trackpad. Browsers deliver all of them as
 * the same event, so the fingers are told by the signs they leave: movement
 * sideways, fractions, small first steps. A mouse wheel moves in notches, a
 * pinch comes with Ctrl held (Chromium, on Windows too), and a wheel scrolled
 * a line at a time says so.
 *
 * The first event of a run decides, and the rest of the run goes the same
 * way, so a stroke of the fingers or a spin of the wheel is never read as
 * half one and half the other.
 */

export type WheelIntent = "zoom" | "pan";

export type WheelLike = {
  deltaX: number;
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages. */
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey?: boolean;
  timeStamp: number;
};

/** How long a pause ends a run of wheel events. */
const RUN_MS = 250;

/**
 * A mouse wheel's first step is a notch: 40 px or more for a plain wheel
 * (WebKit, macOS), 100 px in Chromium on Windows, and 13 px for a mouse
 * scrolling smoothly - a Logitech MX Master 3S on macOS, measured on the
 * maintainer's machine, 13 for one notch and about 100 spun fast. Fingers
 * on a trackpad begin with a step of 1 or 2 px, however fast the stroke.
 */
const NOTCH_PX = 8;

/** Whether an event, the first of its run, looks like fingers on a trackpad. */
export function looksLikeFingers(e: WheelLike): boolean {
  if (e.deltaMode !== 0) return false; // lines or pages: a wheel
  if (e.deltaX !== 0 && !e.shiftKey) return true; // sideways: fingers
  // (with Shift, Windows turns a wheel's notch sideways)
  if (!Number.isInteger(e.deltaX) || !Number.isInteger(e.deltaY)) return true;
  return Math.max(Math.abs(e.deltaX), Math.abs(e.deltaY)) < NOTCH_PX;
}

/** A reader of wheel events for one view, remembering the run it is in. */
export function wheelReader(): (e: WheelLike) => WheelIntent {
  let run: { intent: WheelIntent; at: number } | null = null;
  return (e) => {
    if (e.ctrlKey) {
      run = null;
      return "zoom"; // a pinch, or Ctrl with the wheel
    }
    const going = run !== null && e.timeStamp - run.at < RUN_MS;
    const intent: WheelIntent = going
      ? run!.intent
      : looksLikeFingers(e)
        ? "pan"
        : "zoom";
    run = { intent, at: e.timeStamp };
    return intent;
  };
}
