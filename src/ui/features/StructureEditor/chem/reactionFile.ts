import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { writeRxnfile, type WriterModel } from "../../../../lib/chem/molWriter";
import { reactionRoles } from "../../../../lib/chem/reactionScheme";
import type { Drawn } from "../store/types";
import { forFlatReaders } from "./drawing";

/** Why the drawing cannot be written as an RXN file - it holds one reaction - or null if it can. */
export function notOneReaction(drawn: Drawn): string | null {
  const arrows = drawn.arrows?.length ?? 0;
  if (arrows === 1) return null;
  return arrows === 0
    ? "An RXN file holds a reaction: draw it with its arrow."
    : `An RXN file holds one reaction, and the drawing has ${arrows} arrows.`;
}

/**
 * The drawing as an RXN file: each molecule a reactant, a product or a
 * reagent by where it is drawn against the arrow (lib/chem/reactionScheme),
 * a cage drawn in perspective given its wedges as a MOL file is. Throws,
 * saying why, where the drawing is not one reaction.
 */
export function reactionFileText(drawn: Drawn, title?: string): string {
  const why = notOneReaction(drawn);
  if (why) throw new Error(why);
  const flat = forFlatReaders(drawn);
  const roles = reactionRoles(flat, drawn.arrows![0], drawn.pluses ?? [], NOMINAL_BOND_LENGTH);
  const molecule = (ids: number[]): WriterModel => {
    const inside = new Set(ids);
    return {
      atoms: flat.atoms.filter((a) => inside.has(a.id)),
      bonds: flat.bonds.filter((b) => inside.has(b.a) && inside.has(b.b)),
    };
  };
  return writeRxnfile(
    {
      reactants: roles.reactants.map(molecule),
      products: roles.products.map(molecule),
      reagents: roles.reagents.map(molecule),
    },
    { title },
  );
}
