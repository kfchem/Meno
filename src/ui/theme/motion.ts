/**
 * How things move in Meno. Nothing on screen changes at a jump: a highlight
 * eases in and out, a menu or a card comes and goes, the drawing and the view
 * go where they are sent rather than appear there. Short and understated, and
 * what belongs together moves together, in the same time and the same way.
 */

/** How long things take, in seconds. */
export const DURATION = {
  /** A colour, a highlight, a hover. */
  quick: 0.12,
  /** Something coming into view or going: a menu, a card, a mark. */
  base: 0.16,
  /** The drawing or the view going somewhere: a Clean-up, an undo, a fit. */
  move: 0.22,
} as const;

/** The easing of all of it: quick out of the start, settling gently (CSS's `--ease-meno`). */
export const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/** Time constants for following a moving target, in seconds. */
export const TAU = {
  quick: 0.05,
  move: 0.07,
} as const;

/** The spring of things that swell and settle: the 3D viewer's. */
export const SPRING = { stiffness: 150, damping: 15 } as const;

/** `current` one step `dt` (seconds) nearer `target`, following with time constant `tau`. */
export function follow(current: number, target: number, dt: number, tau: number): number {
  return target + (current - target) * Math.exp(-dt / tau);
}

/** The easing curve: cubic, out. */
export function easeOut(u: number): number {
  const t = Math.min(Math.max(u, 0), 1);
  return 1 - (1 - t) ** 3;
}

/** For motion's components: a fade, and a fade with a small rise, in `DURATION.base`. */
export const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DURATION.base, ease: EASE },
} as const;
export const RISE = {
  initial: { opacity: 0, y: 4, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 4, scale: 0.985 },
  transition: { duration: DURATION.base, ease: EASE },
} as const;
