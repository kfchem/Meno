import type { SmilesAtom } from "./smiles";

/**
 * Labels that name one enantiomer: a stereodescriptor before a reagent's or
 * a ligand's own label - (S,S)-DPEN, (R)-CBS, (1S)-CSA, L-proline - and what
 * it says of the structure: the configuration its SMILES has, or that
 * configuration's mirror image. For one whose chirality is axial (BINAP,
 * SEGPHOS), the descriptor is read and says nothing of its atoms: SMILES
 * has no way to say it.
 */
export type Enantiomers = {
  /** The descriptors of the configuration its SMILES has: (S,S), L. */
  as: string[];
  /** The descriptors of that configuration's mirror image. */
  mirror: string[];
  /**
   * Its label alone means the configuration its SMILES has (Shi's ketone,
   * made from D-fructose); else it says none, and the structure has none.
   */
  plain?: boolean;
  /** Its chirality is axial: read, and not shown on its atoms. */
  axial?: boolean;
};

/**
 * The descriptor a chiral one is shown with where it stands for itself (a
 * list, a picture): the one its SMILES's configuration has - none for an
 * axial one, whose descriptor shows on no atom, or one named as itself.
 */
export function shownAs(e: Enantiomers | undefined): string | null {
  return e && !e.axial && !e.plain && e.as.length ? e.as[0] : null;
}

/** A descriptor before a label: (R)-, (S,S)-, (1S,2S)-, (+)-, (−)-, (±)-, D-, L-. */
const DESCRIPTOR = /^(\((?:\d*[RS]|[+±−-])(?:,\s?\d*[RS])*\)|[DL])-(.+)$/;

/** A descriptor as it is compared: no spaces, a minus sign for a hyphen. */
function plainDescriptor(d: string): string {
  return d.replace(/\s/g, "").replace("(-)", "(−)");
}

/** A label's descriptor and the label it stands before, or null for a label with none. */
export function splitDescriptor(label: string): { descriptor: string; rest: string } | null {
  const m = DESCRIPTOR.exec(label);
  return m ? { descriptor: plainDescriptor(m[1]), rest: m[2] } : null;
}

/**
 * The atoms of a structure with the configuration a descriptor says: as
 * its SMILES has them, mirrored, or - with none, where the label alone says
 * none, and with (±) - without one. Null for a descriptor that does not
 * name one of its enantiomers, or for one before a label that has none.
 */
export function withConfiguration(
  atoms: readonly SmilesAtom[],
  e: Enantiomers | undefined,
  descriptor: string | null,
): SmilesAtom[] | null {
  const bare = () => atoms.map(({ tetra: _tetra, ...a }) => a);
  if (descriptor == null) return e?.plain ? [...atoms] : bare();
  if (!e) return null;
  if (descriptor === "(±)") return bare();
  const as = e.as.map(plainDescriptor).includes(descriptor);
  const mirror = e.mirror.map(plainDescriptor).includes(descriptor);
  if (!as && !mirror) return null;
  if (e.axial || as) return [...atoms];
  return atoms.map((a) => (a.tetra ? { ...a, tetra: { ...a.tetra, volume: (-a.tetra.volume) as 1 | -1 } } : a));
}
