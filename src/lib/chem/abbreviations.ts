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
 *
 * The list holds groups and contracted labels only. What is written by
 * putting them together is read by rule, not listed: a group behind O, S
 * or NH (OTBS, SPh, NHBoc), an ester (CO2Me), and a substituted aryl group
 * (2,6-diMeBz, 4-MeOC6H4: ./substitutedAryl).
 */
import { readSmiles, type Smiles } from "./smiles";
import { substitutedAryl } from "./substitutedAryl";
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
  { label: "Ph", also: ["C6H5"], smiles: "*c1ccccc1", name: "phenyl", free: true },
  { label: "Ms", smiles: "*S(=O)(=O)C", name: "methanesulfonyl (mesyl)", free: true },
  { label: "Ts", also: ["p-Ts"], smiles: "*S(=O)(=O)c1ccc(C)cc1", name: "4-toluenesulfonyl (tosyl)", free: true },
  // (IUPAC: only where it is bonded to a metal - and so never behind O, S or NH here)
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
  { label: "C6F5", smiles: "*c1c(F)c(F)c(F)c(F)c1F", name: "pentafluorophenyl" },
];

/** The dictionary: groups, then contracted labels. */
export const ABBREVIATIONS: Abbreviation[] = [...GROUPS, ...CONTRACTED];

const BY_LABEL = new Map<string, Abbreviation>();
for (const a of ABBREVIATIONS) {
  for (const l of [a.label, ...(a.also ?? [])]) if (!BY_LABEL.has(l)) BY_LABEL.set(l, a);
}
const GROUP_LABELS = new Set(GROUPS.flatMap((g) => [g.label, ...(g.also ?? [])]));

/**
 * How labels are put together from a group, by rule: the letters written
 * before it, the atoms they stand for, and the word its name takes. A
 * group behind O, S or NH may be any group or contracted label but Cp
 * (bonded to a metal only, IUPAC GR-2.2) and the hydrazinyl; an ester's
 * any group.
 */
const COMPOSED: { prefix: string; smiles: string; word: string; takes: (a: Abbreviation) => boolean }[] = [
  { prefix: "CO2", smiles: "*C(=O)O", word: "oxycarbonyl", takes: (a) => GROUP_LABELS.has(a.label) && a.label !== "Cp" },
  { prefix: "NH", smiles: "*N", word: "amino", takes: (a) => a.label !== "Cp" && a.label !== "NHNH2" },
  { prefix: "O", smiles: "*O", word: "oxy", takes: (a) => a.label !== "Cp" && a.label !== "NHNH2" },
  { prefix: "S", smiles: "*S", word: "sulfanyl", takes: (a) => a.label !== "Cp" && a.label !== "NHNH2" },
];

/** A label put together by rule (OTBS, NHBoc, CO2Me, 2,6-diMeBz), or none. */
function composedOf(label: string): Abbreviation | undefined {
  const aryl = substitutedAryl(label);
  if (aryl) return { label, smiles: aryl.smiles, name: aryl.name };
  for (const c of COMPOSED) {
    if (!label.startsWith(c.prefix) || label.length === c.prefix.length) continue;
    const g = BY_LABEL.get(label.slice(c.prefix.length));
    if (!g || !c.takes(g)) continue;
    // (named by the group's own label: OTBDMS is OTBS)
    const own = c.prefix + g.label;
    return { label: own, ...(own !== label ? { also: [label] } : {}), smiles: c.smiles + g.smiles.slice(1), name: `${g.name}${c.word}` };
  }
  return undefined;
}

const COMPOSED_SEEN = new Map<string, Abbreviation | undefined>();

/**
 * The abbreviation a label is, as written (OTBS, or OTBDMS): the
 * dictionary's, or one put together by rule. None, for any other.
 */
export function abbreviationOf(label: string): Abbreviation | undefined {
  const l = label.trim();
  const listed = BY_LABEL.get(l);
  if (listed) return listed;
  if (!COMPOSED_SEEN.has(l)) COMPOSED_SEEN.set(l, composedOf(l));
  return COMPOSED_SEEN.get(l);
}

/**
 * Whether a label names its ring's substituents before the ring - 2,6-diMeBz,
 * 4-MeOC6H4 - and so is attached at its end as written: it is not read
 * outward, whichever side its bond comes in from.
 */
export function namesRingFirst(label: string): boolean {
  return substitutedAryl(label.trim()) != null;
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
    // its count - after a letter or a parenthesis, not a ring's position (2,6-)
    const count = /[A-Za-z)]$/.test(unit) ? /^\d+/.exec(text.slice(i)) : null;
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
 * The prefixes set in italics, as IUPAC's Table II sets them and names have
 * them: n-, s-, t-, sec-, tert- and i- before a hyphen (t-Bu, but iPr
 * upright, as isopropyl is), and o-, m-, p- (p-Ts, p-MeOPh).
 */
const ITALIC_PREFIX = /^(sec|tert|[nistomp])$/;

/** Which of a label's units are such a prefix: on its own, before a hyphen. */
export function italicUnits(units: readonly string[]): boolean[] {
  return units.map((u, k) => ITALIC_PREFIX.test(u) && (units[k + 1] ?? "").startsWith("-"));
}

/**
 * A label's runs for the drawing: the counts after an element, a group or a
 * parenthesis set as subscripts (CO2Me, CH(CH3)2), a prefix such as the t
 * of t-Bu in italics, and a sign at its end as a superscript charge (NMe3+:
 * the 3 is the methyls' count).
 */
export function labelRuns(text: string): TextRun[] {
  const charge = /[+−-]$/.exec(text);
  const body = charge && text.length > charge[0].length ? text.slice(0, -charge[0].length) : text;
  const units = labelUnits(body);
  const runs = unitRuns(units, italicUnits(units));
  if (charge && body !== text) runs.push({ text: charge[0].replace("-", "−"), sup: true });
  return runs;
}

/** The runs `units` are set in, those `italic` marks in italics. */
export function unitRuns(units: readonly string[], italic: readonly boolean[] = []): TextRun[] {
  const runs: TextRun[] = [];
  const push = (t: string, sub = false, it = false) => {
    const last = runs[runs.length - 1];
    if (last && !!last.sub === sub && !!last.italic === it && !last.sup) last.text += t;
    else runs.push({ text: t, ...(sub ? { sub: true } : {}), ...(it ? { italic: true } : {}) });
  };
  units.forEach((unit, k) => {
    if (italic[k]) return push(unit, false, true);
    const group = /^\((.*)\)(\d*)$/.exec(unit);
    if (group) {
      // what a parenthesis holds, set the same way
      push("(");
      for (const r of labelRuns(group[1])) push(r.text, !!r.sub, !!r.italic);
      push(")");
      if (group[2]) push(group[2], true);
      return;
    }
    // a group's own prefix: the t of t-Bu, the p of p-Ts
    const prefixed = /^(sec|tert|[nistomp])(-.+)$/.exec(unit);
    if (prefixed) {
      push(prefixed[1], false, true);
      unit = prefixed[2];
    }
    const m = /^(.*?)(\d+)$/.exec(unit);
    // (a count after something, not a label that is a number)
    if (m && m[1]) {
      push(m[1]);
      push(m[2], true);
    } else push(unit);
  });
  return runs;
}
