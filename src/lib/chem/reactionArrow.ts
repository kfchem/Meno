import { bondFraction, type DrawingStyle, type Length } from "./style";

/**
 * How a reaction arrow is drawn: its line, and its head - a triangle, or
 * one whose back is drawn in towards its point - as one outline, so that
 * the canvas and the settings' preview draw the same arrow.
 */

type P = { x: number; y: number };

/** The settings a reaction arrow is drawn by; an arrow may set any of them for itself. */
export const ARROW_SETTINGS = [
  "reactionArrowThickness",
  "reactionArrowHeadLength",
  "reactionArrowHeadWidth",
  "reactionArrowHeadInset",
] as const satisfies readonly (keyof DrawingStyle)[];

export type ArrowSetting = (typeof ARROW_SETTINGS)[number];

/** What an arrow sets for itself, over the drawing style. */
export type ArrowLook = Partial<Pick<DrawingStyle, ArrowSetting>>;

/** A reaction arrow's measures, in the drawing's units. */
export type ArrowMeasures = {
  thickness: number;
  headLength: number;
  headWidth: number;
  /** How far the head's back is drawn in, as a fraction of its length. */
  inset: number;
  /** Whether its tail is round, as every end is in a style with round ends. */
  round: boolean;
};

/** The deepest the head's back is drawn in: further, and it is no head. */
const MAX_INSET = 0.9;

/** The measures `style` gives a reaction arrow, with a bond `bondLength` long in the drawing's units. */
export function arrowMeasures(style: DrawingStyle, bondLength: number): ArrowMeasures {
  const at = (l: Length) => bondFraction(l, style) * bondLength;
  return {
    thickness: at(style.reactionArrowThickness ?? style.lineThickness),
    headLength: at(style.reactionArrowHeadLength),
    headWidth: at(style.reactionArrowHeadWidth),
    inset: style.reactionArrowHeadInset,
    round: style.ends === "round",
  };
}

/**
 * The outline of a reaction arrow from `from` to its point at `to`,
 * anticlockwise: its line, ending inside the head, and the head. The head
 * is no narrower than the line and no longer than the arrow: on an arrow
 * shorter than its head, it is all head, with the line in its notch.
 */
export function arrowOutline(from: P, to: P, m: ArrowMeasures): P[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (!(len > 0)) return [];
  const u = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
  const n = { x: -u.y, y: u.x };
  // along the arrow from its tail, and across it to the left
  const at = (s: number, c: number): P => ({
    x: from.x + u.x * s + n.x * c,
    y: from.y + u.y * s + n.y * c,
  });
  const t = Math.max(0, m.thickness / 2);
  const h = Math.min(Math.max(0, m.headLength), len);
  const w = Math.max(m.headWidth / 2, t);
  const d = Math.min(Math.max(0, m.inset), MAX_INSET) * h;
  const back = len - h;
  // where the line meets the back of the head, on either side of it
  const join = back + (w > 0 ? d * (1 - t / w) : 0);
  const head = [at(back, -w), at(len, 0), at(back, w)];
  if (join <= 0 || t === 0) return d > 0 ? [...head, at(back + d, 0)] : head;
  const out: P[] = [at(0, -t), at(join, -t), ...head, at(join, t), at(0, t)];
  if (m.round) {
    // round about the tail, from its left side to its right
    for (let i = 1; i < 16; i++) {
      const a = Math.PI / 2 + (i / 16) * Math.PI;
      out.push(at(t * Math.cos(a), t * Math.sin(a)));
    }
  }
  return out;
}
