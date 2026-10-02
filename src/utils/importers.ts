import { NOMINAL_BOND_LENGTH } from "../lib/chem/acs";
import { kekuleOrders } from "../lib/chem/kekulize";
import {
  bondChem,
  chemistry,
  type AbbreviationStructure,
  type AtomChem,
  type BondChem,
  type ParsedAtom,
} from "../lib/chem/molecule";
import {
  layoutMolecule,
  type Atom as LayoutAtom,
  type Bond as LayoutBond,
} from "../lib/chem/layout2d";
import { layoutOptionsFor, MENO } from "../lib/chem/style";
import {
  fromCtfile,
  stereoGroupsOf,
  parseSDF,
  parseXYZ,
  type Molecule as ParsedMol,
} from "./structureParsers";
import { readRxnfile } from "../lib/chem/ctfile";
import { elements } from "./atomUtils";

/** An atom as the editor holds it: its chemistry (lib/chem/molecule), and where it is. */
export type EditorAtom = AtomChem & {
  id: number;
  x: number;
  y: number;
  r: number;
};
export type EditorBond = BondChem & {
  id: number;
  a: number;
  b: number;
  order: 1 | 2 | 3;
  /**
   * A single bond's wedge, hashed wedge or wavy line; a double bond's
   * "either": cis or trans, not known (drawn as IUPAC ST-4.4 has it, with a
   * wavy bond beside it).
   */
  stereo?: "up" | "down" | "wavy" | "either" | "none";
  /**
   * Set when the file puts a wedge's narrow end where the drawing would not
   * by itself - at the atom with fewer bonds.
   */
  stereoOrient?: "principle" | "reverse";
  /** A coordination bond (MOL bond type 9), drawn as an arrow from `a` to `b`. */
  dative?: boolean;
};
export type EditorModel = { atoms: EditorAtom[]; bonds: EditorBond[] };

/** A parsed atom's chemistry, as the editor holds it: its symbol normalised, and a charge, radical or isotope only where it has one. */
function chemistryOf(a: ParsedAtom): AtomChem {
  return { el: normalizeEl(a.el), ...chemistry(a) };
}

/** MOL's bond type for a coordination (dative) bond. */
const COORDINATION_BOND = 9;
const HYDROGEN_BOND = 10;
/** The query bond types, 5 to 8. */
const QUERY_OF: Record<number, EditorBond["query"]> = {
  5: "single-or-double",
  6: "single-or-aromatic",
  7: "double-or-aromatic",
  8: "any",
};

const normalizeNewlines = (s: string) => s.replace(/\r\n?/g, "\n");

export type DetectedFormat = "mol" | "sdf" | "rxn" | "xyz" | null;

// XYZ: line 1 is the atom count, line 2 a comment, line 3 the first atom
// ("<symbol or atomic number> <x> <y> <z>").
const XYZ_NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
const XYZ_ATOM_LINE = new RegExp(
  String.raw`^\s*(?:[A-Za-z]{1,3}|\d{1,3})\s+${XYZ_NUM}\s+${XYZ_NUM}\s+${XYZ_NUM}\b`
);

function looksLikeXyz(lines: string[]): boolean {
  const first = lines[0] ?? "";
  if (!/^\s*\d+\s*$/.test(first)) return false;
  if (Number.parseInt(first, 10) === 0) return true;
  return XYZ_ATOM_LINE.test(lines[2] ?? "");
}

export function detectFormat(fileName: string, text: string): DetectedFormat {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  const t = normalizeNewlines(text).trim();
  if (/^\s*\$RXN\b/m.test(t)) return "rxn";
  if (ext === "rxn") return "rxn";
  // CTfile markers must be checked before the XYZ heuristic: a MOL/SDF title
  // line is free text and is often a bare number (e.g. PubChem CIDs).
  if (/\b(V2000|V3000)\b/.test(t) || /(M\s{2,}END)\s*$/m.test(t))
    return ext === "sdf" ? "sdf" : "mol";
  if (ext === "sdf") return "sdf";
  if (ext === "mol") return "mol";
  if (ext === "xyz") return "xyz";
  if (looksLikeXyz(t.split("\n"))) return "xyz";
  return null;
}

function parseRXN(text: string): ParsedMol[] {
  const src = normalizeNewlines(text);
  // Split robustly around $MOL, tolerating surrounding/ending whitespace
  const parts = src.split(/^\s*\$MOL\s*$/gm).slice(1);
  if (!parts.length) return [];
  const mols: ParsedMol[] = [];
  for (const p of parts) {
    const block = p.trim();
    if (!block) continue;
    try {
      const mm = parseSDF(block);
      if (mm && mm.length > 0) mols.push(mm[0]);
    } catch {
      // ignore malformed block
    }
  }
  return mols;
}

export function readMoleculesFromText(
  text: string,
  format: DetectedFormat | string
): ParsedMol[] {
  const fmt = (format as DetectedFormat) ?? null;
  const t = normalizeNewlines(text);
  if (fmt === "rxn") return parseRXN(t);
  if (fmt === "sdf") return parseSDF(t);
  if (fmt === "mol") return parseSDF(t);
  if (fmt === "xyz") return parseXYZ(t);
  // try auto-detect fallback
  const auto = detectFormat("", t);
  if (auto) return readMoleculesFromText(t, auto);
  return [];
}

export type RXNGroups = {
  reactants: ParsedMol[];
  products: ParsedMol[];
  agents: ParsedMol[];
};
export type RXNLayout = {
  model: EditorModel;
  arrow: { x1: number; y1: number; x2: number; y2: number } | null;
  centroid: { x: number; y: number };
};

/**
 * Parse RXN and return grouped molecules (reactants/products/agents).
 * This is more robust than a flat split when we need to layout reaction components.
 */
export function parseRXNGroups(text: string): RXNGroups {
  // V2000 or V3000; its molecules in the file's order - reactants,
  // products, then reagents ("CTfile Formats", the Rxnfile chapters)
  const r = readRxnfile(normalizeNewlines(text));
  return {
    reactants: r.reactants.map(fromCtfile),
    products: r.products.map(fromCtfile),
    agents: r.reagents.map(fromCtfile),
  };
}

/**
 * Build a horizontally laid-out EditorModel from an RXN text with ordering:
 * reactants (left) -> arrow (center) -> products (right). Agents near the arrow.
 * Returns combined model, optional arrow endpoints, and centroid.
 */
export function buildEditorModelFromRXN(text: string): RXNLayout {
  const groups = parseRXNGroups(text);
  const allMols = [...groups.reactants, ...groups.products, ...groups.agents];
  if (!allMols.length)
    return {
      model: { atoms: [], bonds: [] },
      arrow: null,
      centroid: { x: 0, y: 0 },
    };
  const scale = computeScaleForMols(allMols);
  const conv = allMols.map((m) => convertMolToEditorModel(m, scale));
  // Between two structures on one side of the arrow: room for a "+".
  const hGap = NOMINAL_BOND_LENGTH;
  // Each structure's width as it is drawn, its labels included: measured at
  // its atoms, an OH at the end of a structure ran into the arrow.
  const boxes = conv.map((c) => drawnBox(c.model));
  const widthOf = (i: number) => Math.max(0.6, boxes[i].maxX - boxes[i].minX);
  const getClusterWidth = (from: number, count: number) => {
    if (!count) return 0;
    let w = hGap * (count - 1);
    for (let i = from; i < from + count; i++) w += widthOf(i);
    return w;
  };
  const reactConv = conv.slice(0, groups.reactants.length);
  const prodConv = conv.slice(
    groups.reactants.length,
    groups.reactants.length + groups.products.length
  );
  const agentConv = conv.slice(
    groups.reactants.length + groups.products.length
  );
  const reactW = getClusterWidth(0, reactConv.length);
  const prodW = getClusterWidth(reactConv.length, prodConv.length);
  // Fixed arrow length ~ NOMINAL_BOND_LENGTH * (4 * 2/3) = 8/3
  const ARROW_LEN = (NOMINAL_BOND_LENGTH * 8) / 3;
  // The arrow, and half a bond clear of what is drawn on either side of it
  const arrowGap = ARROW_LEN + NOMINAL_BOND_LENGTH;
  const totalW = reactW + prodW + arrowGap;
  const startX = -totalW / 2;
  const reactCenterX = startX + reactW / 2;
  const arrowCenterX = startX + reactW + arrowGap / 2;
  const prodCenterX = startX + reactW + arrowGap + prodW / 2;
  const placedAtoms: EditorAtom[] = [];
  const placedBonds: EditorBond[] = [];
  let idCounter = 1;
  const placeCluster = (
    items: typeof conv,
    first: number,
    centerX: number,
    targetArr?: EditorAtom[],
    baselineY = 0
  ) => {
    const tw = getClusterWidth(first, items.length);
    const sx = centerX - tw / 2;
    let cursorX = sx;
    for (let i = 0; i < items.length; i++) {
      const c = items[i];
      const box = boxes[first + i];
      const width = widthOf(first + i);
      // the middle of what is drawn where it belongs, not the atoms' centroid,
      // which a long chain pulls to one side
      const offsetX = cursorX + width / 2 - (box.minX + box.maxX) / 2;
      // Align each cluster's centroid to baselineY (do not use bbox center)
      const offsetY = baselineY - c.centroid.y;
      const base = idCounter;
      for (const a of c.model.atoms) {
        placedAtoms.push({
          ...a,
          id: idCounter++,
          x: a.x + offsetX,
          y: a.y + offsetY,
        });
      }
      for (const b of c.model.bonds) {
        placedBonds.push({
          ...b,
          id: idCounter++,
          a: base + (b.a - 1),
          b: base + (b.b - 1),
        });
      }
      if (targetArr) {
        for (let k = base; k < idCounter; k++) {
          const pa = placedAtoms.find((p) => p.id === k);
          if (pa) targetArr.push(pa);
        }
      }
      cursorX += width + hGap;
    }
  };
  const reactPlaced: EditorAtom[] = [];
  const prodPlaced: EditorAtom[] = [];
  placeCluster(reactConv, 0, reactCenterX, reactPlaced, 0);
  placeCluster(prodConv, reactConv.length, prodCenterX, prodPlaced, 0);
  placeCluster(
    agentConv,
    reactConv.length + prodConv.length,
    arrowCenterX,
    undefined,
    -3.0
  );
  const centroid = (() => {
    if (!placedAtoms.length) return { x: 0, y: 0 };
    let sx = 0,
      sy = 0;
    for (const a of placedAtoms) {
      sx += a.x;
      sy += a.y;
    }
    return { x: sx / placedAtoms.length, y: sy / placedAtoms.length };
  })();
  // Place horizontal arrow in the gap between reactants and products, avoiding overlap
  const arrow = {
    x1: arrowCenterX - ARROW_LEN / 2,
    y1: 0,
    x2: arrowCenterX + ARROW_LEN / 2,
    y2: 0,
  };
  return { model: { atoms: placedAtoms, bonds: placedBonds }, arrow, centroid };
}

/**
 * Compute uniform scale for an array of parsed molecules based on average bond length.
 */
export function computeScaleForMols(mols: ParsedMol[]): number {
  let sumLen = 0;
  let nLen = 0;
  for (const m of mols) {
    for (const b of m.bonds) {
      const a1 = m.atoms[b.a1];
      const a2 = m.atoms[b.a2];
      if (!a1 || !a2) continue;
      const dx = a1.x - a2.x;
      const dy = a1.y - a2.y;
      const d = Math.hypot(dx, dy);
      if (Number.isFinite(d) && d > 1e-9) {
        sumLen += d;
        nLen++;
      }
    }
  }
  const avg = nLen > 0 ? sumLen / nLen : NOMINAL_BOND_LENGTH;
  const scale = avg > 1e-9 ? NOMINAL_BOND_LENGTH / avg : 1;
  return scale;
}

/**
 * Convert a single parsed molecule into an EditorModel using an externally supplied scale.
 */
/**
 * How far a structure reaches as it is drawn - its labels and what its bonds
 * draw, not only its atoms - in Meno's own style, whose labels are as large
 * against the bond as any preset's.
 */
function drawnBox(model: EditorModel): { minX: number; maxX: number } {
  if (!model.atoms.length) return { minX: 0, maxX: 0 };
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const atoms: LayoutAtom[] = model.atoms.map((a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    el: a.el,
    ...chemistry(a),
  }));
  const bonds: LayoutBond[] = [];
  for (const b of model.bonds) {
    const a1 = index.get(b.a);
    const a2 = index.get(b.b);
    if (a1 == null || a2 == null) continue;
    bonds.push({
      a1,
      a2,
      order: b.order,
      stereo: b.stereo ?? "none",
      ...(b.dative ? { dative: true } : {}),
      ...bondChem(b),
    });
  }
  const opts = layoutOptionsFor(MENO, NOMINAL_BOND_LENGTH, { units: "world" });
  const { bounds } = layoutMolecule(atoms, bonds, opts, 50);
  return { minX: bounds.min.x, maxX: bounds.max.x };
}

/**
 * A file's contracted abbreviations - its abbreviation Sgroups not shown
 * expanded - each made one atom labelled with the abbreviation, where its
 * first attachment point is, holding the atoms and bonds it stands for
 * (`abbrev`), the bonds out of the group leaving from it. `idOf` is the
 * editor's id for the file's atom `i`.
 */
function contractAbbreviations(
  atoms: EditorAtom[],
  bonds: EditorBond[],
  m: ParsedMol,
  idOf: (i: number) => number,
): void {
  const ct = m.ct;
  if (!ct) return;
  for (const g of ct.sgroups) {
    if (g.type !== "SUP" || g.expanded || !g.atoms.length) continue;
    const inside = new Set(g.atoms);
    // its bonds out: as the file lists them, or as they are
    const crossing = (g.bonds.length ? g.bonds : ct.bonds.map((_, i) => i)).filter((i) => {
      const b = ct.bonds[i];
      return !!b && inside.has(b.a1) !== inside.has(b.a2);
    });
    const ends = [
      ...new Set([
        ...(g.attachments ?? []).map((sap) => sap.atom).filter((a) => inside.has(a)),
        ...crossing.map((i) => (inside.has(ct.bonds[i].a1) ? ct.bonds[i].a1 : ct.bonds[i].a2)),
      ]),
    ];
    const head = atoms.find((a) => a.id === idOf(ends[0] ?? g.atoms[0]));
    if (!head) continue;
    const ids = new Map(g.atoms.map((a, k) => [idOf(a), k]));
    const structure: AbbreviationStructure = {
      atoms: g.atoms.map((a) => {
        const at = atoms.find((x) => x.id === idOf(a))!;
        return { el: at.el, ...chemistry(at), x: at.x - head.x, y: at.y - head.y };
      }),
      bonds: [],
      attach: ends.map((a) => g.atoms.indexOf(a)),
    };
    // which way its first bond out goes, to turn it by when it is expanded
    const out = crossing[0] != null ? ct.bonds[crossing[0]] : undefined;
    const outside = out ? atoms.find((x) => x.id === idOf(inside.has(out.a1) ? out.a2 : out.a1)) : undefined;
    if (outside) structure.toward = { x: outside.x - head.x, y: outside.y - head.y };
    for (let k = bonds.length - 1; k >= 0; k--) {
      const b = bonds[k];
      const ia = ids.get(b.a);
      const ib = ids.get(b.b);
      if (ia != null && ib != null) {
        // inside: into the structure, out of the drawing
        structure.bonds.unshift({ a1: ia, a2: ib, order: b.order, stereo: b.stereo ?? "none", ...bondChem(b) });
        bonds.splice(k, 1);
      } else if (ia != null) {
        bonds[k] = { ...b, a: head.id };
      } else if (ib != null) {
        bonds[k] = { ...b, b: head.id };
      }
    }
    for (let k = atoms.length - 1; k >= 0; k--) {
      if (ids.has(atoms[k].id) && atoms[k].id !== head.id) atoms.splice(k, 1);
    }
    const at = atoms.indexOf(head);
    atoms[at] = { id: head.id, x: head.x, y: head.y, r: head.r, el: g.label || "?", abbrev: structure };
  }
}

/** A file's stereo groups, worked out once for all its bonds. */
const GROUPS = new WeakMap<object, ReturnType<typeof stereoGroupsOf>>();
function groupsOf(ct: NonNullable<ParsedMol["ct"]>): ReturnType<typeof stereoGroupsOf> {
  let g = GROUPS.get(ct);
  if (!g) {
    g = stereoGroupsOf(ct);
    GROUPS.set(ct, g);
  }
  return g;
}

/**
 * A file's bond `i` as the editor holds it, but for its id and atoms: its
 * order - an aromatic ring's Kekulé one (`orders`) - its stereo, and what
 * else the file says it is.
 */
function bondOf(
  m: ParsedMol,
  i: number,
  orders: (1 | 2 | 3)[],
  reversed: boolean[],
): Omit<EditorBond, "id" | "a" | "b"> {
  const b = m.bonds[i];
  const query = QUERY_OF[b.order];
  // A coordination bond is a dative arrow unless the file says to show it
  // plainly (V3000 DISP=COORD); a hydrogen bond is drawn dotted.
  const coord = b.order === COORDINATION_BOND && m.ct?.bonds[i]?.display === "COORD";
  const centre = m.ct?.bonds[i]?.reactingCentre;
  const group = m.ct ? groupsOf(m.ct).bonds.get(i) : undefined;
  return {
    // (a "double or aromatic" query is drawn double, the others single)
    order: query === "double-or-aromatic" ? 2 : orders[i],
    stereo: mapStereo(b),
    ...(reversed[i] ? { stereoOrient: "reverse" as const } : {}),
    ...(b.order === COORDINATION_BOND ? (coord ? { coordination: true } : { dative: true }) : {}),
    ...(b.order === HYDROGEN_BOND ? { hydrogen: true } : {}),
    ...(query ? { query } : {}),
    ...(centre ? { reactingCentre: centre } : {}),
    ...(group ? { stereoGroup: group } : {}),
  };
}

export function convertMolToEditorModel(m: ParsedMol, scale: number) {
  const atoms: EditorAtom[] = m.atoms.map((a, i) => ({
    id: i + 1,
    x: a.x * scale,
    y: a.y * scale,
    r: 0.9,
    ...chemistryOf(a),
  }));
  // Assign bond IDs after atom IDs to avoid collisions with atoms
  const bondIdBase = atoms.length;
  const orders = kekuleOrders(m.atoms, m.bonds);
  const reversed = wedgesNarrowAtFewerBonds(m.bonds);
  const bonds: EditorBond[] = m.bonds.map((b, i) => ({
    id: bondIdBase + i + 1,
    a: b.a1 + 1,
    b: b.a2 + 1,
    ...bondOf(m, i, orders, reversed),
  }));
  contractAbbreviations(atoms, bonds, m, (i) => i + 1);
  // centroid
  let cx = 0,
    cy = 0;
  if (atoms.length) {
    for (const a of atoms) {
      cx += a.x;
      cy += a.y;
    }
    cx /= atoms.length;
    cy /= atoms.length;
  }
  return { model: { atoms, bonds }, centroid: { x: cx, y: cy } };
}

export function moleculesToEditorModel(mols: ParsedMol[]): {
  model: EditorModel;
  centroid: { x: number; y: number };
} {
  // Merge all molecules into one model, keep relative positions.
  // Compute average 2D bond length to scale to NOMINAL_BOND_LENGTH.
  let sumLen = 0;
  let nLen = 0;
  for (const m of mols) {
    for (const b of m.bonds) {
      const a1 = m.atoms[b.a1];
      const a2 = m.atoms[b.a2];
      if (!a1 || !a2) continue;
      const dx = a1.x - a2.x;
      const dy = a1.y - a2.y;
      const d = Math.hypot(dx, dy);
      if (Number.isFinite(d) && d > 1e-9) {
        sumLen += d;
        nLen++;
      }
    }
  }
  const avg = nLen > 0 ? sumLen / nLen : NOMINAL_BOND_LENGTH;
  const scale = avg > 1e-9 ? NOMINAL_BOND_LENGTH / avg : 1;

  const atoms: EditorAtom[] = [];
  const bonds: EditorBond[] = [];
  // Use a single idCounter for both atoms and bonds to keep IDs unique across the model
  let idCounter = 1;
  for (const m of mols) {
    const base = idCounter;
    for (const a of m.atoms) {
      atoms.push({
        id: idCounter++,
        x: a.x * scale,
        y: a.y * scale,
        r: 0.9,
        ...chemistryOf(a),
      });
    }
    const orders = kekuleOrders(m.atoms, m.bonds);
    const reversed = wedgesNarrowAtFewerBonds(m.bonds);
    m.bonds.forEach((b, i) => {
      // Parsed indices are 0-based; our per-molecule atoms were assigned ids base..(base+atoms-1).
      // Therefore, map directly as base + index (no +1).
      const a1 = base + b.a1;
      const a2 = base + b.a2;
      bonds.push({
        id: idCounter++,
        a: a1,
        b: a2,
        ...bondOf(m, i, orders, reversed),
      });
    });
    const from = atoms.length - m.atoms.length;
    const mine = atoms.splice(from);
    const theirBonds = bonds.splice(bonds.length - m.bonds.length);
    contractAbbreviations(mine, theirBonds, m, (i) => base + i);
    atoms.push(...mine);
    bonds.push(...theirBonds);
  }
  // centroid after scaling
  let cx = 0,
    cy = 0;
  if (atoms.length) {
    for (const a of atoms) {
      cx += a.x;
      cy += a.y;
    }
    cx /= atoms.length;
    cy /= atoms.length;
  }
  return { model: { atoms, bonds }, centroid: { x: cx, y: cy } };
}

/**
 * Normalize IDs of an EditorModel:
 * - Reassign atom IDs to 1..N in insertion order
 * - Rebuild bonds to reference the new atom IDs
 * - Drop any bond that references a missing atom after remap
 */
// normalizeEditorModel: removed (not used)

/**
 * An element's symbol as it is written (CL as Cl); anything else - a label,
 * R#, an alias - as the file has it.
 */
function normalizeEl(el: string): string {
  if (!el) return "C";
  const s = String(el).trim();
  if (!s) return "C";
  const symbol = s[0].toUpperCase() + s.slice(1).toLowerCase();
  return ELEMENT_SYMBOLS.has(symbol) ? symbol : s;
}

const ELEMENT_SYMBOLS = new Set(elements.map((e) => e.symbol));

/**
 * Which wedges a file draws with their narrow end on the atom with fewer
 * bonds. A MOL file puts a wedge's narrow end at its first atom; the drawing
 * puts it at the atom with more bonds unless told otherwise, so these are
 * the ones to tell.
 */
function wedgesNarrowAtFewerBonds(
  bonds: readonly { a1: number; a2: number; stereoCode?: number }[],
): boolean[] {
  const deg = new Map<number, number>();
  for (const b of bonds) {
    deg.set(b.a1, (deg.get(b.a1) ?? 0) + 1);
    deg.set(b.a2, (deg.get(b.a2) ?? 0) + 1);
  }
  return bonds.map((b) => {
    const wedge = b.stereoCode === 1 || b.stereoCode === 6;
    return wedge && (deg.get(b.a1) ?? 0) < (deg.get(b.a2) ?? 0);
  });
}

function mapStereo(
  b: { order: number; stereoCode?: number } | undefined
): EditorBond["stereo"] {
  const code = b?.stereoCode;
  if (code == null || !Number.isFinite(code)) return "none";
  // A double bond's 3 is cis or trans, not known - the double bond's own
  // property, not a wavy line in its place. A single bond's: 1 up, 6 down,
  // 4 either.
  if (b?.order === 2) return code === 3 ? "either" : "none";
  if (code === 1) return "up";
  if (code === 6) return "down";
  if (code === 3 || code === 4) return "wavy";
  return "none";
}
