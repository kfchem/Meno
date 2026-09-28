/**
 * What an atom is, chemically - the one place it is said, for every kind of
 * molecule the app handles: a file's as parsed, the editor's, the one the
 * drawing is made of, the one written out. Each adds where the atom is and
 * whatever else it needs; none says what the atom is any other way.
 */

/**
 * An atom with electrons of its own unpaired: one (a doublet, the usual
 * radical: CH3•) or two, paired (a singlet carbene) or not (a triplet).
 */
export type Radical = "doublet" | "singlet" | "triplet";

export type AtomChem = {
  /** Its element's symbol - or, for an atom that stands for more, the label: Me, Ph, R. */
  el: string;
  /** Its formal charge; none when unset. */
  charge?: number;
  radical?: Radical;
  /** Its mass number, where it is one isotope in particular: 13 for ¹³C. */
  isotope?: number;
};

/** An atom as a file gives it: where it is, in the file's own units. */
export type ParsedAtom = AtomChem & { x: number; y: number; z: number };
/** A bond as a file gives it, between atoms by index; `stereoCode` is MOL's. */
export type ParsedBond = { a1: number; a2: number; order: number; stereoCode?: number };
/** A molecule as a file gives it. */
export type Molecule = { atoms: ParsedAtom[]; bonds: ParsedBond[] };

/**
 * Valences used to work out how many hydrogens an atom carries, for the
 * elements that take them; any other carries none it is not drawn with.
 */
const VALENCE: Record<string, { valence: number; group: number }> = {
  B: { valence: 3, group: 13 },
  C: { valence: 4, group: 14 },
  Si: { valence: 4, group: 14 },
  N: { valence: 3, group: 15 },
  P: { valence: 3, group: 15 },
  O: { valence: 2, group: 16 },
  S: { valence: 2, group: 16 },
  Se: { valence: 2, group: 16 },
  F: { valence: 1, group: 17 },
  Cl: { valence: 1, group: 17 },
  Br: { valence: 1, group: 17 },
  I: { valence: 1, group: 17 },
};

/**
 * The hydrogens an atom carries that are not drawn as atoms, for bonds
 * whose orders sum to `bondOrderSum`. A charge moves the valence the way
 * the electrons do: to the right of carbon a positive charge adds a bond
 * (NH4+, H3O+) and a negative one takes one away (O-, NH2-); carbon loses
 * one either way (CH3+, CH3-); boron, to its left, gains one with a
 * negative charge (BH4-). An unpaired electron takes a bond's place, and a
 * carbene's pair two.
 */
export function implicitHydrogens(
  el: string,
  bondOrderSum: number,
  charge = 0,
  radical?: Radical,
): number {
  const v = VALENCE[el];
  if (!v) return 0;
  let valence = v.valence;
  if (v.group >= 15) valence += charge;
  else if (v.group === 14) valence -= Math.abs(charge);
  else valence -= charge;
  if (radical === "doublet") valence -= 1;
  else if (radical) valence -= 2;
  return Math.max(0, valence - bondOrderSum);
}

/** A charge as a formula writes it: +, 2+, − (a minus sign, not a hyphen), 3−. */
export function chargeText(charge: number): string {
  if (!charge) return "";
  const sign = charge > 0 ? "+" : "−";
  const n = Math.abs(charge);
  return n === 1 ? sign : `${n}${sign}`;
}
