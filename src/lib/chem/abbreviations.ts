/**
 * Abbreviations: the labels that stand for a group of atoms - Me, Ph, Boc,
 * OTBS, CO2Me - and what each stands for, so that a structure drawn with
 * them can be expanded, counted and written out whole.
 *
 * The list is Meno's own, from what organic chemists commonly write; it is
 * not taken from any program's table. IUPAC's recommendations for
 * structure diagrams (2008, GR-2.2, Table II) name the ones that may be used
 * without explanation - Me, Et, Pr, iPr, Bu, iBu, s-Bu, t-Bu, Ac, Ph, Ms,
 * Ts, Cp - marked `free` here; the rest are the protecting groups and
 * substituents of everyday use. Each structure is SMILES (./smiles), the
 * group's attachment first, after a "*".
 */
import { readSmiles, type Smiles } from "./smiles";
import { kekuleOrders } from "./kekulize";
import type { TextRun } from "./layout2d";
import { elements } from "../../utils/atomUtils";

export type Abbreviation = {
  /** How it is written when its bond comes in from the left: OTBS, CO2Me. */
  label: string;
  /** Other ways of writing the same group: TBDMS for TBS. */
  also?: string[];
  /** Its structure: SMILES starting "*", the atom it is attached by next. */
  smiles: string;
  /** What it is, in words. */
  name: string;
  /** In IUPAC's Table II: may be used without explanation. */
  free?: boolean;
};

/** Groups attached by one bond. */
const GROUPS: Abbreviation[] = [
  { label: "Me", smiles: "*C", name: "methyl", free: true },
  { label: "Et", smiles: "*CC", name: "ethyl", free: true },
  { label: "Pr", also: ["n-Pr", "nPr"], smiles: "*CCC", name: "propyl", free: true },
  { label: "iPr", also: ["i-Pr"], smiles: "*C(C)C", name: "isopropyl", free: true },
  { label: "Bu", also: ["n-Bu", "nBu"], smiles: "*CCCC", name: "butyl", free: true },
  { label: "iBu", also: ["i-Bu"], smiles: "*CC(C)C", name: "isobutyl", free: true },
  { label: "s-Bu", also: ["sBu", "sec-Bu"], smiles: "*C(C)CC", name: "sec-butyl", free: true },
  { label: "t-Bu", also: ["tBu", "tert-Bu"], smiles: "*C(C)(C)C", name: "tert-butyl", free: true },
  { label: "Ac", smiles: "*C(C)=O", name: "acetyl", free: true },
  { label: "Ph", smiles: "*c1ccccc1", name: "phenyl", free: true },
  { label: "Ms", smiles: "*S(=O)(=O)C", name: "methanesulfonyl (mesyl)", free: true },
  { label: "Ts", smiles: "*S(=O)(=O)c1ccc(C)cc1", name: "4-toluenesulfonyl (tosyl)", free: true },
  { label: "Cp", smiles: "*C1C=CC=C1", name: "cyclopentadienyl", free: true },
  { label: "Bn", smiles: "*Cc1ccccc1", name: "benzyl" },
  // (IUPAC discourages Bz, once used for benzyl too; it is benzoyl here)
  { label: "Bz", smiles: "*C(=O)c1ccccc1", name: "benzoyl" },
  { label: "Piv", smiles: "*C(=O)C(C)(C)C", name: "pivaloyl" },
  { label: "Boc", smiles: "*C(=O)OC(C)(C)C", name: "tert-butoxycarbonyl" },
  { label: "Cbz", also: ["Z"], smiles: "*C(=O)OCc1ccccc1", name: "benzyloxycarbonyl" },
  { label: "Fmoc", smiles: "*C(=O)OCC1c2ccccc2-c2ccccc21", name: "9-fluorenylmethoxycarbonyl" },
  { label: "Alloc", smiles: "*C(=O)OCC=C", name: "allyloxycarbonyl" },
  { label: "Troc", smiles: "*C(=O)OCC(Cl)(Cl)Cl", name: "2,2,2-trichloroethoxycarbonyl" },
  { label: "Teoc", smiles: "*C(=O)OCC[Si](C)(C)C", name: "2-(trimethylsilyl)ethoxycarbonyl" },
  { label: "Tf", smiles: "*S(=O)(=O)C(F)(F)F", name: "trifluoromethanesulfonyl (triflyl)" },
  { label: "Ns", smiles: "*S(=O)(=O)c1ccccc1[N+](=O)[O-]", name: "2-nitrobenzenesulfonyl (nosyl)" },
  { label: "TMS", smiles: "*[Si](C)(C)C", name: "trimethylsilyl" },
  { label: "TES", smiles: "*[Si](CC)(CC)CC", name: "triethylsilyl" },
  { label: "TBS", also: ["TBDMS"], smiles: "*[Si](C)(C)C(C)(C)C", name: "tert-butyldimethylsilyl" },
  { label: "TIPS", smiles: "*[Si](C(C)C)(C(C)C)C(C)C", name: "triisopropylsilyl" },
  { label: "TBDPS", smiles: "*[Si](c1ccccc1)(c1ccccc1)C(C)(C)C", name: "tert-butyldiphenylsilyl" },
  { label: "PMB", also: ["MPM"], smiles: "*Cc1ccc(OC)cc1", name: "4-methoxybenzyl" },
  { label: "MOM", smiles: "*COC", name: "methoxymethyl" },
  { label: "MEM", smiles: "*COCCOC", name: "(2-methoxyethoxy)methyl" },
  { label: "SEM", smiles: "*COCC[Si](C)(C)C", name: "[2-(trimethylsilyl)ethoxy]methyl" },
  { label: "THP", smiles: "*C1CCCCO1", name: "tetrahydropyran-2-yl" },
  { label: "Tr", also: ["Trt"], smiles: "*C(c1ccccc1)(c1ccccc1)c1ccccc1", name: "triphenylmethyl (trityl)" },
  { label: "Cy", smiles: "*C1CCCCC1", name: "cyclohexyl" },
  { label: "Mes", smiles: "*c1c(C)cc(C)cc1C", name: "2,4,6-trimethylphenyl (mesityl)" },
  { label: "Tol", also: ["p-Tol"], smiles: "*c1ccc(C)cc1", name: "4-methylphenyl (p-tolyl)" },
  { label: "Bpin", smiles: "*B1OC(C)(C)C(C)(C)O1", name: "pinacolatoboryl" },
];

/** Contracted labels written out letter by letter, and some that are not O, S or NH and a group. */
const CONTRACTED: Abbreviation[] = [
  { label: "CO2H", also: ["COOH"], smiles: "*C(=O)O", name: "carboxy" },
  { label: "CHO", smiles: "*C=O", name: "formyl" },
  { label: "CN", smiles: "*C#N", name: "cyano" },
  { label: "NO2", smiles: "*[N+](=O)[O-]", name: "nitro" },
  { label: "N3", smiles: "*N=[N+]=[N-]", name: "azido" },
  { label: "CF3", smiles: "*C(F)(F)F", name: "trifluoromethyl" },
  { label: "CCl3", smiles: "*C(Cl)(Cl)Cl", name: "trichloromethyl" },
  { label: "CONH2", smiles: "*C(N)=O", name: "carbamoyl" },
  { label: "SO3H", smiles: "*S(=O)(=O)O", name: "sulfo" },
  { label: "NMe2", smiles: "*N(C)C", name: "dimethylamino" },
  { label: "NEt2", smiles: "*N(CC)CC", name: "diethylamino" },
  { label: "NHNH2", smiles: "*NN", name: "hydrazinyl" },
];

/**
 * A group behind O, S or NH (OTBS, SPh, NHBoc), and an alkyl, benzyl or
 * phenyl ester (CO2Me): written as the letters and the group's label, and
 * its structure the atom or atoms they name, then the group's.
 */
function composed(): Abbreviation[] {
  const out: Abbreviation[] = [];
  const behind = (prefix: string, smiles: string, word: string, groups: Abbreviation[]) => {
    for (const g of groups) {
      out.push({
        label: prefix + g.label,
        ...(g.also ? { also: g.also.map((a) => prefix + a) } : {}),
        smiles: smiles + g.smiles.slice(1),
        name: `${g.name}${word}`,
      });
    }
  };
  behind("O", "*O", "oxy", GROUPS);
  behind("S", "*S", "sulfanyl", GROUPS);
  behind("NH", "*N", "amino", GROUPS);
  const esters = GROUPS.filter((g) => ["Me", "Et", "Pr", "iPr", "Bu", "t-Bu", "Bn", "Ph"].includes(g.label));
  behind("CO2", "*C(=O)O", "oxycarbonyl", esters);
  return out;
}

export const ABBREVIATIONS: Abbreviation[] = [...GROUPS, ...CONTRACTED, ...composed()];

const BY_LABEL = new Map<string, Abbreviation>();
for (const a of ABBREVIATIONS) {
  for (const l of [a.label, ...(a.also ?? [])]) if (!BY_LABEL.has(l)) BY_LABEL.set(l, a);
}

/** The abbreviation a label is, as written (OTBS, or OTBDMS), or none. */
export function abbreviationOf(label: string): Abbreviation | undefined {
  return BY_LABEL.get(label.trim());
}

/**
 * The structure an abbreviation stands for: its atoms and bonds, an
 * aromatic ring's in Kekulé form, without the "*" - and which atom it is
 * attached by.
 */
export function abbreviationStructure(label: string): (Smiles & { attach: number }) | null {
  const a = abbreviationOf(label);
  if (!a) return null;
  const read = readSmiles(a.smiles);
  const star = read.atoms.findIndex((x) => x.el === "*");
  const orders = kekuleOrders(read.atoms, read.bonds);
  const keep = read.atoms.map((_, i) => i).filter((i) => i !== star);
  const index = new Map(keep.map((old, i) => [old, i]));
  let attach = 0;
  const bonds: Smiles["bonds"] = [];
  read.bonds.forEach((b, i) => {
    if (b.a1 === star || b.a2 === star) {
      attach = index.get(b.a1 === star ? b.a2 : b.a1) ?? 0;
      return;
    }
    bonds.push({ a1: index.get(b.a1)!, a2: index.get(b.a2)!, order: orders[i] });
  });
  return {
    atoms: keep.map((i) => {
      const { aromatic: _aromatic, ...atom } = read.atoms[i];
      return atom;
    }),
    bonds,
    attach,
  };
}

// --- writing a label ---------------------------------------------------------

const ELEMENTS = new Set(elements.map((e) => e.symbol));
/**
 * What a label is read into: the groups the abbreviations name, longest
 * first - and "pin", for pinacolato - before element symbols.
 */
const UNITS = [...new Set([...GROUPS.flatMap((g) => [g.label, ...(g.also ?? [])]), "pin"])]
  // (Bpin is B and pin, and so on the left pinB)
  .filter((u) => u.length > 1 && u !== "Bpin")
  .sort((x, y) => y.length - x.length);

/**
 * A label's units, as a chemist reads it: each element or group with its
 * count - CO2Me is C, O2, Me - parentheses with what they hold, and any
 * other character on its own.
 */
export function labelUnits(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let unit = "";
    if (text[i] === "(") {
      // a parenthesis and what it holds, and its count, as one unit
      let depth = 0;
      let j = i;
      for (; j < text.length; j++) {
        if (text[j] === "(") depth++;
        if (text[j] === ")" && --depth === 0) break;
      }
      unit = text.slice(i, j + 1);
    } else {
      unit =
        UNITS.find((u) => text.startsWith(u, i)) ??
        (ELEMENTS.has(text.slice(i, i + 2)) && /[a-z]/.test(text[i + 1] ?? "") ? text.slice(i, i + 2) : text[i]);
    }
    i += unit.length;
    // its count
    const count = /^\d+/.exec(text.slice(i));
    if (count) {
      unit += count[0];
      i += count[0].length;
    }
    out.push(unit);
  }
  return out;
}

/**
 * A label as written when its bond comes in from the right: read outward
 * from the bond, each unit keeping its count (IUPAC GR-2.3) - OTBS as TBSO,
 * CO2Me as MeO2C, NHBoc as BocHN - and what parentheses hold the same way.
 */
export function reversedLabel(text: string): string {
  return labelUnits(text)
    .reverse()
    .map((u) => {
      const m = /^\((.*)\)(\d*)$/.exec(u);
      return m ? `(${reversedLabel(m[1])})${m[2]}` : u;
    })
    .join("");
}

/**
 * A label's runs for the drawing: the counts after an element, a group or a
 * parenthesis set as subscripts (CO2Me, CH(CH3)2), and a sign at its end as
 * a superscript charge (NMe3+: the 3 is the methyls' count).
 */
export function labelRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const charge = /[+−-]$/.exec(text);
  const body = charge && text.length > charge[0].length ? text.slice(0, -charge[0].length) : text;
  const push = (t: string, sub = false) => {
    const last = runs[runs.length - 1];
    if (last && !!last.sub === sub && !last.sup) last.text += t;
    else runs.push(sub ? { text: t, sub: true } : { text: t });
  };
  for (const unit of labelUnits(body)) {
    const group = /^\((.*)\)(\d*)$/.exec(unit);
    if (group) {
      // what a parenthesis holds, set the same way
      push("(");
      for (const r of labelRuns(group[1])) push(r.text, !!r.sub);
      push(")");
      if (group[2]) push(group[2], true);
      continue;
    }
    const m = /^(.*?)(\d+)$/.exec(unit);
    // (a count after something, not a label that is a number)
    if (m && m[1]) {
      push(m[1]);
      push(m[2], true);
    } else push(unit);
  }
  if (charge && body !== text) runs.push({ text: charge[0].replace("-", "−"), sup: true });
  return runs;
}
