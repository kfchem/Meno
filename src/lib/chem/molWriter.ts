import { NOMINAL_BOND_LENGTH } from "./acs";
import { wedgeNarrowAtom } from "./layout2d";
import { abbreviationOf } from "./abbreviations";
import { placedAbbreviation } from "./abbreviationPlace";
import type { AbbreviationStructure, AtomChem, BondChem } from "./molecule";
import { elements } from "../../utils/atomUtils";

/** An atom to write: what it is (./molecule), and where, in the editor's world units. */
export type WriterAtom = AtomChem & { id: number; x: number; y: number };
/** A bond to write, between two atoms by id, as the editor holds it. */
export type WriterBond = BondChem & {
  a: number;
  b: number;
  order: 1 | 2 | 3;
  stereo?: "up" | "down" | "wavy" | "either" | "none";
  stereoOrient?: "principle" | "reverse";
  dative?: boolean;
};
export type WriterModel = { atoms: WriterAtom[]; bonds: WriterBond[] };

/** How long a MOL file's bonds are, in ångström: the usual 1.5. */
export const MOL_BOND_LENGTH = 1.5;

/** MOL's bond type for a coordination (dative) bond, and for a hydrogen bond. */
const COORDINATION_BOND = 9;
const HYDROGEN_BOND = 10;
/** A query bond's type ("CTfile Formats", the bond block). */
const QUERY_TYPE = { "single-or-double": 5, "single-or-aromatic": 6, "double-or-aromatic": 7, any: 8 } as const;

type Row = {
  first: number;
  second: number;
  type: number;
  stereo: "up" | "down" | "wavy" | "either" | "none";
  /** V3000's DISP: a coordination bond drawn as a plain line. */
  coord?: boolean;
};

/** A bond's CTfile type. */
function bondType(b: WriterBond): number {
  if (b.hydrogen) return HYDROGEN_BOND;
  if (b.query) return QUERY_TYPE[b.query];
  if ((b.dative || b.coordination) && b.order === 1) return COORDINATION_BOND;
  return b.order;
}

/**
 * The bonds as a MOL file lists them: 1-based atoms, the first of a wedge its
 * narrow end - the stereocentre, as the drawing has it - and the first of a
 * wavy bond or a dative one where the drawing starts it.
 */
function rows(model: WriterModel, index: Map<number, number>): Row[] {
  const deg = new Map<number, number>();
  for (const b of model.bonds) {
    const i = index.get(b.a);
    const j = index.get(b.b);
    if (i == null || j == null) continue;
    deg.set(i, (deg.get(i) ?? 0) + 1);
    deg.set(j, (deg.get(j) ?? 0) + 1);
  }
  const out: Row[] = [];
  for (const b of model.bonds) {
    const i = index.get(b.a);
    const j = index.get(b.b);
    if (i == null || j == null) continue;
    const stereo = b.stereo ?? "none";
    let first = i;
    if (stereo === "up" || stereo === "down") {
      first = wedgeNarrowAtom(
        { a1: i, a2: j, order: b.order, stereoOrient: b.stereoOrient },
        deg,
      );
    } else if (stereo === "wavy") {
      first = (deg.get(i) ?? 0) >= (deg.get(j) ?? 0) ? i : j;
    }
    const second = first === i ? j : i;
    // ("either" is a double bond's alone: cis or trans not known)
    const either = stereo === "either" && b.order === 2 && !b.query;
    out.push({
      first: first + 1,
      second: second + 1,
      type: bondType(b),
      stereo: stereo === "either" && !either ? "none" : stereo,
      ...(b.coordination && !b.dative ? { coord: true } : {}),
    });
  }
  return out;
}

const f10 = (v: number) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4).padStart(10);
const i3 = (n: number) => String(n).padStart(3);

/** MOL's radical codes. */
const RADICAL_CODE = { singlet: 1, doublet: 2, triplet: 3 } as const;

const ELEMENT_SYMBOLS = new Set(elements.map((e) => e.symbol));
/** The atom types "CTfile Formats" reserves: written as they are. */
const RESERVED = new Set(["A", "Q", "X", "M", "R", "*", "LP", "R#", "L"]);

/** An abbreviation Sgroup to write: its atoms by id (the labelled atom's first) and its label. */
type Sup = { label: string; atoms: number[] };

/**
 * The structure as a file holds it: each abbreviation written out - the
 * atoms a file gave it, or the dictionary's, placed - its labelled atom
 * become the atom it is attached by, where it was, and the rest after the
 * drawing's atoms, so that those keep their places; the abbreviation
 * Sgroups that say how they were shown; and every other label that is not
 * an element nor a reserved type, an alias on a star atom.
 */
function prepared(model: WriterModel): { model: WriterModel; sups: Sup[]; aliases: Map<number, string> } {
  const atoms = model.atoms.map((a) => ({ ...a }));
  const bonds = model.bonds.map((b) => ({ ...b }));
  const sups: Sup[] = [];
  const aliases = new Map<number, string>();
  let nextId = Math.max(0, ...model.atoms.map((a) => a.id)) + 1;
  const byId = new Map(atoms.map((a) => [a.id, a]));
  for (const a of model.atoms) {
    if (ELEMENT_SYMBOLS.has(a.el) || RESERVED.has(a.el) || a.list) continue;
    const touching = bonds.filter((b) => b.a === a.id || b.b === a.id);
    const first = touching[0] ? byId.get(touching[0].a === a.id ? touching[0].b : touching[0].a) : undefined;
    const structure: AbbreviationStructure | null =
      a.abbrev ??
      (abbreviationOf(a.el)
        ? placedAbbreviation(a.el, first ? { x: first.x - a.x, y: first.y - a.y } : null, NOMINAL_BOND_LENGTH)
        : null);
    if (!structure || !structure.atoms.length) {
      aliases.set(a.id, a.el);
      continue;
    }
    const head = structure.attach[0] ?? 0;
    const ids = structure.atoms.map((_, k) => (k === head ? a.id : nextId++));
    const at = byId.get(a.id)!;
    structure.atoms.forEach((s, k) => {
      const { x, y, ...chem } = s;
      const atom = { ...chem, id: ids[k], x: a.x + x, y: a.y + y };
      if (k === head) Object.assign(at, { ...atom, abbrev: undefined, rgroups: undefined });
      else atoms.push(atom);
    });
    for (const b of structure.bonds) bonds.push({ ...b, a: ids[b.a1], b: ids[b.a2] });
    // the bonds out, to the atoms it is attached by, in order
    touching.forEach((b, k) => {
      const to = ids[structure.attach[k] ?? head];
      if (b.a === a.id) b.a = to;
      else b.b = to;
    });
    sups.push({ label: a.el, atoms: [a.id, ...ids.filter((id) => id !== a.id)] });
  }
  return { model: { atoms, bonds }, sups, aliases };
}

/** An atom's type as written: its element, a reserved type, a star for a label, L for a list. */
function symbolOf(a: WriterAtom, aliases: Map<number, string>): string {
  if (a.list) return "L";
  if (aliases.has(a.id)) return "*";
  return a.el;
}

/**
 * A V2000 block's property lines for its charges, radicals and isotopes,
 * eight atoms a line, as the format has them. (The atom block's own charge
 * field is left at 0: a CHG line supersedes it anyway, and holds any
 * charge, where the field stops at 3.)
 */
function propertyLines(model: WriterModel, sups: Sup[] = [], aliases = new Map<number, string>()): string[] {
  const lines: string[] = [];
  const add = (tag: string, entries: [number, number][]) => {
    for (let k = 0; k < entries.length; k += 8) {
      const part = entries.slice(k, k + 8);
      lines.push(`M  ${tag}${i3(part.length)}${part.map(([i, v]) => ` ${i3(i)} ${i3(v)}`).join("")}`);
    }
  };
  const each = <T>(pick: (a: WriterAtom) => T | undefined, code: (v: T) => number) =>
    model.atoms.flatMap((a, i): [number, number][] => {
      const v = pick(a);
      return v ? [[i + 1, code(v)]] : [];
    });
  add("CHG", each((a) => a.charge, (v) => v));
  add("RAD", each((a) => a.radical, (v) => RADICAL_CODE[v]));
  add("ISO", each((a) => a.isotope, (v) => v));
  // an Rgroup's numbers; an atom list's symbols, four wide
  add(
    "RGP",
    model.atoms.flatMap((a, i): [number, number][] => (a.rgroups ?? []).map((r) => [i + 1, r])),
  );
  model.atoms.forEach((a, i) => {
    if (!a.list) return;
    const symbols = a.list.symbols.slice(0, 16);
    lines.push(`M  ALS ${i3(i + 1)}${i3(symbols.length)} ${a.list.not ? "T" : "F"} ${symbols.map((s) => s.padEnd(4)).join("")}`);
  });
  // a label that is no element nor any abbreviation: an alias, its text on the next line
  model.atoms.forEach((a, i) => {
    const text = aliases.get(a.id);
    if (text) lines.push(`A  ${i3(i + 1)}`, text);
  });
  if (sups.length) {
    const index = new Map(model.atoms.map((a, i) => [a.id, i + 1]));
    const rowOf = new Map(model.bonds.map((b, i) => [b, i + 1]));
    for (let k = 0; k < sups.length; k += 8) {
      const part = sups.slice(k, k + 8);
      lines.push(`M  STY${i3(part.length)}${part.map((_, j) => ` ${i3(k + j + 1)} SUP`).join("")}`);
    }
    sups.forEach((g, k) => {
      const n = k + 1;
      const inside = new Set(g.atoms);
      const ats = g.atoms.map((id) => index.get(id)!);
      for (let j = 0; j < ats.length; j += 15) {
        const part = ats.slice(j, j + 15);
        lines.push(`M  SAL ${i3(n)}${i3(part.length)}${part.map((v) => ` ${i3(v)}`).join("")}`);
      }
      const crossing = model.bonds.filter((b) => inside.has(b.a) !== inside.has(b.b)).map((b) => rowOf.get(b)!);
      for (let j = 0; j < crossing.length; j += 15) {
        const part = crossing.slice(j, j + 15);
        lines.push(`M  SBL ${i3(n)}${i3(part.length)}${part.map((v) => ` ${i3(v)}`).join("")}`);
      }
      lines.push(`M  SMT ${i3(n)} ${g.label}`);
    });
  }
  return lines;
}

/** V2000's atom block fields after the symbol: dd ccc sss hhh bbb vvv HHH rrr iii mmm nnn eee. */
function atomFields(a: WriterAtom): string {
  // a query hydrogen count is one more than the count; a valence of none, 15
  const hhh = a.hCount != null ? a.hCount + 1 : 0;
  const vvv = a.valence == null ? 0 : a.valence === 0 ? 15 : a.valence;
  return [0, 0, 0, hhh, 0, vvv, 0, 0, 0, 0, 0, 0].map((v, i) => (i === 0 ? " 0" : i3(v))).join("");
}

/** The second header line: the program, no date, and that it is 2D. */
const PROGRAM_LINE = "  Meno    " + " ".repeat(10) + "2D";

function writeV2000(given: WriterModel, title: string): string {
  const { model, sups, aliases } = prepared(given);
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const scale = MOL_BOND_LENGTH / NOMINAL_BOND_LENGTH;
  const bonds = rows(model, index);
  // (a double bond's 3: cis or trans, either)
  const code = { up: 1, down: 6, wavy: 4, either: 3, none: 0 } as const;
  const lines = [
    title,
    PROGRAM_LINE,
    "",
    `${i3(model.atoms.length)}${i3(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`,
  ];
  for (const a of model.atoms) {
    lines.push(`${f10(a.x * scale)}${f10(a.y * scale)}${f10(0)} ${symbolOf(a, aliases).padEnd(3)}` + atomFields(a));
  }
  for (const b of bonds) {
    lines.push(
      `${i3(b.first)}${i3(b.second)}${i3(b.type)}${i3(code[b.stereo])}  0  0  0`,
    );
  }
  lines.push(...propertyLines(model, sups, aliases), "M  END");
  return lines.join("\n") + "\n";
}

/**
 * A V3000 line in lines of no more than 80 characters: each but the last
 * ending "-", the next taking up after "M  V30 " ("CTfile Formats", the
 * general syntax of entries).
 */
function fitV3000(line: string): string[] {
  if (line.length <= 80 || !line.startsWith("M  V30 ")) return [line];
  const out: string[] = [];
  let rest = line.slice(7);
  while (7 + rest.length > 80) {
    out.push("M  V30 " + rest.slice(0, 72) + "-");
    rest = rest.slice(72);
  }
  out.push("M  V30 " + rest);
  return out;
}

function writeV3000(given: WriterModel, title: string): string {
  const { model, sups: found, aliases } = prepared(given);
  // (V3000 has no alias: a label is an abbreviation Sgroup of its one star atom)
  const sups = [...found, ...[...aliases].map(([id, label]) => ({ label, atoms: [id] }))];
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const scale = MOL_BOND_LENGTH / NOMINAL_BOND_LENGTH;
  const bonds = rows(model, index);
  const cfg = { up: 1, down: 3, wavy: 2, either: 2, none: 0 } as const;
  const num = (v: number) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4);
  const lines = [
    title,
    PROGRAM_LINE,
    "",
    "  0  0  0     0  0  0  0  0  0999 V3000",
    "M  V30 BEGIN CTAB",
    `M  V30 COUNTS ${model.atoms.length} ${bonds.length} ${sups.length} 0 0`,
    "M  V30 BEGIN ATOM",
  ];
  model.atoms.forEach((a, i) => {
    const props =
      (a.charge ? ` CHG=${a.charge}` : "") +
      (a.radical ? ` RAD=${RADICAL_CODE[a.radical]}` : "") +
      (a.isotope ? ` MASS=${a.isotope}` : "") +
      (a.valence != null ? ` VAL=${a.valence === 0 ? -1 : a.valence}` : "") +
      (a.hCount != null ? ` HCOUNT=${a.hCount === 0 ? -1 : a.hCount}` : "") +
      (a.rgroups?.length ? ` RGROUPS=(${a.rgroups.length} ${a.rgroups.join(" ")})` : "");
    // an atom list's type is the list
    const type = a.list
      ? `${a.list.not ? '"NOT ' : ""}[${a.list.symbols.join(",")}]${a.list.not ? '"' : ""}`
      : symbolOf(a, aliases);
    lines.push(`M  V30 ${i + 1} ${type} ${num(a.x * scale)} ${num(a.y * scale)} 0 0${props}`);
  });
  lines.push("M  V30 END ATOM");
  if (bonds.length > 0) {
    lines.push("M  V30 BEGIN BOND");
    bonds.forEach((b, i) => {
      const c = cfg[b.stereo];
      lines.push(
        `M  V30 ${i + 1} ${b.type} ${b.first} ${b.second}` +
          (c ? ` CFG=${c}` : "") +
          (b.coord ? " DISP=COORD" : ""),
      );
    });
    lines.push("M  V30 END BOND");
  }
  if (sups.length) {
    const quote = (t: string) => (/[\s"=()]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
    const rowOf = new Map(model.bonds.map((b, i) => [b, i + 1]));
    lines.push("M  V30 BEGIN SGROUP");
    sups.forEach((g, k) => {
      const inside = new Set(g.atoms);
      const ats = g.atoms.map((id) => index.get(id)! + 1);
      const crossing = model.bonds.filter((b) => inside.has(b.a) !== inside.has(b.b)).map((b) => rowOf.get(b)!);
      lines.push(
        `M  V30 ${k + 1} SUP 0 ATOMS=(${ats.length} ${ats.join(" ")})` +
          (crossing.length ? ` XBONDS=(${crossing.length} ${crossing.join(" ")})` : "") +
          ` LABEL=${quote(g.label)}`,
      );
    });
    lines.push("M  V30 END SGROUP");
  }
  lines.push("M  V30 END CTAB", "M  END");
  return lines.flatMap(fitV3000).join("\n") + "\n";
}

/**
 * The structure as a MOL file. V2000 wherever it can say everything - which
 * it cannot for a dative, coordination or hydrogen bond, or past 999 atoms
 * or bonds - and V3000 where it cannot, unless one is asked for.
 *
 * Coordinates are scaled so the editor's nominal bond comes out at 1.5 Å;
 * hydrogens are left implicit, as the drawing has them.
 */
export function writeMolfile(
  model: WriterModel,
  options: { title?: string; version?: "V2000" | "V3000" | "auto" } = {},
): string {
  const title = (options.title ?? "").replace(/[\r\n]+/g, " ").slice(0, 80);
  const version = options.version ?? "auto";
  // (V2000's bond types stop at 8: a coordination or a hydrogen bond, and
  // whether the one is drawn as a plain line, are V3000's)
  const needsV3000 =
    model.atoms.length > 999 ||
    model.bonds.length > 999 ||
    model.bonds.some((b) => ((b.dative || b.coordination) && b.order === 1) || b.hydrogen);
  return version === "V3000" || (version === "auto" && needsV3000)
    ? writeV3000(model, title)
    : writeV2000(model, title);
}

/** The structure as a one-record SD file. */
export function writeSdf(
  model: WriterModel,
  options: { title?: string } = {},
): string {
  return writeMolfile(model, options) + "$$$$\n";
}
