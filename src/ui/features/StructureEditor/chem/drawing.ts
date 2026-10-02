/**
 * The structure as a drawing, for what reads its stereochemistry out of it
 * (lib/layout/drawn): each atom where it is drawn, with its depth where the
 * structure is in perspective and the H it carries undrawn, each bond with
 * its wedge narrow at the end the drawing puts it.
 *
 * And the structure as a reader that knows only wedges needs it - a MOL
 * file, RDKit: a cage drawn in perspective shows its stereochemistry by the
 * drawing itself, which such a reader cannot see, so it is given the wedges
 * (and H) that say it.
 */
import { wedgeNarrowAtom } from "../../../../lib/chem/layout2d";
import { implicitHydrogens, valenceOrder } from "../../../../lib/chem/molecule";
import type { WriterModel } from "../../../../lib/chem/molWriter";
import { wedgesForFlat, type DrawnAtom, type DrawnBond } from "../../../../lib/layout/drawn";
import { isElementSymbol } from "../../../../lib/rdkit/molblock";
import type { Bond, Model } from "../store/types";

/** How many bonds each atom has, as the drawing counts them to say which end of a wedge is narrow. */
export function degrees(bonds: readonly Pick<Bond, "a" | "b">[]): Map<number, number> {
  const degree = new Map<number, number>();
  for (const b of bonds) {
    degree.set(b.a, (degree.get(b.a) ?? 0) + 1);
    degree.set(b.b, (degree.get(b.b) ?? 0) + 1);
  }
  return degree;
}

/** Which end of a wedged bond is narrow: its stereocentre. */
export function narrowEnd(b: Bond, degree: Map<number, number>): number {
  return wedgeNarrowAtom({ a1: b.a, a2: b.b, order: b.order, stereoOrient: b.stereoOrient }, degree);
}

/** Which way round a wedge narrow at `narrow` is held, the drawing counting bonds as `degree` does. */
export function orientFor(
  b: Pick<Bond, "a" | "b" | "order">,
  narrow: number,
  degree: Map<number, number>,
): NonNullable<Bond["stereoOrient"]> {
  const usual = wedgeNarrowAtom({ a1: b.a, a2: b.b, order: b.order, stereoOrient: "principle" }, degree);
  return usual === narrow ? "principle" : "reverse";
}

/** The H an atom carries and the drawing does not show: by its valence, for an element; none for a label. */
export function undrawnHydrogens(model: Model): Map<number, number> {
  const sum = new Map<number, number>();
  for (const b of model.bonds) {
    // (a dative bond lends a pair, and takes no H from either end; nor
    // does a coordination or a hydrogen bond)
    const order = valenceOrder(b);
    sum.set(b.a, (sum.get(b.a) ?? 0) + order);
    sum.set(b.b, (sum.get(b.b) ?? 0) + order);
  }
  return new Map(
    model.atoms.map((a) => [
      a.id,
      isElementSymbol(a.el) ? implicitHydrogens(a.el, sum.get(a.id) ?? 0, a.charge ?? 0, a.radical) : 0,
    ]),
  );
}

/** The structure as lib/layout/drawn reads it, atoms in the model's order. */
export function drawingOf(model: Model): { atoms: DrawnAtom[]; bonds: DrawnBond[]; index: Map<number, number> } {
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const hs = undrawnHydrogens(model);
  const degree = degrees(model.bonds);
  const atoms: DrawnAtom[] = model.atoms.map((a) => ({
    x: a.x,
    y: a.y,
    el: a.el,
    hs: hs.get(a.id) ?? 0,
    ...(a.z != null ? { z: a.z } : {}),
    ...(a.stereoCentre ? { centre: true } : {}),
  }));
  const bonds: DrawnBond[] = model.bonds.flatMap((b) => {
    const a = index.get(b.a);
    const c = index.get(b.b);
    if (a == null || c == null) return [];
    const wedged = b.stereo === "up" || b.stereo === "down";
    return [
      {
        a,
        b: c,
        order: b.order,
        ...(wedged ? { wedge: { narrow: index.get(narrowEnd(b, degree))!, stereo: b.stereo as "up" | "down" } } : {}),
        ...(b.stereo === "wavy" ? { either: true } : {}),
      },
    ];
  });
  return { atoms, bonds, index };
}

/**
 * The structure for a reader that knows only wedges: as it is, and for each
 * centre a perspective drawing shows, a wedge that says it - on a bond out
 * of it, or on an H added for the purpose (after every atom there is, so
 * the atoms there are keep their places in a MOL file).
 */
export function forFlatReaders(model: Model): WriterModel {
  if (!model.atoms.some((a) => a.z != null)) return model;
  const { atoms, bonds } = drawingOf(model);
  const flat = wedgesForFlat(atoms, bonds);
  if (!flat.wedges.length) return model;
  const ids = model.atoms.map((a) => a.id);
  let next = Math.max(0, ...ids, ...model.bonds.map((b) => b.id)) + 1;
  const outAtoms = [...model.atoms];
  const outBonds: Bond[] = [...model.bonds];
  const hydrogen = new Map<number, number>();
  for (const h of flat.hydrogens) {
    const id = next++;
    outAtoms.push({ id, x: h.at.x, y: h.at.y, r: 0.9, el: "H" });
    outBonds.push({ id: next++, a: ids[h.on], b: id, order: 1 });
    hydrogen.set(h.on, id);
  }
  const degree = degrees(outBonds);
  for (const w of flat.wedges) {
    const from = ids[w.from];
    const to = w.to === -1 ? hydrogen.get(w.from)! : ids[w.to];
    const k = outBonds.findIndex((b) => (b.a === from && b.b === to) || (b.a === to && b.b === from));
    if (k < 0) continue;
    const b = outBonds[k];
    outBonds[k] = { ...b, stereo: w.stereo, stereoOrient: orientFor(b, from, degree) };
  }
  return { atoms: outAtoms, bonds: outBonds };
}
