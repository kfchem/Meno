import type { Model, Molecule3D } from "../store/types";

/**
 * What a drawn structure is, as its molecules in 3D were made from it: its
 * atoms (by id: element, charge, mass), its bonds (order and wedge), and
 * those that leave it - not where anything is drawn. A molecule in 3D whose
 * drawing no longer says the same is its drawing's no longer.
 */
export function signatureOf(model: Model, ids: Iterable<number>): string {
  const of = new Set(ids);
  const atoms = model.atoms
    .filter((a) => of.has(a.id))
    .map((a) => `${a.id}:${a.el}:${a.charge ?? 0}:${a.isotope ?? ""}`)
    .sort();
  const bonds = model.bonds
    .filter((b) => of.has(b.a) || of.has(b.b))
    .map((b) => {
      const ends = of.has(b.a) && of.has(b.b) ? `${b.a}-${b.b}` : of.has(b.a) ? `${b.a}-out` : `${b.b}-out`;
      return `${ends}:${b.order}:${b.stereo ?? "none"}`;
    })
    .sort();
  return [...atoms, "|", ...bonds].join(",");
}

/**
 * How a molecule in 3D stands to the drawing it was made from: the same
 * structure still ("live"), drawn otherwise since ("changed"), gone, or
 * made from none.
 */
export function linkOf(m: Pick<Molecule3D, "drawnFrom" | "drawnAs">, model: Model): "live" | "changed" | "gone" | null {
  if (!m.drawnFrom) return null;
  const ids = m.drawnFrom.filter((id): id is number => id != null);
  const present = new Set(model.atoms.map((a) => a.id));
  if (!ids.some((id) => present.has(id))) return "gone";
  return m.drawnAs != null && signatureOf(model, ids) !== m.drawnAs ? "changed" : "live";
}
