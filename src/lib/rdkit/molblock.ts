import { writeMolfile, type WriterModel } from "../chem/molWriter";
import { elements } from "../../utils/atomUtils";

const SYMBOLS = new Set(elements.map((e) => e.symbol));

/** Whether a label is an element's symbol, as written: C, Cl - not cl, Me or R. */
export function isElementSymbol(label: string): boolean {
  return SYMBOLS.has(label);
}

/**
 * The structure as RDKit is asked about it: a V3000 MOL block, with every
 * label that is not an element - an abbreviation, an R group, any text - as
 * an atom RDKit knows nothing about ("*"), which it neither counts bonds on
 * nor gives hydrogens.
 */
export function chemMolblock(model: WriterModel): string {
  return writeMolfile(
    {
      atoms: model.atoms.map((a) =>
        isElementSymbol(a.el) ? a : { ...a, el: "*" },
      ),
      bonds: model.bonds,
    },
    { version: "V3000" },
  );
}

/**
 * Which model atom and bond each of the block's atoms and bonds is, by
 * position: the writer lists every atom in order, and every bond whose atoms
 * are both there.
 */
export function molIndex<
  A extends { id: number },
  B extends { a: number; b: number },
>(model: { atoms: A[]; bonds: B[] }): { atoms: A[]; bonds: B[] } {
  const ids = new Set(model.atoms.map((a) => a.id));
  return {
    atoms: model.atoms,
    bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)),
  };
}
