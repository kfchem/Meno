/**
 * Bond orders to draw a molecule with, aromatic bonds written out as a Kekulé
 * structure.
 *
 * A MOL file may mark a ring's bonds as aromatic (bond type 4) rather than
 * single and double. The editor draws single, double and triple bonds, so an
 * aromatic system has to be given its double bonds back: every carbon in it
 * takes exactly one, a pyrrole-type N-H or a furan O takes none, and a
 * pyridine-type N takes one when the ring needs it to. This works that out
 * without anything outside TypeScript, so a file opens the same before the
 * chemistry backend is available as after.
 *
 * Charges are not read yet, so a charged aromatic atom (pyridinium,
 * cyclopentadienide) is judged as if it were neutral. Where no assignment
 * satisfies every atom, as many carbons as possible still get their double
 * bond and the rest stay single.
 */

/** MDL bond type 4: aromatic. */
export const AROMATIC_BOND = 4;

export type KekuleAtom = { element: string };
export type KekuleBond = { a1: number; a2: number; order: number };

type Role = "needs" | "may" | "never";

/** Per bond, the order to draw it with: 1, 2 or 3. */
export function kekuleOrders(
  atoms: readonly KekuleAtom[],
  bonds: readonly KekuleBond[],
): (1 | 2 | 3)[] {
  const out: (1 | 2 | 3)[] = bonds.map((b) =>
    b.order === 2 ? 2 : b.order === 3 ? 3 : 1,
  );
  const aromatic = bonds
    .map((b, i) => (b.order === AROMATIC_BOND ? i : -1))
    .filter((i) => i >= 0);
  if (aromatic.length === 0) return out;

  const degree = new Array<number>(atoms.length).fill(0);
  const hasMultiple = new Array<boolean>(atoms.length).fill(false);
  for (const b of bonds) {
    degree[b.a1]++;
    degree[b.a2]++;
    if (b.order === 2 || b.order === 3) {
      hasMultiple[b.a1] = true;
      hasMultiple[b.a2] = true;
    }
  }
  const role = (i: number): Role => {
    if (hasMultiple[i]) return "never"; // already has its double bond, e.g. a pyridone's C=O
    const el = canonical(atoms[i]?.element ?? "");
    if (el === "C") return "needs";
    // Two connections: pyridine-like, or a pyrrole-type N-H whose H the file
    // leaves implicit. The ring decides which.
    if ((el === "N" || el === "P") && degree[i] === 2) return "may";
    return "never";
  };
  const roles = atoms.map((_, i) => role(i));

  // Candidate double bonds per atom: aromatic bonds to atoms that can take one.
  const partners = atoms.map(() => [] as { bond: number; other: number }[]);
  for (const i of aromatic) {
    const { a1, a2 } = bonds[i];
    if (roles[a1] === "never" || roles[a2] === "never") continue;
    partners[a1].push({ bond: i, other: a2 });
    partners[a2].push({ bond: i, other: a1 });
  }
  const needy = atoms
    .map((_, i) => i)
    .filter((i) => roles[i] === "needs" && partners[i].length > 0);

  const matched = new Array<number>(atoms.length).fill(-1);
  const free = (i: number) => partners[i].filter((p) => matched[p.other] < 0);
  let budget = 200_000;

  // Most constrained atom first; a partner that needs a double bond before
  // one that merely may take it, so a ring only uses its N when it has to.
  const solve = (): boolean => {
    if (--budget < 0) return false;
    let pick = -1;
    let options: { bond: number; other: number }[] = [];
    for (const a of needy) {
      if (matched[a] >= 0) continue;
      const f = free(a);
      if (f.length === 0) return false;
      if (pick < 0 || f.length < options.length) {
        pick = a;
        options = f;
      }
    }
    if (pick < 0) return true;
    options.sort(
      (p, q) =>
        Number(roles[p.other] !== "needs") - Number(roles[q.other] !== "needs"),
    );
    for (const p of options) {
      matched[pick] = p.bond;
      matched[p.other] = p.bond;
      if (solve()) return true;
      matched[pick] = -1;
      matched[p.other] = -1;
    }
    return false;
  };

  if (!solve()) {
    // Nothing satisfies every atom, or the search ran out: give as many
    // carbons as will take one a double bond, and leave the rest single.
    matched.fill(-1);
    for (const a of needy) {
      if (matched[a] >= 0) continue;
      const p = free(a).sort(
        (x, y) =>
          Number(roles[x.other] !== "needs") -
          Number(roles[y.other] !== "needs"),
      )[0];
      if (p) {
        matched[a] = p.bond;
        matched[p.other] = p.bond;
      }
    }
  }

  for (const i of aromatic) {
    const { a1, a2 } = bonds[i];
    out[i] = matched[a1] === i && matched[a2] === i ? 2 : 1;
  }
  return out;
}

function canonical(el: string): string {
  const s = el.trim();
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}
