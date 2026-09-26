import type { LayoutOptions } from "./layout2d";

/**
 * How a structure is drawn: every width, spacing, size, angle and colour the
 * depiction uses, in one place, as settings rather than as constants.
 *
 * A length can be given in points or as a fraction of the bond length,
 * whichever reads better for it - a line width is naturally "0.6 pt", a
 * double bond's spacing "18% of the bond". The bond length itself is in
 * points; it is what every fraction is a fraction of. What belongs to a
 * label - where its baseline sits, how big a subscript is - is a fraction of
 * the label's font size, and an angle is in degrees.
 *
 * Styles layer: a preset (ACS 1996, RSC, ...), an application default over
 * it, a document's own over that, and later an atom's or a bond's.
 * `resolveStyle` lays them on top of one another. What each setting means,
 * in words, is in `styleFields.ts`.
 */

export type LengthUnit = "pt" | "bond";

/** A length in points, or as a fraction of the bond length. */
export type Length = { value: number; unit: LengthUnit };

export const pt = (value: number): Length => ({ value, unit: "pt" });
export const ofBond = (value: number): Length => ({ value, unit: "bond" });

export type DrawingStyle = {
  // --- Size ---------------------------------------------------------------
  /** Bond length, in points. Every "bond" length is a fraction of it. */
  bondLengthPt: number;

  // --- Lines --------------------------------------------------------------
  lineWidth: Length;
  /**
   * How lines end and meet: round everywhere, or square everywhere. Never a
   * mixture - a picture with round single bonds and square double ones looks
   * like two drawings.
   */
  ends: "round" | "square";
  /** The colour bonds are drawn in, as CSS: "#000000". */
  bondColor: string;

  // --- Double and triple bonds -------------------------------------------
  /** Between the lines of a double bond, centre to centre. */
  bondSpacing: Length;
  /** Between the lines of a triple bond; left unset, the double bond's. */
  tripleSpacing?: Length;
  /**
   * How far off a double bond's line a neighbouring atom has to be, as a
   * fraction of the bond, to count as on one side of it when the side of the
   * second line is chosen.
   */
  doubleSideThreshold: number;
  /**
   * A bond leaning in along a double bond closer than this, in degrees,
   * leaves no room for the second line on its side.
   */
  doubleCrowdingAngle: number;
  /** The most a second line is shortened at each end, as a fraction of the bond. */
  innerLineMaxShortening: number;
  /**
   * A centred double bond's lines run on to meet a single bond leaving at
   * least this many degrees off straight on; closer, they stop at the atom.
   */
  centredJoinMinAngle: number;

  // --- Wedges and bold bonds ----------------------------------------------
  /** A bold bond's width, and the length of a hashed bond's hashes. */
  boldWidth: Length;
  /**
   * A wedge's broad end. Left unset, it is one and a half bold widths, and
   * follows the bold width when that changes.
   */
  wedgeWidth?: Length;
  /**
   * The straightest a bond carrying on from a wedge's broad end may be, in
   * degrees, for the end to be cut along it; straighter, it is cut square.
   */
  wedgeCutMaxAngle: number;
  /**
   * How far along a bond it follows a broad end's corner may travel, as a
   * fraction of that bond: a limit on how far the cut reaches.
   */
  wedgeCornerReach: number;

  // --- Hashes and dashes --------------------------------------------------
  /** The least distance between the hashes of a hashed wedge or bond. */
  hashSpacing: Length;
  /**
   * How far the first hash sits from the atom the hashes start at, when that
   * atom has no label; left unset, one hash spacing.
   */
  hashFirstGap?: Length;
  /** A dashed bond's dashes, and the least gap between two of them. */
  dashLength: Length;
  dashGap: Length;

  // --- Dative and wavy bonds ----------------------------------------------
  /** The head of a dative bond's arrow: how long, and how wide at its base. */
  dativeHeadLength: Length;
  dativeHeadWidth: Length;
  /** How far a wavy bond swings either side of its line. */
  wavyAmplitude: Length;
  /** One whole wave of a wavy bond: a turn to either side. */
  wavyPeriod: Length;

  // --- Labels -------------------------------------------------------------
  /** The typeface labels are set in. */
  fontFamily: string;
  /** The size of an atom label. */
  fontSize: Length;
  /** The colour labels are drawn in, as CSS. */
  labelColor: string;
  /** How far a bond stops short of a label's letters. */
  labelMargin: Length;
  /** How far a label's baseline sits below its atom, as a fraction of the font size. */
  labelBaseline: number;
  /** A subscript's size, as a fraction of the font size. */
  subscriptSize: number;
  /** How far a subscript's baseline drops, as a fraction of the font size. */
  subscriptDrop: number;
  /** Baseline to baseline between the lines of a stacked label, as a fraction of the font size. */
  stackedLineSpacing: number;
  /**
   * How far from vertical, in degrees, a bond may lean and still leave a
   * label's hydrogens on the right.
   */
  hydrogenVerticalBand: number;
  /**
   * How close to horizontal, in degrees, bonds on both sides of an atom have
   * to leave for its whole symbol to be centred between them.
   */
  symbolCentringAngle: number;
  /** The most of a bond the labels at its two ends may take between them, as a fraction. */
  labelShareMax: number;

  // --- Aromatic rings ------------------------------------------------------
  /** The circle drawn in an aromatic ring, as a fraction of the ring's radius. */
  aromaticCircleSize: number;
};

/**
 * What every style shares unless it says otherwise: how labels are set and
 * how the drawing's rules decide, as ACS 1996 does both.
 */
const RULES = {
  bondColor: "#000000",
  labelColor: "#000000",
  doubleSideThreshold: 0.06,
  doubleCrowdingAngle: 45,
  innerLineMaxShortening: 0.45,
  centredJoinMinAngle: 20,
  wedgeCutMaxAngle: 175,
  wedgeCornerReach: 0.5,
  labelBaseline: 0.4,
  subscriptSize: 0.75,
  subscriptDrop: 0.225,
  stackedLineSpacing: 0.857,
  hydrogenVerticalBand: 10,
  symbolCentringAngle: 25,
  labelShareMax: 0.9,
  aromaticCircleSize: 0.5,
} satisfies Partial<DrawingStyle>;

/**
 * ACS 1996: 14.4 pt bonds, 0.6 pt lines, 2.0 pt bold width (the same for a
 * hashed bond's hashes, and 3.0 pt at a wedge's broad end), 18% bond
 * spacing, 2.5 pt hash spacing, wavy bonds of half circles 1.88 pt across,
 * 10 pt Arial labels kept 1.6 pt clear of their bonds, square ends and
 * mitred joins.
 */
export const ACS_1996: DrawingStyle = {
  ...RULES,
  bondLengthPt: 14.4,
  lineWidth: pt(0.6),
  ends: "square",
  bondSpacing: ofBond(0.18),
  boldWidth: pt(2.0),
  hashSpacing: pt(2.5),
  // Not yet settled against ACS 1996: a dashed bond's dashes and a dative
  // bond's arrowhead.
  dashLength: pt(1.5),
  dashGap: pt(1.0),
  dativeHeadLength: pt(3.0),
  dativeHeadWidth: pt(2.0),
  wavyAmplitude: pt(0.94),
  wavyPeriod: pt(3.76),
  fontFamily: "Arial",
  fontSize: pt(10),
  labelMargin: pt(1.6),
};

/**
 * ACS 1996's lengths that the journal styles below do not state for
 * themselves, as fractions of its bond, so they keep their proportions in a
 * style with a different bond length.
 */
const ACS_PROPORTIONS = {
  dashLength: ofBond(1.5 / 14.4),
  dashGap: ofBond(1.0 / 14.4),
  dativeHeadLength: ofBond(3.0 / 14.4),
  dativeHeadWidth: ofBond(2.0 / 14.4),
  wavyAmplitude: ofBond(0.94 / 14.4),
  wavyPeriod: ofBond(3.76 / 14.4),
} satisfies Partial<DrawingStyle>;

/** Points in `value` centimetres. */
function cm(value: number): number {
  return (value / 2.54) * 72;
}

/**
 * The Royal Society of Chemistry's single-column style: 12.2 pt bonds,
 * 0.45 pt lines, 1.6 pt bold width, 1.75 pt hash spacing, 20% bond spacing,
 * 7 pt Helvetica labels kept 1.25 pt clear. The rest in ACS 1996's
 * proportions.
 */
export const RSC: DrawingStyle = {
  ...RULES,
  ...ACS_PROPORTIONS,
  bondLengthPt: 12.2,
  lineWidth: pt(0.45),
  ends: "square",
  bondSpacing: ofBond(0.2),
  boldWidth: pt(1.6),
  hashSpacing: pt(1.75),
  fontFamily: "Helvetica",
  fontSize: pt(7),
  labelMargin: pt(1.25),
};

/**
 * Nature's style for chemical structures: 0.381 cm (10.8 pt) bonds, 0.021 cm
 * lines, 0.055 cm bold width, 0.06 cm hash spacing, 18% bond spacing, 6 pt
 * Arial labels kept 0.042 cm clear. The rest in ACS 1996's proportions.
 */
export const NATURE: DrawingStyle = {
  ...RULES,
  ...ACS_PROPORTIONS,
  bondLengthPt: cm(0.381),
  lineWidth: pt(cm(0.021)),
  ends: "square",
  bondSpacing: ofBond(0.18),
  boldWidth: pt(cm(0.055)),
  hashSpacing: pt(cm(0.06)),
  fontFamily: "Arial",
  fontSize: pt(6),
  labelMargin: pt(cm(0.042)),
};

/**
 * Wiley-VCH, as for Angewandte Chemie: 14.4 pt bonds, 0.6 pt lines and 8 pt
 * Arial labels. What it does not state is ACS 1996's.
 */
export const WILEY: DrawingStyle = {
  ...ACS_1996,
  fontSize: pt(8),
};

/** A style that can be picked by name. */
export type StylePreset = {
  id: string;
  name: string;
  /** One line on what it is and whose it is. */
  description: string;
  style: DrawingStyle;
};

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "acs1996",
    name: "ACS 1996",
    description: "The American Chemical Society's journals: 14.4 pt bonds, 10 pt Arial.",
    style: ACS_1996,
  },
  {
    id: "rsc",
    name: "RSC",
    description: "The Royal Society of Chemistry, single column: 12.2 pt bonds, 7 pt Helvetica.",
    style: RSC,
  },
  {
    id: "wiley",
    name: "Wiley",
    description: "Wiley-VCH journals such as Angewandte Chemie: 14.4 pt bonds, 8 pt Arial.",
    style: WILEY,
  },
  {
    id: "nature",
    name: "Nature",
    description: "Nature and its journals: 10.8 pt bonds, 6 pt Arial.",
    style: NATURE,
  },
];

/** The preset with this id, or ACS 1996. */
export function presetById(id: string | undefined): StylePreset {
  return STYLE_PRESETS.find((p) => p.id === id) ?? STYLE_PRESETS[0];
}

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
    // A triple bond's outer lines sit one spacing either side.
    tripleOffsetPx: at(style.tripleSpacing ?? style.bondSpacing),
    wedgeWidthPx: at(wedgeWidthOf(style)),
    hashSpacingPx: at(style.hashSpacing),
    hashFirstGapPx: at(style.hashFirstGap ?? style.hashSpacing),
    boldWidthPx: at(style.boldWidth),
    dashLengthPx: at(style.dashLength),
    dashGapPx: at(style.dashGap),
    dativeHeadLengthPx: at(style.dativeHeadLength),
    dativeHeadWidthPx: at(style.dativeHeadWidth),
    wavyAmpPx: at(style.wavyAmplitude),
    wavyPeriodPx: at(style.wavyPeriod),
    fontPx: at(style.fontSize),
    fontFamily: style.fontFamily,
    labelMarginPx: at(style.labelMargin),
    bondColor: style.bondColor,
    labelColor: style.labelColor,
    labelSet: {
      baseline: style.labelBaseline,
      subscriptSize: style.subscriptSize,
      subscriptDrop: style.subscriptDrop,
      stackSpacing: style.stackedLineSpacing,
      fontFamily: style.fontFamily,
    },
    hydrogenBandDeg: style.hydrogenVerticalBand,
    symbolCentringDeg: style.symbolCentringAngle,
    labelShareMax: style.labelShareMax,
    doubleSideThreshold: style.doubleSideThreshold,
    doubleCrowdingDeg: style.doubleCrowdingAngle,
    innerLineMaxShortening: style.innerLineMaxShortening,
    centredJoinMinDeg: style.centredJoinMinAngle,
    wedgeCutMaxDeg: style.wedgeCutMaxAngle,
    wedgeCornerReach: style.wedgeCornerReach,
    aromaticCircleSize: style.aromaticCircleSize,
    paddingPx: 48,
    showCarbonLabels: false,
    units: "world",
    minLinePx: 1,
    joinStyle: style.ends === "round" ? "round" : "sharp",
  };
  return { ...options, ...(over ?? {}) };
}
