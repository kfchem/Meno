import { NOMINAL_BOND_LENGTH } from "../lib/chem/acs";
import {
  parseSDF,
  parseXYZ,
  type Molecule as ParsedMol,
} from "./structureParsers";

export type EditorAtom = {
  id: number;
  x: number;
  y: number;
  r: number;
  el: string;
};
export type EditorBond = {
  id: number;
  a: number;
  b: number;
  order: 1 | 2 | 3;
  stereo?: "up" | "down" | "wavy" | "none";
};
export type EditorModel = { atoms: EditorAtom[]; bonds: EditorBond[] };

const normalizeNewlines = (s: string) => s.replace(/\r\n?/g, "\n");

export type DetectedFormat = "mol" | "sdf" | "rxn" | "xyz" | null;

export function detectFormat(fileName: string, text: string): DetectedFormat {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  const t = normalizeNewlines(text).trim();
  if (/^\s*\$RXN\b/m.test(t)) return "rxn";
  if (ext === "rxn") return "rxn";
  if (/^\s*\d+\s*$/m.test(t.split("\n")[0] || "")) return "xyz";
  if (/\b(V2000|V3000)\b/.test(t) || /(M\s{2,}END)\s*$/m.test(t))
    return ext === "sdf" ? "sdf" : ext === "mol" ? "mol" : "mol";
  if (ext === "sdf") return "sdf";
  if (ext === "mol") return "mol";
  if (ext === "xyz") return "xyz";
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
  const src = normalizeNewlines(text);
  // Find header area after $RXN and before first $MOL
  const headerMatch = src.match(/\$RXN[\s\S]*?(?=\$MOL)/i);
  let reactCount = 0;
  let prodCount = 0;
  let agentCount = 0;
  if (headerMatch) {
    const header = headerMatch[0];
    // Look for a counts-like line containing at least two integers
    const lines = header.split("\n").map((l) => l.trim());
    for (const l of lines) {
      const nums = l.match(/(-?\d+)/g);
      if (nums && nums.length >= 2) {
        reactCount = parseInt(nums[0], 10) || 0;
        prodCount = parseInt(nums[1], 10) || 0;
        if (nums.length >= 3) agentCount = parseInt(nums[2], 10) || 0;
        break;
      }
    }
  }

  // Split on $MOL tokens; include trailing content in each part
  const parts = src.split(/(^\s*\$MOL\s*$)/gim).filter(Boolean);
  // parts will contain alternating separators and blocks; rebuild blocks that start with $MOL
  const molBlocks: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (/^\s*\$MOL\s*$/i.test(parts[i])) {
      // next chunk is the actual block (if present)
      const next = parts[i + 1] ?? "";
      molBlocks.push(next);
      i++; // skip next
    }
  }

  const all: ParsedMol[] = [];
  for (const b of molBlocks) {
    const blk = b.trim();
    if (!blk) continue;
    try {
      const mm = parseSDF(blk);
      if (mm && mm.length > 0) all.push(mm[0]);
    } catch {
      // ignore
    }
  }

  // Partition by counts, if available; otherwise heuristically split half/half
  const reactants: ParsedMol[] = [];
  const products: ParsedMol[] = [];
  const agents: ParsedMol[] = [];
  let idx = 0;
  if (reactCount + prodCount + agentCount > 0) {
    for (let i = 0; i < reactCount && idx < all.length; i++, idx++)
      reactants.push(all[idx]);
    for (let i = 0; i < agentCount && idx < all.length; i++, idx++)
      agents.push(all[idx]);
    for (let i = 0; i < prodCount && idx < all.length; i++, idx++)
      products.push(all[idx]);
    // any remaining treat as products
    while (idx < all.length) products.push(all[idx++]);
  } else {
    // fallback: if only a few blocks, assume first half reactants, last half products
    const half = Math.ceil(all.length / 2);
    for (let i = 0; i < all.length; i++) {
      if (i < half) reactants.push(all[i]);
      else products.push(all[i]);
    }
  }

  return { reactants, products, agents };
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
  const hGap = 0.8;
  const computeBBox = (c: (typeof conv)[number]) => {
    const xs = c.model.atoms.map((a) => a.x);
    const ys = c.model.atoms.map((a) => a.y);
    if (!xs.length)
      return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  };
  const getClusterWidth = (items: typeof conv) => {
    if (!items || !items.length) return 0;
    const widths = items.map((it) =>
      Math.max(0.6, computeBBox(it).width || 0.6)
    );
    return widths.reduce((s, v) => s + v, 0) + hGap * (widths.length - 1);
  };
  const reactConv = conv.slice(0, groups.reactants.length);
  const prodConv = conv.slice(
    groups.reactants.length,
    groups.reactants.length + groups.products.length
  );
  const agentConv = conv.slice(
    groups.reactants.length + groups.products.length
  );
  const reactW = getClusterWidth(reactConv);
  const prodW = getClusterWidth(prodConv);
  // Fixed arrow length ~ NOMINAL_BOND_LENGTH * (4 * 2/3) = 8/3
  const ARROW_LEN = (NOMINAL_BOND_LENGTH * 8) / 3;
  // Ensure enough horizontal gap to fit the arrow fully with a small margin
  const arrowGap = ARROW_LEN + 0.6;
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
    centerX: number,
    targetArr?: EditorAtom[],
    baselineY = 0
  ) => {
    const bboxes = items.map((it) => computeBBox(it));
    const widths = bboxes.map((b) => Math.max(0.6, b.width || 0.6));
    const tw = widths.reduce((s, v) => s + v, 0) + hGap * (widths.length - 1);
    const sx = centerX - tw / 2;
    let cursorX = sx;
    for (let i = 0; i < items.length; i++) {
      const c = items[i];
      const bbox = bboxes[i];
      const centerOfBBoxX = (bbox.minX + bbox.maxX) / 2;
      const targetCenterX = cursorX + widths[i] / 2;
      const offsetX =
        targetCenterX - centerOfBBoxX - c.centroid.x + centerOfBBoxX;
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
      cursorX += widths[i] + hGap;
    }
  };
  const reactPlaced: EditorAtom[] = [];
  const prodPlaced: EditorAtom[] = [];
  placeCluster(reactConv, reactCenterX, reactPlaced, 0);
  placeCluster(prodConv, prodCenterX, prodPlaced, 0);
  placeCluster(agentConv, arrowCenterX, undefined, -3.0);
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
export function convertMolToEditorModel(m: ParsedMol, scale: number) {
  const atoms: EditorAtom[] = m.atoms.map((a, i) => ({
    id: i + 1,
    x: a.x * scale,
    y: a.y * scale,
    r: 0.9,
    el: normalizeEl(a.element),
  }));
  // Assign bond IDs after atom IDs to avoid collisions with atoms
  const bondIdBase = atoms.length;
  const bonds: EditorBond[] = m.bonds.map((b, i) => ({
    id: bondIdBase + i + 1,
    a: b.a1 + 1,
    b: b.a2 + 1,
    order: clampOrder(b.order),
    stereo: mapStereo(b as any),
  }));
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
        el: normalizeEl(a.element),
      });
    }
    for (const b of m.bonds) {
      // Parsed indices are 0-based; our per-molecule atoms were assigned ids base..(base+atoms-1).
      // Therefore, map directly as base + index (no +1).
      const a1 = base + b.a1;
      const a2 = base + b.a2;
      bonds.push({
        id: idCounter++,
        a: a1,
        b: a2,
        order: clampOrder(b.order),
        stereo: mapStereo(b as any),
      });
    }
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

function clampOrder(o: number): 1 | 2 | 3 {
  if (o >= 3) return 3;
  if (o >= 2) return 2;
  return 1;
}

function normalizeEl(el: string): string {
  if (!el) return "C";
  const s = String(el).trim();
  if (!s) return "C";
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

function mapStereo(
  b: { stereoCode?: number } | undefined
): EditorBond["stereo"] {
  const code = b?.stereoCode;
  if (code == null || !Number.isFinite(code)) return "none";
  // MDL codes: 0 none, 1 up, 6 down, 3/4 either (wavy)
  if (code === 1) return "up";
  if (code === 6) return "down";
  if (code === 3 || code === 4) return "wavy";
  return "none";
}
