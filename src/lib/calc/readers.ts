/**
 * Readers of calculation programs' output: what a file says besides its
 * geometry, which Meno reads itself. For now, that is each frame's energy,
 * as programs write it on an XYZ file's comment lines.
 *
 * These are to become plugins, added and removed online (docs/WORKSPACE.md,
 * stage 3): nothing outside this folder knows any program's format, and
 * what a reader finds is kept as plain data on the molecule (`energies`),
 * whichever reader found it. Until then, the readers Meno has are listed
 * here.
 */

/** A reader: its name, and what it makes of an XYZ file's comment lines, one per frame. */
export type CalcReader = {
  id: string;
  /** Each frame's energy, in hartrees, where every comment line gives one; otherwise nothing. */
  xyzEnergies?: (comments: string[]) => number[] | undefined;
};

const NUMBER = String.raw`(-?\d+\.\d+(?:[eE][-+]?\d+)?)`;
/** xtb's "energy: -40.1", ORCA's "... E -40.1", and "E = -40.1". */
const LABELLED = new RegExp(String.raw`(?:^|\s)(?:energy|E)\s*[:=]?\s*` + NUMBER, "i");
/** CREST's: the number alone, first on the line. */
const FIRST = new RegExp(String.raw`^\s*` + NUMBER + String.raw`(?:\s|$)`);

/** The energies CREST, xtb and ORCA write on an XYZ file's comment lines. */
export const XYZ_COMMENT_ENERGIES: CalcReader = {
  id: "xyz-comment-energies",
  xyzEnergies: (comments) => {
    const found: number[] = [];
    for (const c of comments) {
      const m = c.match(LABELLED) ?? c.match(FIRST);
      if (!m) return undefined;
      found.push(parseFloat(m[1]));
    }
    return found;
  },
};

export const CALC_READERS: readonly CalcReader[] = [XYZ_COMMENT_ENERGIES];

/**
 * Each frame's energy, by the first reader that finds one for every frame
 * of more than one; otherwise nothing.
 */
export function energiesOf(comments: string[], readers: readonly CalcReader[] = CALC_READERS): number[] | undefined {
  if (comments.length < 2) return undefined;
  for (const r of readers) {
    const found = r.xyzEnergies?.(comments);
    if (found?.length === comments.length) return found;
  }
  return undefined;
}
