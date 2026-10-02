import { structureFormula, type GroupStructure, type StructureBond } from "./ligands";
import type { SmilesAtom } from "./smiles";

/**
 * Simple formulas, read by rule as the molecules they are: Et3N, i-Pr2NEt,
 * n-BuLi, MeMgBr, Bu3SnH, TMSCl, TBSOTf, Ac2O, (Boc)2O, CH2Cl2, MeOH, NaOMe,
 * LiCl. A formula is read into groups (Me, TMS, OTf, CN, as Meno's
 * abbreviations have them) and elements, each with its count; and it is a
 * molecule where its parts make one whole, as written:
 *
 * - one element with a valence of two or more - the centre - and as many
 *   groups and univalent elements as that valence (Et3N, MeMgBr, CH2Cl2), or
 * - two groups or univalent elements and nothing else (n-BuLi, TMSCl, HCl).
 *
 * Its hydrogens are the centre's, or the other part's. Sodium, potassium,
 * rubidium and caesium are bound as ions, and lithium as one to anything
 * but carbon: NaOMe is Na⁺ and MeO⁻, and n-BuLi has its C-Li bond. A label
 * with a free valence (OMe, NMe2, CH2Br) makes no molecule, and is no such
 * formula: it stays the group it is.
 */

/** The valences the elements of such a formula have. */
const VALENCE: Record<string, number> = {
  H: 1, Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, F: 1, Cl: 1, Br: 1, I: 1,
  Be: 2, Mg: 2, Ca: 2, Sr: 2, Ba: 2, O: 2, S: 2, Se: 2, Te: 2,
  B: 3, Al: 3, Ga: 3, In: 3, N: 3, P: 3, As: 3, Sb: 3, Bi: 3,
  C: 4, Si: 4, Ge: 4, Sn: 4, Pb: 4,
};
/** Bound as ions: these always, lithium to anything but carbon. */
const IONIC = new Set(["Na", "K", "Rb", "Cs"]);

type Part = { kind: "element"; el: string } | { kind: "group"; label: string; s: GroupStructure };

/**
 * A formula's parts, each as often as its count, or null where it is not
 * read through into groups (`labels`, longest first) and the elements
 * above. A hyphen between two parts is read past (Fmoc-OSu).
 */
function partsOf(text: string, labels: readonly string[], groupOf: (label: string) => GroupStructure | null): Part[] | null {
  const out: Part[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "-" && out.length && i + 1 < text.length) {
      i++;
      continue;
    }
    let found: Part[] | null = null;
    if (text[i] === "(") {
      const j = text.indexOf(")", i);
      const inner = j > i ? partsOf(text.slice(i + 1, j), labels, groupOf) : null;
      if (!inner) return null;
      found = inner;
      i = j + 1;
    } else {
      const group = labels.find((l) => text.startsWith(l, i));
      const el = [text.slice(i, i + 2), text[i]].find((e) => e in VALENCE && text.startsWith(e, i));
      if (group && group.length >= (el?.length ?? 0)) {
        const s = groupOf(group);
        if (!s || s.attach.length !== 1) return null;
        found = [{ kind: "group", label: group, s }];
        i += group.length;
      } else if (el) {
        found = [{ kind: "element", el }];
        i += el.length;
      } else return null;
    }
    const count = /^\d+/.exec(text.slice(i));
    const n = count ? Number(count[0]) : 1;
    if (count) i += count[0].length;
    for (let k = 0; k < n; k++) out.push(...found);
  }
  return out;
}

/**
 * A simple formula as the molecule it is, and its molecular formula as its
 * name - or null for a label that is no such formula. `labels` are the
 * groups' labels, longest first; `groupOf` gives each one's structure.
 */
export function condensedStructure(
  label: string,
  labels: readonly string[],
  groupOf: (label: string) => GroupStructure | null,
): (GroupStructure & { name: string }) | null {
  const parts = partsOf(label, labels, groupOf);
  if (!parts || parts.length < 2) return null;
  const valence = (p: Part) => (p.kind === "element" ? VALENCE[p.el] : 1);
  const centres = parts.filter((p) => valence(p) > 1);
  const others = parts.filter((p) => valence(p) === 1);
  if (centres.length > 1) return null;
  if (centres.length === 1 ? others.length !== valence(centres[0]) : others.length !== 2) return null;

  const atoms: SmilesAtom[] = [];
  const bonds: StructureBond[] = [];
  /** Adds a part's atoms: the index of the one it is bound by. */
  const add = (p: Part): number => {
    if (p.kind === "element") {
      atoms.push({ el: p.el, hs: 0 });
      return atoms.length - 1;
    }
    const at = atoms.length;
    atoms.push(...p.s.atoms.map((a) => ({ ...a })));
    bonds.push(...p.s.bonds.map((b) => ({ ...b, a1: b.a1 + at, a2: b.a2 + at })));
    return p.s.attach[0] + at;
  };
  const isH = (p: Part) => p.kind === "element" && p.el === "H";
  const isMetal = (p: Part) => p.kind === "element" && (IONIC.has(p.el) || p.el === "Li");
  // the hub: the centre, or of two, the one that is not H (H2 and a hydride's H stay atoms)
  const [hub, ...rest] =
    centres.length === 1 ? [centres[0], ...others] : isH(others[0]) && !isMetal(others[1]) ? [others[1], others[0]] : others;
  const at = add(hub);
  for (const p of rest) {
    if (isH(p) && !isMetal(hub) && !(isH(hub) && rest.length === 1)) {
      // its hydrogens: the hub's own
      if (hub.kind === "element") atoms[at].hs = (atoms[at].hs ?? 0) + 1;
      continue;
    }
    const to = add(p);
    // an ion pair: the metal's charge and its partner's
    const [metal, other] = isMetal(p) ? [to, at] : isMetal(hub) ? [at, to] : [-1, -1];
    if (metal >= 0 && (IONIC.has(atoms[metal].el) || atoms[other].el !== "C")) {
      atoms[metal].charge = (atoms[metal].charge ?? 0) + 1;
      atoms[other].charge = (atoms[other].charge ?? 0) - 1;
    } else bonds.push({ a1: at, a2: to, order: 1 });
  }
  const s: GroupStructure = { atoms, bonds, attach: [] };
  return { ...s, name: structureFormula(s) };
}
