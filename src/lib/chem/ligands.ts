import { kekuleOrders } from "./kekulize";
import { implicitHydrogens } from "./molecule";
import { readSmiles, type SmilesAtom, type SmilesBond } from "./smiles";
import { elements } from "../../utils/atomUtils";

/**
 * The ligands of transition-metal chemistry, and the complexes written with
 * them - Pd(PPh3)4, Pd2(dba)3, PdCl2(dppf), [Ir(cod)Cl]2, [Rh(cod)2]BF4 -
 * read as the structures they stand for.
 *
 * Meno's own list, from what chemists commonly write. Each ligand is the
 * molecule it is, in SMILES, its donor atoms marked by atom class: [P:1],
 * [P:2] for a chelating diphosphine; several atoms of one class for a pi
 * system bound through all of them (η²: cod's two C=C, η⁵: Cp*). A donor is
 * neutral (an L ligand, bound by a coordination bond from it to the metal)
 * unless it is listed as anionic (an X ligand, bound by a covalent bond),
 * and a ligand written as an anion (Cp*⁻) leaves its charge on the metal it
 * is bound to.
 */

/** A bond of a group's structure: as in SMILES, and a coordination bond or a haptic one. */
export type StructureBond = SmilesBond & {
  /** A coordination bond, from `a1`, the donor, to `a2`. */
  coordination?: boolean;
  /** A haptic bond's pi system: from the metal (`a1`) to a star (`a2`) at its centre. */
  endpoints?: number[];
  attach?: "all";
};

/**
 * What a label stands for, as atoms and bonds (Kekulé): where it is attached
 * (`attach`: an atom, or the star at the centre of a pi system bound through
 * all its atoms - `haptic` says which), and its stars' pi systems. A group
 * is attached by one atom; a chelating ligand by several; a complex by none.
 */
export type GroupStructure = {
  atoms: SmilesAtom[];
  bonds: StructureBond[];
  attach: number[];
  haptic?: { star: number; atoms: number[] }[];
};

export type Ligand = {
  label: string;
  also?: string[];
  name: string;
  /** The ligand, its donors marked by atom class. */
  smiles: string;
  /** The donor classes that bind as anions (X), by covalent bonds. */
  anionic?: number[];
  /** A metal inside the ligand and the pi systems bound to it - dppf's iron: [metal class, ring class]. */
  inner?: [number, number][];
  /** Written as a formula, PPh3 or MeCN, not as a name: read into its elements when a label is written. */
  formula?: boolean;
  /** Read only inside a complex's formula: CO, H2O, NH3 mean other things on their own. */
  inComplex?: boolean;
};

// (ring number 9, used nowhere else: a phenyl written inside a ring that
// is open must not close it)
const PH = "c9ccccc9";
const CY = "C9CCCCC9";
const TBU = "C(C)(C)C";

export const LIGANDS: Ligand[] = [
  // --- phosphines, arsines and phosphites -----------------------------------
  { label: "PPh3", also: ["Ph3P"], smiles: `[P:1](${PH})(${PH})${PH}`, name: "triphenylphosphine", formula: true },
  { label: "PCy3", also: ["Cy3P"], smiles: `[P:1](${CY})(${CY})${CY}`, name: "tricyclohexylphosphine", formula: true },
  { label: "P(t-Bu)3", also: ["PtBu3", "P(tBu)3", "t-Bu3P", "tBu3P"], smiles: `[P:1](${TBU})(${TBU})${TBU}`, name: "tri-tert-butylphosphine", formula: true },
  { label: "P(o-Tol)3", also: ["P(o-tol)3", "(o-Tol)3P"], smiles: "[P:1](c1ccccc1C)(c1ccccc1C)c1ccccc1C", name: "tri(o-tolyl)phosphine", formula: true },
  { label: "PMe3", also: ["Me3P"], smiles: "[P:1](C)(C)C", name: "trimethylphosphine", formula: true },
  { label: "PEt3", also: ["Et3P"], smiles: "[P:1](CC)(CC)CC", name: "triethylphosphine", formula: true },
  { label: "PBu3", also: ["P(n-Bu)3", "Bu3P"], smiles: "[P:1](CCCC)(CCCC)CCCC", name: "tributylphosphine", formula: true },
  { label: "P(OPh)3", also: ["(PhO)3P"], smiles: `[P:1](O${PH})(O${PH})O${PH}`, name: "triphenyl phosphite", formula: true },
  { label: "P(OMe)3", also: ["(MeO)3P"], smiles: "[P:1](OC)(OC)OC", name: "trimethyl phosphite", formula: true },
  { label: "TFP", also: ["P(2-furyl)3"], smiles: "[P:1](c1ccco1)(c1ccco1)c1ccco1", name: "tri(2-furyl)phosphine" },
  { label: "AsPh3", also: ["Ph3As"], smiles: `[As:1](${PH})(${PH})${PH}`, name: "triphenylarsine", formula: true },
  // biaryl phosphines
  { label: "XPhos", smiles: `[P:1](${CY})(${CY})c1ccccc1-c1c(C(C)C)cc(C(C)C)cc1C(C)C`, name: "2-dicyclohexylphosphino-2',4',6'-triisopropylbiphenyl" },
  { label: "SPhos", smiles: `[P:1](${CY})(${CY})c1ccccc1-c1c(OC)cccc1OC`, name: "2-dicyclohexylphosphino-2',6'-dimethoxybiphenyl" },
  { label: "RuPhos", smiles: `[P:1](${CY})(${CY})c1ccccc1-c1c(OC(C)C)cccc1OC(C)C`, name: "2-dicyclohexylphosphino-2',6'-diisopropoxybiphenyl" },
  { label: "BrettPhos", smiles: `[P:1](${CY})(${CY})c1c(OC)ccc(OC)c1-c1c(C(C)C)cc(C(C)C)cc1C(C)C`, name: "2-dicyclohexylphosphino-3,6-dimethoxy-2',4',6'-triisopropylbiphenyl" },
  { label: "tBuXPhos", also: ["t-BuXPhos"], smiles: `[P:1](${TBU})(${TBU})c1ccccc1-c1c(C(C)C)cc(C(C)C)cc1C(C)C`, name: "2-di-tert-butylphosphino-2',4',6'-triisopropylbiphenyl" },
  { label: "DavePhos", smiles: `[P:1](${CY})(${CY})c1ccccc1-c1ccccc1N(C)C`, name: "2-dicyclohexylphosphino-2'-(dimethylamino)biphenyl" },
  { label: "JohnPhos", smiles: `[P:1](${TBU})(${TBU})c1ccccc1-c1ccccc1`, name: "(2-biphenyl)di-tert-butylphosphine" },
  // chelating diphosphines
  { label: "dppm", smiles: `[P:1](${PH})(${PH})C[P:2](${PH})${PH}`, name: "1,1-bis(diphenylphosphino)methane" },
  { label: "dppe", smiles: `[P:1](${PH})(${PH})CC[P:2](${PH})${PH}`, name: "1,2-bis(diphenylphosphino)ethane" },
  { label: "dppp", smiles: `[P:1](${PH})(${PH})CCC[P:2](${PH})${PH}`, name: "1,3-bis(diphenylphosphino)propane" },
  { label: "dppb", smiles: `[P:1](${PH})(${PH})CCCC[P:2](${PH})${PH}`, name: "1,4-bis(diphenylphosphino)butane" },
  {
    label: "dppf",
    // ferrocene as its iron(II) and two cyclopentadienides, each ring bound to the iron through all five atoms
    smiles: `[Fe+2:9].[C-:7]1([P:1](${PH})${PH})[CH:7]=[CH:7][CH:7]=[CH:7]1.[C-:8]1([P:2](${PH})${PH})[CH:8]=[CH:8][CH:8]=[CH:8]1`,
    inner: [
      [9, 7],
      [9, 8],
    ],
    name: "1,1'-bis(diphenylphosphino)ferrocene",
  },
  { label: "BINAP", smiles: `[P:1](${PH})(${PH})c1ccc2ccccc2c1-c1c([P:2](${PH})${PH})ccc2ccccc12`, name: "2,2'-bis(diphenylphosphino)-1,1'-binaphthyl" },
  { label: "Xantphos", smiles: `CC1(C)c2cccc([P:1](${PH})${PH})c2Oc2c([P:2](${PH})${PH})cccc21`, name: "4,5-bis(diphenylphosphino)-9,9-dimethylxanthene" },
  { label: "DPEphos", smiles: `[P:1](${PH})(${PH})c1ccccc1Oc1ccccc1[P:2](${PH})${PH}`, name: "bis[2-(diphenylphosphino)phenyl] ether" },
  // N donors
  { label: "bpy", also: ["bipy"], smiles: "c1cc[n:1]c(c1)-c1cccc[n:2]1", name: "2,2'-bipyridine" },
  { label: "dtbpy", also: ["dtbbpy"], smiles: "CC(C)(C)c1cc[n:1]c(c1)-c1cc(C(C)(C)C)cc[n:2]1", name: "4,4'-di-tert-butyl-2,2'-bipyridine" },
  { label: "phen", smiles: "c1c[n:1]c2c(c1)ccc1ccc[n:2]c12", name: "1,10-phenanthroline" },
  { label: "py", smiles: "c1cc[n:1]cc1", name: "pyridine" },
  { label: "TMEDA", smiles: "C[N:1](C)CC[N:2](C)C", name: "N,N,N',N'-tetramethylethylenediamine" },
  { label: "en", smiles: "[NH2:1]CC[NH2:2]", name: "ethylenediamine" },
  { label: "MeCN", also: ["CH3CN"], smiles: "CC#[N:1]", name: "acetonitrile", formula: true },
  { label: "NH3", smiles: "[NH3:1]", name: "ammonia", formula: true, inComplex: true },
  // N-heterocyclic carbenes, bound by their carbene carbon
  { label: "IPr", smiles: "CC(C)c1cccc(C(C)C)c1N1C=CN(c2c(C(C)C)cccc2C(C)C)[C:1]1", name: "1,3-bis(2,6-diisopropylphenyl)imidazol-2-ylidene" },
  { label: "IMes", smiles: "Cc1cc(C)c(N2C=CN(c3c(C)cc(C)cc3C)[C:1]2)c(C)c1", name: "1,3-bis(2,4,6-trimethylphenyl)imidazol-2-ylidene" },
  { label: "SIPr", smiles: "CC(C)c1cccc(C(C)C)c1N1CCN(c2c(C(C)C)cccc2C(C)C)[C:1]1", name: "1,3-bis(2,6-diisopropylphenyl)imidazolidin-2-ylidene" },
  { label: "SIMes", smiles: "Cc1cc(C)c(N2CCN(c3c(C)cc(C)cc3C)[C:1]2)c(C)c1", name: "1,3-bis(2,4,6-trimethylphenyl)imidazolidin-2-ylidene" },
  // pi ligands
  { label: "cod", also: ["COD"], smiles: "C1C[CH:1]=[CH:1]CC[CH:2]=[CH:2]1", name: "1,5-cyclooctadiene" },
  { label: "nbd", also: ["NBD"], smiles: "[CH:1]1=[CH:1][CH]2[CH:2]=[CH:2][CH]1C2", name: "norbornadiene" },
  { label: "dba", smiles: `O=C(C=C${PH})[CH:1]=[CH:1]${PH}`, name: "dibenzylideneacetone" },
  { label: "p-cymene", smiles: "C[c:1]1[cH:1][cH:1][c:1](C(C)C)[cH:1][cH:1]1", name: "4-isopropyltoluene" },
  { label: "Cp*", also: ["C5Me5"], smiles: "C[C-:1]1[C:1](C)=[C:1](C)[C:1](C)=[C:1]1C", name: "pentamethylcyclopentadienyl" },
  { label: "Cp", smiles: "[CH-:1]1[CH:1]=[CH:1][CH:1]=[CH:1]1", name: "cyclopentadienyl", inComplex: true },
  // O donors
  { label: "acac", smiles: "CC(=[O:2])C=C(C)[O:1]", anionic: [1], name: "acetylacetonato" },
  { label: "THF", smiles: "[O:1]1CCCC1", name: "tetrahydrofuran" },
  { label: "H2O", smiles: "[OH2:1]", name: "water", formula: true, inComplex: true },
  // and carbon monoxide
  { label: "CO", smiles: "[C-:1]#[O+]", name: "carbon monoxide", formula: true, inComplex: true },
];

const LIGAND_BY_LABEL = new Map<string, Ligand>();
for (const l of LIGANDS) for (const name of [l.label, ...(l.also ?? [])]) LIGAND_BY_LABEL.set(name, l);

/** The ligand a label is, read on its own (not CO, H2O, NH3), or none. */
export function ligandOf(label: string, inComplex = false): Ligand | undefined {
  const l = LIGAND_BY_LABEL.get(label);
  return l && (inComplex || !l.inComplex) ? l : undefined;
}

/** The ligands' labels that are names, not formulas: each read as one unit of a label (dppf, not d, p, p, f). */
export const LIGAND_UNITS = LIGANDS.filter((l) => !l.formula && !l.inComplex).flatMap((l) => [l.label, ...(l.also ?? [])]);

/** A ligand as atoms and bonds, its donors where it is attached, each an atom or a pi system's star. */
export function ligandStructure(l: Ligand): GroupStructure & { anionic: boolean[] } {
  const read = readSmiles(l.smiles);
  const orders = kekuleOrders(read.atoms, read.bonds);
  const atoms: SmilesAtom[] = read.atoms.map(({ aromatic: _aromatic, cls: _cls, ...a }) => a);
  const bonds: StructureBond[] = read.bonds.map((b, i) => ({ a1: b.a1, a2: b.a2, order: orders[i] }));
  const byClass = new Map<number, number[]>();
  read.atoms.forEach((a, i) => {
    if (a.cls != null) byClass.set(a.cls, [...(byClass.get(a.cls) ?? []), i]);
  });
  const haptic: { star: number; atoms: number[] }[] = [];
  const star = (ring: number[]) => {
    atoms.push({ el: "*", hs: 0 });
    haptic.push({ star: atoms.length - 1, atoms: ring });
    return atoms.length - 1;
  };
  const insideClasses = new Set<number>();
  for (const [metal, ring] of l.inner ?? []) {
    insideClasses.add(metal);
    insideClasses.add(ring);
    const at = byClass.get(metal)![0];
    const s = star(byClass.get(ring)!);
    bonds.push({ a1: at, a2: s, order: 1, coordination: true, endpoints: byClass.get(ring)!, attach: "all" });
  }
  const donors = [...byClass.keys()].filter((c) => !insideClasses.has(c)).sort((a, b) => a - b);
  const attach = donors.map((c) => {
    const at = byClass.get(c)!;
    return at.length === 1 ? at[0] : star(at);
  });
  return {
    atoms,
    bonds,
    attach,
    ...(haptic.length ? { haptic } : {}),
    anionic: donors.map((c) => !!l.anionic?.includes(c)),
  };
}

/**
 * A ligand for a picture: the molecule, each donor atom marked by a "*"
 * bonded to it - as a group's attachment is - and each pi system it binds
 * through by the "*" at its centre.
 */
export function ligandPicture(l: Ligand): GroupStructure {
  const s = ligandStructure(l);
  const atoms = [...s.atoms];
  const bonds: StructureBond[] = [...s.bonds];
  for (const at of s.attach) {
    if (s.haptic?.some((h) => h.star === at)) continue;
    atoms.push({ el: "*", hs: 0 });
    bonds.push({ a1: atoms.length - 1, a2: at, order: 1 });
  }
  return { atoms, bonds, attach: [], ...(s.haptic ? { haptic: s.haptic } : {}) };
}

/**
 * A structure's molecular formula, in Hill order (C, H, then the rest
 * alphabetically; alphabetically throughout where there is no carbon): its
 * hydrogens as its atoms say or by valence - a coordination or haptic bond
 * taking none - stars not counted.
 */
export function structureFormula(s: GroupStructure): string {
  const sums = s.atoms.map(() => 0);
  for (const b of s.bonds) {
    if (b.coordination) continue;
    sums[b.a1] += b.order;
    sums[b.a2] += b.order;
  }
  const count = new Map<string, number>();
  const add = (el: string, n: number) => n && count.set(el, (count.get(el) ?? 0) + n);
  s.atoms.forEach((a, i) => {
    if (a.el === "*") return;
    add(a.el, 1);
    add("H", a.hs ?? implicitHydrogens(a.el, sums[i], a.charge ?? 0));
  });
  const others = [...count.keys()].filter((e) => e !== "C" && e !== "H").sort();
  const order = count.has("C") ? ["C", "H", ...others] : [...count.keys()].sort();
  return order.filter((e) => count.has(e)).map((e) => `${e}${count.get(e)! > 1 ? count.get(e) : ""}`).join("");
}

// --- complexes ---------------------------------------------------------------

/** The metals a complex's formula may have: the d block and the lanthanides (Pr, propyl here, aside). */
const METALS = new Set(
  "Sc Ti V Cr Mn Fe Co Ni Cu Zn Y Zr Nb Mo Tc Ru Rh Pd Ag Cd Hf Ta W Re Os Ir Pt Au Hg La Ce Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu".split(" "),
);
const NAME = new Map(elements.map((e) => [e.symbol, e.name]));

/** A complex's counter-anions, written after its brackets: [Rh(cod)2]BF4. */
const COUNTER_IONS: Record<string, { smiles: string; name: string }> = {
  BF4: { smiles: "F[B-](F)(F)F", name: "tetrafluoroborate" },
  PF6: { smiles: "F[P-](F)(F)(F)(F)F", name: "hexafluorophosphate" },
  SbF6: { smiles: "F[Sb-](F)(F)(F)(F)F", name: "hexafluoroantimonate" },
  ClO4: { smiles: "[O-][Cl](=O)(=O)=O", name: "perchlorate" },
  BArF: {
    smiles: "[B-](c1cc(C(F)(F)F)cc(C(F)(F)F)c1)(c1cc(C(F)(F)F)cc(C(F)(F)F)c1)(c1cc(C(F)(F)F)cc(C(F)(F)F)c1)c1cc(C(F)(F)F)cc(C(F)(F)F)c1",
    name: "tetrakis[3,5-bis(trifluoromethyl)phenyl]borate",
  },
};

type Item =
  | { kind: "metal"; el: string; n: number }
  | { kind: "ligand"; ligand: Ligand; n: number }
  | { kind: "x"; label: string; n: number }
  | { kind: "counter"; ion: string; n: number }
  | { kind: "unit"; items: Item[]; n: number };

/** The index of the bracket that closes the one opened at `i`, or -1. */
function closing(text: string, i: number): number {
  const open = text[i];
  const close = open === "(" ? ")" : "]";
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === open) depth++;
    if (text[j] === close && --depth === 0) return j;
  }
  return -1;
}

/**
 * What a complex's formula is made of, in order, or null where any of it
 * is not a metal, a ligand, a halide, a hydride, a group bound by one bond
 * (`isGroup`: OAc, OTf, Me) or a counter-ion.
 */
function itemsOf(text: string, isGroup: (label: string) => boolean): Item[] | null {
  const out: Item[] = [];
  let i = 0;
  while (i < text.length) {
    let item: Item | null = null;
    if (text[i] === "[" || text[i] === "(") {
      const j = closing(text, i);
      if (j < 0) return null;
      const inner = text.slice(i + 1, j);
      if (text[i] === "[") {
        const items = itemsOf(inner, isGroup);
        if (!items) return null;
        item = { kind: "unit", items, n: 1 };
      } else item = token(inner, isGroup);
      i = j + 1;
    } else {
      // the longest token from here, up to the next bracket
      const stop = text.slice(i).search(/[[(]/);
      const rest = stop < 0 ? text.slice(i) : text.slice(i, i + stop);
      for (let len = rest.length; len > 0 && !item; len--) {
        const t = token(rest.slice(0, len), isGroup);
        if (t) {
          item = t;
          i += len;
        }
      }
    }
    if (!item) return null;
    const count = /^\d+/.exec(text.slice(i));
    if (count) {
      item.n = Number(count[0]);
      i += count[0].length;
    }
    out.push(item);
  }
  return out;
}

function token(t: string, isGroup: (label: string) => boolean): Item | null {
  if (METALS.has(t)) return { kind: "metal", el: t, n: 1 };
  if (t in COUNTER_IONS) return { kind: "counter", ion: t, n: 1 };
  const ligand = ligandOf(t, true);
  if (ligand) return { kind: "ligand", ligand, n: 1 };
  if (["F", "Cl", "Br", "I", "H"].includes(t) || isGroup(t)) return { kind: "x", label: t, n: 1 };
  return null;
}

/**
 * A complex's formula - Pd(PPh3)4, Pd2(dba)3, PdCl2(dppf), Cp2ZrCl2,
 * [Ir(cod)Cl]2, [Rh(cod)2]BF4 - as the structure it stands for, or null for
 * a label that is not one. `groupOf` gives a group bound by one bond (OAc,
 * OTf, Me) as its structure.
 *
 * Each ligand is bound to the metal: a neutral donor by a coordination bond
 * from it, an anionic one, a halide or a group by a covalent bond, a pi
 * system by a haptic bond to its centre. Where there are several metals in
 * one part, the ligands are shared among them in turn: which ligands bridge
 * them, the formula does not say. A part in brackets is made as many times
 * as its count; what follows the brackets is its counter-anions, each
 * leaving a positive charge on the part's metal.
 */
export function complexStructure(
  label: string,
  groupOf: (label: string) => GroupStructure | null,
): (GroupStructure & { name: string }) | null {
  const items = itemsOf(label, (t) => !!groupOf(t));
  if (!items) return null;
  const atoms: SmilesAtom[] = [];
  const bonds: StructureBond[] = [];
  const haptic: { star: number; atoms: number[] }[] = [];
  const parts: string[] = [];

  /** Adds `s`'s atoms and bonds; the index its first atom has now. */
  const add = (s: GroupStructure): number => {
    const at = atoms.length;
    atoms.push(...s.atoms.map((a) => ({ ...a })));
    for (const b of s.bonds) {
      bonds.push({ ...b, a1: b.a1 + at, a2: b.a2 + at, ...(b.endpoints ? { endpoints: b.endpoints.map((e) => e + at) } : {}) });
    }
    for (const h of s.haptic ?? []) haptic.push({ star: h.star + at, atoms: h.atoms.map((e) => e + at) });
    return at;
  };
  /** `at` bound to the metal: haptically where it is a pi system's star, else as anion or donor. */
  const bind = (metal: number, at: number, anionic: boolean) => {
    const pi = haptic.find((x) => x.star === at);
    if (pi) bonds.push({ a1: metal, a2: at, order: 1, coordination: true, endpoints: pi.atoms, attach: "all" });
    else if (anionic) bonds.push({ a1: metal, a2: at, order: 1 });
    else bonds.push({ a1: at, a2: metal, order: 1, coordination: true });
  };

  /** One part, its metals first: the index of its first metal, or -1. */
  const build = (unit: Item[]): number => {
    const metals: number[] = [];
    for (const it of unit) {
      if (it.kind !== "metal") continue;
      for (let k = 0; k < it.n; k++) {
        atoms.push({ el: it.el, hs: 0 });
        metals.push(atoms.length - 1);
      }
      parts.push(`${it.n > 1 ? `${it.n} ` : ""}${NAME.get(it.el) ?? it.el}`);
    }
    if (!metals.length) return -1;
    let turn = 0;
    for (const it of unit) {
      if (it.kind === "ligand" || it.kind === "x") {
        for (let k = 0; k < it.n; k++) {
          const metal = metals[turn++ % metals.length];
          if (it.kind === "ligand") {
            const s = ligandStructure(it.ligand);
            const at = add(s);
            s.attach.forEach((d, j) => bind(metal, d + at, s.anionic[j]));
            // a ligand written as an anion (Cp*-) leaves its charge on the metal
            const charge = s.atoms.reduce((q, a) => q + (a.charge ?? 0), 0);
            if (charge && !it.ligand.inner) atoms[metal].charge = (atoms[metal].charge ?? 0) - charge;
          } else {
            const s: GroupStructure = ["F", "Cl", "Br", "I", "H"].includes(it.label)
              ? { atoms: [{ el: it.label, hs: 0 }], bonds: [], attach: [0] }
              : groupOf(it.label)!;
            const at = add(s);
            bind(metal, s.attach[0] + at, true);
          }
        }
        parts.push(`${it.n > 1 ? `${it.n} ` : ""}${it.kind === "ligand" ? it.ligand.name : it.label}`);
      }
    }
    return metals[0];
  };

  const units = items.filter((it): it is Extract<Item, { kind: "unit" }> => it.kind === "unit");
  const loose = items.filter((it) => it.kind !== "unit" && it.kind !== "counter");
  const counters = items.filter((it): it is Extract<Item, { kind: "counter" }> => it.kind === "counter");
  // in brackets: the part, and after them its counter-anions only
  if (units.length && loose.length) return null;
  if (counters.length && !units.length) return null;
  // a metal on its own, or metals only, is no complex
  const holds = (its: Item[]): boolean => its.some((it) => it.kind === "ligand" || it.kind === "x" || (it.kind === "unit" && holds(it.items)));
  if (!holds(items)) return null;
  const firsts: number[] = [];
  for (const u of units.length ? units : [{ kind: "unit" as const, items: loose, n: 1 }]) {
    for (let k = 0; k < u.n; k++) {
      const first = build(u.items);
      if (first < 0) return null;
      firsts.push(first);
    }
  }
  let turn = 0;
  for (const c of counters) {
    const ion = COUNTER_IONS[c.ion];
    for (let k = 0; k < c.n; k++) {
      const read = readSmiles(ion.smiles);
      const orders = kekuleOrders(read.atoms, read.bonds);
      add({ atoms: read.atoms.map(({ aromatic: _a, ...a }) => a), bonds: read.bonds.map((b, i) => ({ ...b, order: orders[i] })), attach: [] });
      const metal = firsts[turn++ % firsts.length];
      atoms[metal].charge = (atoms[metal].charge ?? 0) + 1;
    }
    parts.push(`${c.n > 1 ? `${c.n} ` : ""}${ion.name}`);
  }
  return { atoms, bonds, attach: [], ...(haptic.length ? { haptic } : {}), name: parts.join(", ") };
}
