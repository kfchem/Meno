import type { LayoutOptions } from "./layout2d";

/**
 * How a structure is drawn: every width, spacing and size the depiction
 * uses, in one place, as settings rather than as constants.
 *
 * A length can be given in points or as a fraction of the bond length,
 * whichever reads better for it - a line width is naturally "0.6 pt", a
 * double bond's spacing "18% of the bond". The bond length itself is in
 * points; it is what every fraction is a fraction of.
 *
 * Styles layer: an application default, a document's own style over it, and
 * later an atom's or a bond's over that. `resolveStyle` lays them on top of
 * one another.
 */

export type LengthUnit = "pt" | "bond";

/** A length in points, or as a fraction of the bond length. */
export type Length = { value: number; unit: LengthUnit };

export const pt = (value: number): Length => ({ value, unit: "pt" });
export const ofBond = (value: number): Length => ({ value, unit: "bond" });

export type DrawingStyle = {
  /** Bond length, in points. Every "bond" length is a fraction of it. */
  bondLengthPt: number;
  lineWidth: Length;
  /** A bold bond's width, once there are any. */
  boldWidth: Length;
  /**
   * A wedge's broad end. Left unset, it is one and a half bold widths, and
   * follows the bold width when that changes.
   */
  wedgeWidth?: Length;
  /** Between the lines of a double or triple bond, centre to centre. */
  bondSpacing: Length;
  /** How far the inner line of a double bond stops short of each end. */
  innerLineShortening: Length;
  /** Between the hashes of a hashed wedge. */
  hashSpacing: Length;
  /** How far a wavy bond swings either side of its line. */
  wavyAmplitude: Length;
  /** One whole wave of a wavy bond. */
  wavyPeriod: Length;
  /** The size of an atom label. */
  fontSize: Length;
  /**
   * How lines end and meet: round everywhere, or square everywhere. Never a
   * mixture - a picture with round single bonds and square double ones looks
   * like two drawings.
   */
  ends: "round" | "square";
};

/**
 * The ACS 1996 document settings: 14.4 pt bonds, 0.6 pt lines, 2.0 pt bold
 * width, 18% bond spacing, 2.5 pt hash spacing, 10 pt labels. A wedge drawn
 * to them is 3.0 pt at its broad end, one and a half bold widths - measured
 * off a reference drawing, whose wedge this matches to half a pixel along its
 * length.
 *
 * ACS says nothing about how far a double bond's inner line is shortened or
 * how a wavy bond waves; those keep the values this app has drawn with.
 */
export const ACS_1996: DrawingStyle = {
  bondLengthPt: 14.4,
  lineWidth: pt(0.6),
  boldWidth: pt(2.0),
  bondSpacing: ofBond(0.18),
  innerLineShortening: ofBond(0.1),
  hashSpacing: pt(2.5),
  wavyAmplitude: ofBond(0.07),
  wavyPeriod: ofBond(1 / 1.4),
  fontSize: pt(10),
  ends: "round",
};

/** A wedge's broad end: as set, or one and a half bold widths. */
export function wedgeWidthOf(style: DrawingStyle): Length {
  if (style.wedgeWidth) return style.wedgeWidth;
  const bold = style.boldWidth;
  return { value: bold.value * 1.5, unit: bold.unit };
}

/** A length as a fraction of the style's bond length. */
export function bondFraction(length: Length, style: DrawingStyle): number {
  return length.unit === "bond" ? length.value : length.value / style.bondLengthPt;
}

/** A length in points. */
export function inPoints(length: Length, style: DrawingStyle): number {
  return length.unit === "pt" ? length.value : length.value * style.bondLengthPt;
}

/** `base` with each layer's settings laid over it, the last on top. */
export function resolveStyle(
  base: DrawingStyle,
  ...layers: (Partial<DrawingStyle> | undefined)[]
): DrawingStyle {
  let out = base;
  for (const layer of layers) {
    if (!layer) continue;
    const defined = Object.fromEntries(
      Object.entries(layer).filter(([, v]) => v !== undefined),
    ) as Partial<DrawingStyle>;
    out = { ...out, ...defined };
  }
  return out;
}

/**
 * Layout options that draw in `style`, with a bond `bondLength` long in
 * whatever units the drawing uses - the editor's world units by default.
 */
export function layoutOptionsFor(
  style: DrawingStyle,
  bondLength: number,
  over?: Partial<LayoutOptions>,
): LayoutOptions {
  const L = bondLength;
  const at = (length: Length) => bondFraction(length, style) * L;
  const options: LayoutOptions = {
    lineWidthPx: at(style.lineWidth),
    doubleOffsetPx: at(style.bondSpacing),
    doubleShortenPx: at(style.innerLineShortening),
    // A triple bond's outer lines sit one bond spacing either side.
    tripleOffsetPx: at(style.bondSpacing),
    wedgeWidthPx: at(wedgeWidthOf(style)),
    // Hashes as many as the spacing fits along a bond of the nominal length.
    // The count is fixed per bond until the layout places them by spacing.
    hashCount: Math.max(3, Math.round(1 / bondFraction(style.hashSpacing, style)) + 1),
    wavyAmpPx: at(style.wavyAmplitude),
    wavyFreq: 1 / bondFraction(style.wavyPeriod, style),
    fontPx: at(style.fontSize),
    paddingPx: 48,
    showCarbonLabels: false,
    units: "world",
    minLinePx: 1,
    joinStyle: style.ends === "round" ? "round" : "sharp",
  };
  return { ...options, ...(over ?? {}) };
}
