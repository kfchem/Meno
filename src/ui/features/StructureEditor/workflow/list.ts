/**
 * A box's list of entries (docs/WORKFLOWS.md, *Compound sets and conformer
 * sets*): in a conformer set, each compound's conformers - lowest energy
 * first, how far above the lowest each is and its population - and those
 * set aside, struck through; in a compound set, those set aside alone (its
 * entries are on the page, each a molecule of its own).
 */
import type { AsideEntry, Molecule3D } from "../store/types";
import { populations } from "../utils/molecule3d";
import { compoundLetter, framesOf } from "./entries";
import type { SetKind } from "./kinds";
import { ASIDE_MOST, LIST_MOST } from "./look";
import { KCAL_PER_HARTREE } from "./meno";

/** A row: an entry's label, its energy above its compound's lowest (kcal/mol) and its share - set aside, struck through - or how many more there are. */
export type ListRow = { label: string; energy?: string; share?: string; aside?: boolean; more?: boolean };

type Listed = Pick<Molecule3D, "atoms" | "frames" | "energies" | "numbers" | "shares" | "conformerSet">;

const kcal = (e: number, lowest: number) => ((e - lowest) * KCAL_PER_HARTREE).toFixed(2);
const percent = (s: number) => (s < 0.005 ? "<1 %" : `${Math.round(s * 100)} %`);

/** The rows of a box of `set` holding `molecules` (in order), with the entries a step set aside. */
export function boxList(molecules: readonly Listed[], aside: readonly AsideEntry[], set: SetKind): ListRow[] {
  const rows: ListRow[] = [];
  if (set !== "conformers") {
    aside.slice(0, LIST_MOST + ASIDE_MOST).forEach((a) => rows.push({ label: compoundLetter(a.compound), aside: true }));
    if (aside.length > LIST_MOST + ASIDE_MOST) rows.push({ label: `${aside.length - LIST_MOST - ASIDE_MOST} more set aside`, aside: true, more: true });
    return rows;
  }
  molecules.forEach((m, i) => {
    const letter = compoundLetter(i);
    const n = framesOf(m);
    const energies = m.energies?.length === n ? m.energies : undefined;
    const shares = m.shares?.length === n ? m.shares : energies ? populations(energies) : undefined;
    const order = Array.from({ length: n }, (_, f) => f);
    if (energies) order.sort((p, q) => energies[p] - energies[q]);
    const lowest = energies ? Math.min(...energies) : undefined;
    for (const f of order.slice(0, LIST_MOST)) {
      rows.push({
        label: `${letter} · ${m.numbers?.[f] ?? f + 1}`,
        ...(energies ? { energy: kcal(energies[f], lowest!) } : {}),
        ...(shares ? { share: percent(shares[f]) } : {}),
      });
    }
    if (n > LIST_MOST) rows.push({ label: `${letter} · …`, energy: `(${n - LIST_MOST})`, more: true });
    const here = aside.filter((a) => a.compound === i);
    for (const a of here.slice(0, ASIDE_MOST)) {
      rows.push({ label: `${letter} · ${a.number}`, ...(a.energy != null && lowest != null ? { energy: kcal(a.energy, lowest) } : {}), aside: true });
    }
    if (here.length > ASIDE_MOST) rows.push({ label: `${here.length - ASIDE_MOST} more set aside`, aside: true, more: true });
  });
  return rows;
}
