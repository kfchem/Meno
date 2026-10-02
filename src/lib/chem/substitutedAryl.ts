/**
 * Substituted aryl labels, read as a chemist writes them: the positions on
 * the ring, a multiplying prefix and the substituent, then the group the
 * ring belongs to - 2,6-diMeBz, 4-MeOPh, p-ClBn - or the ring written as a
 * formula, its substituents before it with their counts - 4-MeOC6H4,
 * 2,6-Me2C6H3, 3,5-(CF3)2C6H3. Positions count from the ring atom the group
 * is attached by (1); o-, m- and p- are 2, 3 and 4.
 *
 * Meno's own grammar, after the way such labels are commonly written. IUPAC
 * (GR-2.2) lets abbreviations such as these be used where they are defined,
 * as they are not in its Table II; this reads them as the structure they
 * spell out.
 */

/** A substituent as it may be written before a ring, and what it is. */
type Substituent = { forms: string[]; smiles: string; name: string };

const SUBSTITUENTS: Substituent[] = [
  { forms: ["Me"], smiles: "C", name: "methyl" },
  { forms: ["Et"], smiles: "CC", name: "ethyl" },
  { forms: ["iPr", "i-Pr"], smiles: "C(C)C", name: "isopropyl" },
  { forms: ["t-Bu", "tBu"], smiles: "C(C)(C)C", name: "tert-butyl" },
  { forms: ["Ph"], smiles: "-c2ccccc2", name: "phenyl" },
  { forms: ["F"], smiles: "F", name: "fluoro" },
  { forms: ["Cl"], smiles: "Cl", name: "chloro" },
  { forms: ["Br"], smiles: "Br", name: "bromo" },
  { forms: ["I"], smiles: "I", name: "iodo" },
  { forms: ["CF3", "F3C"], smiles: "C(F)(F)F", name: "trifluoromethyl" },
  { forms: ["OMe", "MeO"], smiles: "OC", name: "methoxy" },
  { forms: ["OEt", "EtO"], smiles: "OCC", name: "ethoxy" },
  { forms: ["OCF3", "F3CO"], smiles: "OC(F)(F)F", name: "trifluoromethoxy" },
  { forms: ["OH", "HO"], smiles: "O", name: "hydroxy" },
  { forms: ["OAc", "AcO"], smiles: "OC(C)=O", name: "acetoxy" },
  { forms: ["OBn", "BnO"], smiles: "OCc2ccccc2", name: "benzyloxy" },
  { forms: ["NO2", "O2N"], smiles: "[N+](=O)[O-]", name: "nitro" },
  { forms: ["CN", "NC"], smiles: "C#N", name: "cyano" },
  { forms: ["NH2", "H2N"], smiles: "N", name: "amino" },
  { forms: ["NMe2", "Me2N"], smiles: "N(C)C", name: "dimethylamino" },
  { forms: ["NHAc", "AcNH", "AcHN"], smiles: "NC(C)=O", name: "acetamido" },
  { forms: ["SMe", "MeS"], smiles: "SC", name: "methylsulfanyl" },
  { forms: ["Ac"], smiles: "C(C)=O", name: "acetyl" },
  { forms: ["CO2Me", "MeO2C"], smiles: "C(=O)OC", name: "methoxycarbonyl" },
];

/** The substituents a substituted aryl group may have, each as first written and its name: for a list of them. */
export const ARYL_SUBSTITUENTS = SUBSTITUENTS.map((s) => ({ label: s.forms[0], name: s.name }));

/** Every way a substituent is written, longest first, so that OMe is not O and Me. */
const FORMS = SUBSTITUENTS.flatMap((s) => s.forms.map((form) => ({ form, s }))).sort(
  (a, b) => b.form.length - a.form.length,
);

const MULTIPLIERS: Record<string, number> = { di: 2, tri: 3, tetra: 4, penta: 5 };
const MULTIPLIER_NAMES = ["", "", "di", "tri", "tetra", "penta"];
const SIDE: Record<string, number> = { o: 2, m: 3, p: 4 };

/** The groups a substituted ring belongs to: how each is attached, and its name. */
const PARENTS: Record<string, { link: string; name: string }> = {
  Ph: { link: "", name: "phenyl" },
  Bz: { link: "C(=O)", name: "benzoyl" },
  Bn: { link: "C", name: "benzyl" },
};

/** A substituted aryl group: its structure (SMILES, "*" first) and its name. */
export type SubstitutedAryl = { smiles: string; name: string };

type Placed = { at: number[]; s: Substituent };

/**
 * What a label spells out as a substituted aryl group, or null where it is
 * not one: positions out of the ring or given twice, counts that do not
 * match the positions, or a formula's hydrogens that do not add up.
 */
export function substitutedAryl(label: string): SubstitutedAryl | null {
  const text = label.trim();
  // the ring as a formula, its substituents with their counts before it
  const formula = /^(.*?)C6H(\d)$/.exec(text);
  if (formula) return fromFormula(formula[1], Number(formula[2]));
  for (const [key, parent] of Object.entries(PARENTS)) {
    if (!text.endsWith(key) || text.length === key.length) continue;
    const placed = prefixes(text.slice(0, -key.length));
    if (placed) return built(placed, parent.link, parent.name);
  }
  return null;
}

/** Substituents written before a group: "2,6-diMe", "4-MeO-3-NO2", "p-Cl". */
function prefixes(text: string): Placed[] | null {
  const out: Placed[] = [];
  let i = 0;
  while (i < text.length) {
    if (out.length && text[i] === "-") i++;
    const pos = /^(?:(\d(?:,\d)*)|([omp]))-/.exec(text.slice(i));
    if (!pos) return null;
    i += pos[0].length;
    const at = pos[1] ? pos[1].split(",").map(Number) : [SIDE[pos[2]]];
    const mult = /^(di|tri|tetra|penta)/.exec(text.slice(i));
    if (mult) i += mult[0].length;
    const sub = substituentAt(text, i);
    if (!sub) return null;
    i = sub.end;
    // a count after it, or after it in parentheses: 3,5-(CF3)2
    const count = /^\d/.exec(text.slice(i));
    if (count) i += 1;
    const n = mult ? MULTIPLIERS[mult[1]] : count ? Number(count[0]) : 1;
    if (n !== at.length || (mult && count)) return null;
    out.push({ at, s: sub.s });
  }
  return out.length ? out : null;
}

/** The substituent written at `i`, in parentheses or not, and where it ends. */
function substituentAt(text: string, i: number): { s: Substituent; end: number } | null {
  const paren = text[i] === "(";
  const from = paren ? i + 1 : i;
  const hit = FORMS.find((f) => text.startsWith(f.form, from));
  if (!hit) return null;
  let end = from + hit.form.length;
  if (paren) {
    if (text[end] !== ")") return null;
    end++;
  }
  return { s: hit.s, end };
}

/** "4-MeO", "2,6-Me2", "3,5-(CF3)2", with a ring of `hydrogens` left. */
function fromFormula(before: string, hydrogens: number): SubstitutedAryl | null {
  // each substituent with its positions, one after another: 4-MeO, 2,6-Me2
  const placed: Placed[] = [];
  let i = 0;
  while (i < before.length) {
    if (placed.length && before[i] === "-") i++;
    const pos = /^(?:(\d(?:,\d)*)|([omp]))-/.exec(before.slice(i));
    if (!pos) return null;
    i += pos[0].length;
    const at = pos[1] ? pos[1].split(",").map(Number) : [SIDE[pos[2]]];
    const sub = substituentAt(before, i);
    if (!sub) return null;
    i = sub.end;
    const count = /^\d/.exec(before.slice(i));
    if (count) i += 1;
    if ((count ? Number(count[0]) : 1) !== at.length) return null;
    placed.push({ at, s: sub.s });
  }
  if (!placed.length) return null;
  const substituted = placed.reduce((n, p) => n + p.at.length, 0);
  if (substituted + hydrogens !== 5) return null;
  return built(placed, "", "phenyl");
}

/** The structure and name of a ring with `placed` on it, attached by `link`. */
function built(placed: Placed[], link: string, parentName: string): SubstitutedAryl | null {
  const on = new Map<number, Substituent>();
  for (const p of placed) {
    for (const k of p.at) {
      if (k < 2 || k > 6 || on.has(k)) return null;
      on.set(k, p.s);
    }
  }
  const ring = [2, 3, 4, 5, 6]
    .map((k) => {
      const s = on.get(k);
      const closure = k === 6 ? "1" : "";
      return s ? `c${closure}(${s.smiles})` : `c${closure}`;
    })
    .join("");
  // named in alphabetical order of the substituents, as IUPAC names are
  const parts = placed
    .map((p) => ({ name: p.s.name, text: `${[...p.at].sort().join(",")}-${MULTIPLIER_NAMES[p.at.length]}${p.s.name}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { smiles: `*${link}c1${ring}`, name: parts.map((p) => p.text).join("-") + parentName };
}
