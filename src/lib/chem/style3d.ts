/**
 * How a molecule in 3D is drawn: its atoms and bonds, their finish, the
 * light it is seen in, and how it turns. Held as data, as the 2D drawing
 * style is (./style), so that it can be set the same way; the defaults are
 * the 3D viewer's look.
 */
import { getColor, getVdwRadius } from "../../utils/atomUtils";

export type Style3D = {
  /** Balls and sticks, or space-filling: each atom at its van der Waals radius. */
  atoms: "balls" | "space";
  /** A ball's radius, as a fraction of its atom's van der Waals radius. */
  ballScale: number;
  /** A bond's radius, in ångströms. */
  bondRadius: number;
  bondColor: string;
  /** The surface: from matt (1) to glossy (0), and how metallic. */
  roughness: number;
  metalness: number;
  /** The light from all round, and the light from above right, in front. */
  ambientLight: number;
  keyLight: number;
  /** How far a drag across half the canvas turns a molecule, in radians. */
  turnPerHalfWidth: number;
  /** How much of its speed a turn left to itself loses each sixtieth of a second. */
  turnDamping: number;
  /** How smooth a ball and a bond are: the segments round them. */
  ballSegments: number;
  bondSegments: number;
};

/** The 3D viewer's look. */
export const STYLE_3D: Style3D = {
  atoms: "balls",
  ballScale: 0.2,
  bondRadius: 0.1,
  bondColor: "#000000",
  roughness: 1,
  metalness: 0,
  ambientLight: 0.9,
  keyLight: 1,
  turnPerHalfWidth: 3,
  turnDamping: 0.1,
  ballSegments: 32,
  bondSegments: 8,
};

/** Where the key light comes from, as seen: above right, in front. */
export const KEY_LIGHT_FROM: readonly [number, number, number] = [5, 5, 5];

const vdw = new Map<string, number>();
const colour = new Map<string, string>();

/** An atom's radius as drawn, in ångströms. */
export function atomRadius(el: string, style: Style3D): number {
  if (!vdw.has(el)) vdw.set(el, getVdwRadius(el));
  return vdw.get(el)! * (style.atoms === "space" ? 1 : style.ballScale);
}

/** An atom's colour, by its element (an unknown one grey). */
export function atomColour(el: string): string {
  if (!colour.has(el)) colour.set(el, getColor(el));
  return colour.get(el)!;
}

// --- Presets and a choice ------------------------------------------------------

export type Style3DPreset = { id: string; name: string; description: string; style: Style3D };

/** Looks to start from: Meno's own (the 3D viewer's) first. */
export const STYLE_3D_PRESETS: Style3DPreset[] = [
  {
    id: "meno",
    name: "Meno",
    description: "Matt balls a fifth of each atom's van der Waals size, and thin black bonds.",
    style: STYLE_3D,
  },
  {
    id: "glossy",
    name: "Glossy",
    description: "Shiny balls in a stronger light, and grey bonds.",
    style: { ...STYLE_3D, roughness: 0.2, ambientLight: 0.55, keyLight: 2.2, bondColor: "#6b7280" },
  },
  {
    id: "space",
    name: "Space-filling",
    description: "Each atom as large as its van der Waals radius: the molecule's surface.",
    style: { ...STYLE_3D, atoms: "space" },
  },
];

/** The preset with this id, or the first, Meno's own. */
export function preset3dById(id: string | undefined): Style3DPreset {
  return STYLE_3D_PRESETS.find((p) => p.id === id) ?? STYLE_3D_PRESETS[0];
}

/** A 3D look as someone chose it: a preset, and what was changed from it - as a drawing style is chosen (./style). */
export type Style3DChoice = { preset: string; changes: Partial<Style3D> };

export const DEFAULT_STYLE_3D_CHOICE: Style3DChoice = { preset: STYLE_3D_PRESETS[0].id, changes: {} };

/** The look a choice comes to. */
export function style3dOf(choice: Style3DChoice): Style3D {
  return { ...preset3dById(choice.preset).style, ...choice.changes };
}

/** A choice with one setting changed - or, set back to its preset's value, no longer changed. */
export function with3dSetting<K extends keyof Style3D>(choice: Style3DChoice, key: K, value: Style3D[K]): Style3DChoice {
  const { [key]: _was, ...rest } = choice.changes;
  const same = preset3dById(choice.preset).style[key] === value;
  return { preset: choice.preset, changes: same ? rest : { ...rest, [key]: value } };
}

// --- The settings, as they are shown ------------------------------------------

export type Style3DField = {
  key: keyof Style3D;
  group: "Atoms and bonds" | "Surface and light" | "Turning";
  label: string;
  description: string;
} & (
  | { kind: "choice"; options: { value: string; label: string }[] }
  | {
      kind: "number";
      min: number;
      max: number;
      step: number;
      /** Shown as the value times this, in `unit`, to `digits` places; or between two words, `ends`. */
      scale?: number;
      unit?: string;
      digits?: number;
      ends?: [string, string];
    }
  | { kind: "colour" }
);

export const STYLE_3D_FIELDS: Style3DField[] = [
  {
    key: "atoms",
    group: "Atoms and bonds",
    label: "Molecules are drawn",
    description: "Unless a molecule has been given a look of its own from its menu.",
    kind: "choice",
    options: [
      { value: "balls", label: "Ball and stick" },
      { value: "space", label: "Space-filling" },
    ],
  },
  {
    key: "ballScale",
    group: "Atoms and bonds",
    label: "Ball size",
    description: "In ball and stick, each atom's ball, as a share of its van der Waals radius.",
    kind: "number",
    min: 0.1,
    max: 0.6,
    step: 0.01,
    scale: 100,
    unit: "%",
    digits: 0,
  },
  {
    key: "bondRadius",
    group: "Atoms and bonds",
    label: "Bond thickness",
    description: "A single bond's radius. A double or triple bond is two or three thinner lines side by side.",
    kind: "number",
    min: 0.03,
    max: 0.3,
    step: 0.01,
    unit: "Å",
    digits: 2,
  },
  { key: "bondColor", group: "Atoms and bonds", label: "Bond colour", description: "The sticks between the balls.", kind: "colour" },
  {
    key: "roughness",
    group: "Surface and light",
    label: "Surface",
    description: "How the light shows on the balls and sticks.",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.05,
    ends: ["Glossy", "Matt"],
  },
  {
    key: "metalness",
    group: "Surface and light",
    label: "Metallic",
    description: "How much the surface reflects as a metal does.",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.05,
    ends: ["Not at all", "Fully"],
  },
  {
    key: "ambientLight",
    group: "Surface and light",
    label: "Light from all round",
    description: "Lights every side alike: more of it, and the shading is fainter.",
    kind: "number",
    min: 0,
    max: 2,
    step: 0.05,
    digits: 2,
  },
  {
    key: "keyLight",
    group: "Surface and light",
    label: "Light from above right",
    description: "Lights the molecule from above right, in front: what shades it.",
    kind: "number",
    min: 0,
    max: 3,
    step: 0.05,
    digits: 2,
  },
  {
    key: "turnPerHalfWidth",
    group: "Turning",
    label: "Turning speed",
    description: "How far a drag across half the canvas turns a molecule.",
    kind: "number",
    min: 1,
    max: 6,
    step: 0.1,
    scale: 180 / Math.PI,
    unit: "°",
    digits: 0,
  },
  {
    key: "turnDamping",
    group: "Turning",
    label: "Let go while turning",
    description: "A molecule let go while it is being turned turns on, slowing to a stop.",
    kind: "number",
    min: 0.02,
    max: 1,
    step: 0.01,
    ends: ["Turns on long", "Stops at once"],
  },
];

/** A 3D look as the settings file holds it: what does not read is left as its preset has it. */
export function acceptStyle3dChoice(raw: unknown): Style3DChoice {
  if (typeof raw !== "object" || raw === null) return DEFAULT_STYLE_3D_CHOICE;
  const { preset, changes } = raw as { preset?: unknown; changes?: unknown };
  const known = STYLE_3D_PRESETS.find((p) => p.id === preset);
  if (!known) return DEFAULT_STYLE_3D_CHOICE;
  const out: Record<string, unknown> = {};
  if (typeof changes === "object" && changes !== null) {
    for (const [key, value] of Object.entries(changes as Record<string, unknown>)) {
      const field = STYLE_3D_FIELDS.find((f) => f.key === key);
      if (!field) continue;
      if (field.kind === "choice" && field.options.some((o) => o.value === value)) out[key] = value;
      else if (field.kind === "colour" && typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) out[key] = value.toLowerCase();
      else if (field.kind === "number" && typeof value === "number" && Number.isFinite(value) && value >= field.min && value <= field.max)
        out[key] = value;
    }
  }
  return { preset: known.id, changes: out as Partial<Style3D> };
}
