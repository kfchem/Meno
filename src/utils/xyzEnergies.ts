/**
 * Each frame's energy in an XYZ file, as programs write it on its comment
 * lines - part of reading XYZ, which Meno does itself (docs/FILE-IO.md, the
 * one exception agreed on 2026-10-05: the core knows no program's format
 * but these). The ways it is written are tried in turn; the first that
 * finds one on every frame's line gives them.
 */

const NUMBER = String.raw`(-?\d+\.\d+(?:[eE][-+]?\d+)?)`;
/** xtb's "energy: -40.1", ORCA's "... E -40.1", and "E = -40.1". */
const LABELLED = new RegExp(String.raw`(?:^|\s)(?:energy|E)\s*[:=]?\s*` + NUMBER, "i");
/** CREST's: the number alone, first on the line. */
const FIRST = new RegExp(String.raw`^\s*` + NUMBER + String.raw`(?:\s|$)`);

/** A way a frame's energy is written on its comment line: what it makes of each line, or nothing where one has none. */
export type EnergyLines = (comments: string[]) => number[] | undefined;

/** The energies CREST, xtb and ORCA write on an XYZ file's comment lines, in hartrees. */
export const CREST_XTB_ORCA: EnergyLines = (comments) => {
  const found: number[] = [];
  for (const c of comments) {
    const m = c.match(LABELLED) ?? c.match(FIRST);
    if (!m) return undefined;
    found.push(parseFloat(m[1]));
  }
  return found;
};

const WAYS: readonly EnergyLines[] = [CREST_XTB_ORCA];

/** Each frame's energy, by the first way that finds one for every frame of more than one; otherwise nothing. */
export function energiesOf(comments: string[], ways: readonly EnergyLines[] = WAYS): number[] | undefined {
  if (comments.length < 2) return undefined;
  for (const way of ways) {
    const found = way(comments);
    if (found?.length === comments.length) return found;
  }
  return undefined;
}
