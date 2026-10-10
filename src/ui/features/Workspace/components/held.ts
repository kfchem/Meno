/** How quickly the light of a thing let go goes, in ms (HeldLight). */
export const HELD_FADE_MS = 140;

/** A thing on the page taken hold of by a press held on it: since when, whether it has been, and when it was let go. */
export type Held = { start: number; done?: boolean; let?: number };

/** Whether a hold's light is still to be drawn: held, or going. */
export const heldShows = (held: Held, now: number) => held.let == null || now - held.let < HELD_FADE_MS + 80;
