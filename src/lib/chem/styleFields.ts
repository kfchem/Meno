import {
  DEFAULT_STYLE_CHOICE,
  presetById,
  STYLE_PRESETS,
  wedgeBroadEndOf,
  type DrawingStyle,
  type Length,
  type StyleChoice,
} from "./style";

/**
 * Every drawing setting in words: what it is called in the settings, what it
 * does, what it is measured in and the range it may take. The settings pages
 * are built from this list, and a style read from a file is checked against
 * it, so a setting missing from here is a setting nobody can change.
 */

export type StyleGroup =
  | "Size"
  | "Lines"
  | "Double and triple bonds"
  | "Wedges and bold bonds"
  | "Hashes and dashes"
  | "Wavy and dative bonds"
  | "Labels"
  | "Aromatic rings";

export const STYLE_GROUPS: StyleGroup[] = [
  "Size",
  "Lines",
  "Double and triple bonds",
  "Wedges and bold bonds",
  "Hashes and dashes",
  "Wavy and dative bonds",
  "Labels",
  "Aromatic rings",
];

/** What a share is a share of, for a setting given as one. */
export type ShareOf = "bond" | "font size" | "ring radius";

export type FieldKind =
  /** The bond length itself, in points. */
  | { type: "points"; min: number; max: number; step: number }
  /**
   * A length, in points or as a share of the bond - whichever the style
   * holds it in. `min` and `max` are in points.
   */
  | { type: "length"; min: number; max: number; step: number }
  /** A plain share, shown as a percentage. */
  | { type: "share"; of: ShareOf; min: number; max: number; step: number }
  | { type: "angle"; min: number; max: number; step: number }
  | { type: "colour" }
  | { type: "typeface"; options: readonly string[] }
  | { type: "choice"; options: readonly { value: string; label: string }[] };

export type StyleField = {
  key: keyof DrawingStyle;
  group: StyleGroup;
  label: string;
  description: string;
  kind: FieldKind;
  /**
   * For a setting that may be left unset: what it follows then, in words.
   * The settings offer "Automatic" for it.
   */
  automatic?: string;
  /**
   * A rule the drawing decides by rather than a size on the page: kept
   * below a group's sizes in the settings, as there is seldom a reason to
   * change it.
   */
  rule?: boolean;
};

/**
 * The typefaces a label can be set in: those whose letter shapes Meno knows,
 * so that a bond stops the same distance from every letter. Helvetica shares
 * Arial's widths.
 */
export const LABEL_TYPEFACES = ["Arial", "Helvetica"] as const;

const length = (min: number, max: number, step = 0.05): FieldKind => ({
  type: "length",
  min,
  max,
  step,
});
const share = (
  of: ShareOf,
  min: number,
  max: number,
  step = 0.005,
): FieldKind => ({
  type: "share",
  of,
  min,
  max,
  step,
});
const angle = (min: number, max: number, step = 1): FieldKind => ({
  type: "angle",
  min,
  max,
  step,
});

export const STYLE_FIELDS: StyleField[] = [
  // --- Size ----------------------------------------------------------------
  {
    key: "bondLengthPt",
    group: "Size",
    label: "Bond length",
    description:
      "How long a bond is on the page. Every length given as a percentage of the bond grows and shrinks with it.",
    kind: { type: "points", min: 4, max: 40, step: 0.1 },
  },

  // --- Lines ---------------------------------------------------------------
  {
    key: "lineThickness",
    group: "Lines",
    label: "Line thickness",
    description: "How thick a bond's line is.",
    kind: length(0.1, 3, 0.05),
  },
  {
    key: "ends",
    group: "Lines",
    label: "Line ends and corners",
    description:
      "Square ends with sharp corners, or round ends with round corners. Every line in the drawing, double and triple bonds included, follows the same choice.",
    kind: {
      type: "choice",
      options: [
        { value: "square", label: "Square" },
        { value: "round", label: "Round" },
      ],
    },
  },
  {
    key: "bondColor",
    group: "Lines",
    label: "Bond colour",
    description: "The colour of bonds, wedges, hashes and arrows.",
    kind: { type: "colour" },
  },

  // --- Double and triple bonds ------------------------------------------------
  {
    key: "doubleGap",
    group: "Double and triple bonds",
    label: "Double bond: gap between lines",
    description:
      "How far apart the two lines of a double bond are, centre to centre.",
    kind: length(0.3, 8),
  },
  {
    key: "tripleGap",
    group: "Double and triple bonds",
    label: "Triple bond: gap between lines",
    description:
      "How far each outer line of a triple bond is from the middle one, centre to centre.",
    kind: length(0.3, 8),
    automatic: "the same as a double bond's",
  },
  {
    key: "innerLineMaxShortening",
    group: "Double and triple bonds",
    label: "Inner line: most shortening",
    description:
      "In a ring or at a branch, a double bond's second line is drawn shorter so that it stays inside the angle. This is the most it is shortened at each end.",
    kind: share("bond", 0, 0.5),
  },
  {
    key: "doubleSideThreshold",
    group: "Double and triple bonds",
    label: "Choosing a side: least offset",
    description:
      "How far a neighbouring atom has to sit off a double bond's axis to count as being on one side of it, when the side for the second line is chosen.",
    kind: share("bond", 0, 0.3),
    rule: true,
  },
  {
    key: "doubleCrowdingAngle",
    group: "Double and triple bonds",
    label: "Choosing a side: crowding angle",
    description:
      "A bond leaving either end of a double bond closer than this to its axis leaves no room for the second line on that side.",
    kind: angle(0, 90),
    rule: true,
  },
  {
    key: "centredJoinMinAngle",
    group: "Double and triple bonds",
    label: "Centred double bond: joining angle",
    description:
      "A centred double bond's two lines run on to meet a single bond at its end when that bond turns at least this far from straight on; otherwise they stop at the atom.",
    kind: angle(0, 90),
    rule: true,
  },

  // --- Wedges and bold bonds -----------------------------------------------
  {
    key: "boldThickness",
    group: "Wedges and bold bonds",
    label: "Bold bond thickness",
    description:
      "How thick a bold bond is. A hashed bond's hashes are as long.",
    kind: length(0.3, 8),
  },
  {
    key: "wedgeBroadEnd",
    group: "Wedges and bold bonds",
    label: "Wedge: width at the broad end",
    description: "How wide a wedge, solid or hashed, is at its broad end.",
    kind: length(0.3, 12),
    automatic: "one and a half times the bold bond thickness",
  },
  {
    key: "wedgeCutMaxAngle",
    group: "Wedges and bold bonds",
    label: "Wedge: straightest bond to cut along",
    description:
      "A wedge's broad end is cut along a bond that carries on from it, so the two meet cleanly - unless that bond runs on straighter than this, when the end is cut square.",
    kind: angle(90, 180),
    rule: true,
  },
  {
    key: "wedgeCornerReach",
    group: "Wedges and bold bonds",
    label: "Wedge: how far a cut may reach",
    description:
      "When a broad end is cut along the next bond, the furthest its corner may reach along that bond.",
    kind: share("bond", 0, 1, 0.01),
    rule: true,
  },

  // --- Hashes and dashes -----------------------------------------------------
  {
    key: "hashInterval",
    group: "Hashes and dashes",
    label: "Hashes: least distance apart",
    description:
      "The least distance between two hashes of a hashed wedge or bond. A longer bond gets more hashes, spread evenly, not wider gaps.",
    kind: length(0.5, 8),
  },
  {
    key: "hashStartOffset",
    group: "Hashes and dashes",
    label: "Hashes: first one from the atom",
    description:
      "How far the first hash is from the atom the hashes start at, when that atom has no label.",
    kind: length(0, 8),
    automatic: "the same as the distance between hashes",
  },
  {
    key: "dashLength",
    group: "Hashes and dashes",
    label: "Dash length",
    description: "How long each dash of a dashed bond is.",
    kind: length(0.2, 8),
  },
  {
    key: "dashGap",
    group: "Hashes and dashes",
    label: "Gap between dashes",
    description:
      "The least gap between two dashes; the dashes are spread evenly along the bond.",
    kind: length(0.2, 8),
  },

  // --- Wavy and dative bonds -----------------------------------------------
  {
    key: "waveAmplitude",
    group: "Wavy and dative bonds",
    label: "Wavy bond: amplitude",
    description: "How far a wavy bond swings to either side of its line.",
    kind: length(0.1, 5),
  },
  {
    key: "wavelength",
    group: "Wavy and dative bonds",
    label: "Wavy bond: wavelength",
    description: "How long one whole wave is: a turn to each side.",
    kind: length(0.4, 15),
  },
  {
    key: "arrowheadLength",
    group: "Wavy and dative bonds",
    label: "Dative bond: arrowhead length",
    description: "How long the head of a dative bond's arrow is.",
    kind: length(0.5, 10),
  },
  {
    key: "arrowheadWidth",
    group: "Wavy and dative bonds",
    label: "Dative bond: arrowhead width",
    description: "How wide the head of a dative bond's arrow is at its base.",
    kind: length(0.5, 10),
  },

  // --- Labels ----------------------------------------------------------------
  {
    key: "fontFamily",
    group: "Labels",
    label: "Typeface",
    description: "The typeface atom labels are set in.",
    kind: { type: "typeface", options: LABEL_TYPEFACES },
  },
  {
    key: "fontSize",
    group: "Labels",
    label: "Label size",
    description: "The font size of atom labels.",
    kind: length(3, 30, 0.5),
  },
  {
    key: "labelColor",
    group: "Labels",
    label: "Label colour",
    description: "The colour of atom labels.",
    kind: { type: "colour" },
  },
  {
    key: "labelClearance",
    group: "Labels",
    label: "Space round a label",
    description: "How far a bond stops short of a label's letters.",
    kind: length(0, 6),
  },
  {
    key: "subscriptSize",
    group: "Labels",
    label: "Subscript size",
    description: "The size of a subscript, such as the 2 in NH2.",
    kind: share("font size", 0.3, 1),
  },
  {
    key: "subscriptDrop",
    group: "Labels",
    label: "Subscript drop",
    description: "How far a subscript sits below the line of the letters.",
    kind: share("font size", 0, 0.6),
  },
  {
    key: "stackedLineSpacing",
    group: "Labels",
    label: "Hydrogens above or below: line spacing",
    description:
      "When an atom's hydrogens are written above or below its symbol, how far apart the two lines are, baseline to baseline.",
    kind: share("font size", 0.5, 2),
  },
  {
    key: "labelBaseline",
    group: "Labels",
    label: "Letters on the atom: baseline",
    description:
      "How far below its atom a label's baseline sits. This is what centres a capital letter on the atom.",
    kind: share("font size", 0, 1),
    rule: true,
  },
  {
    key: "hydrogenVerticalBand",
    group: "Labels",
    label: "Hydrogens on the right: near-vertical bonds",
    description:
      "An atom's hydrogens go on the side away from its bonds; when its bonds lean less than this from vertical, they go on the right.",
    kind: angle(0, 45),
    rule: true,
  },
  {
    key: "symbolCentringAngle",
    group: "Labels",
    label: "Whole symbol centred: bonds on both sides",
    description:
      "When bonds leave an atom on both sides within this angle of horizontal, its whole symbol is centred on the atom, not just its first letter.",
    kind: angle(0, 60),
    rule: true,
  },
  {
    key: "labelShareMax",
    group: "Labels",
    label: "Most of a bond that labels may hide",
    description:
      "The labels at the two ends of a bond may between them take at most this much of it, so that a short bond between two labels still shows.",
    kind: share("bond", 0.3, 1, 0.01),
    rule: true,
  },

  // --- Aromatic rings --------------------------------------------------------
  {
    key: "aromaticCircleSize",
    group: "Aromatic rings",
    label: "Circle size",
    description:
      "The circle drawn inside an aromatic ring, as a share of the ring's radius.",
    kind: share("ring radius", 0.2, 0.9, 0.01),
  },
];

const FIELD_BY_KEY = new Map(STYLE_FIELDS.map((f) => [f.key, f]));

export function fieldOf(key: keyof DrawingStyle): StyleField | undefined {
  return FIELD_BY_KEY.get(key);
}

/**
 * What a setting that may be left unset comes to when it is: the value the
 * settings show, greyed, beside "Automatic".
 */
export function automaticValue(
  key: keyof DrawingStyle,
  style: DrawingStyle,
): DrawingStyle[keyof DrawingStyle] | undefined {
  switch (key) {
    case "tripleGap":
      return style.doubleGap;
    case "wedgeBroadEnd":
      return wedgeBroadEndOf({ ...style, wedgeBroadEnd: undefined });
    case "hashStartOffset":
      return style.hashInterval;
    default:
      return undefined;
  }
}

/** Two values of a setting are the same: equal numbers or strings, or equal lengths in the same unit. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "object" && a && typeof b === "object" && b) {
    const la = a as Length;
    const lb = b as Length;
    return la.unit === lb.unit && Math.abs(la.value - lb.value) < 1e-9;
  }
  return false;
}

/**
 * `choice` with `key` set to `value` - or, when that is what the preset has
 * anyway, with the change dropped, so that "changed" means changed.
 */
export function withSetting<K extends keyof DrawingStyle>(
  choice: StyleChoice,
  key: K,
  value: DrawingStyle[K] | undefined,
): StyleChoice {
  const preset = presetById(choice.preset).style;
  const changes: Partial<DrawingStyle> = { ...choice.changes };
  if (value === undefined || sameValue(preset[key], value)) delete changes[key];
  else changes[key] = value;
  return { preset: choice.preset, changes };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * `value` as `field` accepts it, or undefined when it is not one it can
 * take. Numbers out of range are brought into it; a length keeps its unit.
 * `bondLengthPt` is needed to bring a length given as a share of the bond
 * into a range given in points.
 */
export function acceptValue(
  field: StyleField,
  value: unknown,
  bondLengthPt: number,
): DrawingStyle[keyof DrawingStyle] | undefined {
  const k = field.kind;
  switch (k.type) {
    case "points":
    case "share":
    case "angle":
      return isFiniteNumber(value) ? clamp(value, k.min, k.max) : undefined;
    case "length": {
      if (typeof value !== "object" || value === null) return undefined;
      const { value: v, unit } = value as Partial<Length>;
      if (!isFiniteNumber(v) || (unit !== "pt" && unit !== "bond"))
        return undefined;
      if (unit === "pt") return { value: clamp(v, k.min, k.max), unit };
      const L = bondLengthPt > 0 ? bondLengthPt : 14.4;
      return { value: clamp(v, k.min / L, k.max / L), unit };
    }
    case "colour":
      return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
        ? value.toLowerCase()
        : undefined;
    case "typeface":
      return typeof value === "string" && k.options.includes(value)
        ? value
        : undefined;
    case "choice":
      return typeof value === "string" &&
        k.options.some((o) => o.value === value)
        ? value
        : undefined;
  }
}

/**
 * A style choice from what a settings file holds: an unknown preset becomes
 * the default, and a change that is not a setting, or not a value the
 * setting can take, is dropped rather than trusted.
 */
export function acceptStyleChoice(raw: unknown): StyleChoice {
  if (typeof raw !== "object" || raw === null) return DEFAULT_STYLE_CHOICE;
  const { preset, changes } = raw as { preset?: unknown; changes?: unknown };
  const known = STYLE_PRESETS.find((p) => p.id === preset);
  if (!known) return DEFAULT_STYLE_CHOICE;
  const out: Record<string, unknown> = {};
  if (typeof changes === "object" && changes !== null) {
    const c = changes as Record<string, unknown>;
    const bond = acceptValue(
      fieldOf("bondLengthPt")!,
      c.bondLengthPt,
      known.style.bondLengthPt,
    );
    const L = (bond as number | undefined) ?? known.style.bondLengthPt;
    for (const [key, value] of Object.entries(c)) {
      const field = FIELD_BY_KEY.get(key as keyof DrawingStyle);
      if (!field) continue;
      const accepted = acceptValue(field, value, L);
      if (accepted !== undefined) out[key] = accepted;
    }
  }
  return { preset: known.id, changes: out as Partial<DrawingStyle> };
}
