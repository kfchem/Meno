/**
 * The 2D editor's document: what a structure tab actually contains, and what
 * undo, redo and (later) saving act on. Everything here is pure - the store
 * calls these through `document.edit()` so each gesture becomes one step.
 *
 * What is deliberately *not* here: hover, drag previews, the camera, the label
 * edit buffer, fit requests. Those belong to the view (see store/).
 */
import { createDocument, type DocumentStore } from "../../../lib/doc";
import type { StyleChoice } from "../../../lib/chem/style";
import type { Arrow, Atom, Bond, Model } from "./store/types";

export type StructureDocument = {
  model: Model;
  arrows: Arrow[];
  /** Legacy global aromatic circles toggle. */
  aromaticEnabled: boolean;
  /** Per-ring aromatic circle flags, keyed by ring key. */
  aromaticRings: Record<string, boolean>;
  /** Ids are handed out from one counter shared by atoms and bonds. */
  nextId: number;
  nextArrowId: number;
  /**
   * The document's own drawing style; unset, it is drawn in the
   * application's. Saving to a MOL or SD file keeps the structure only.
   */
  style?: StyleChoice;
};

export function emptyStructureDocument(): StructureDocument {
  return {
    model: { atoms: [], bonds: [] },
    arrows: [],
    aromaticEnabled: false,
    aromaticRings: {},
    nextId: 1,
    nextArrowId: 1,
  };
}

/**
 * Builds a document for a structure tab. The tab's data may carry a file to
 * import (`payload`), which the view parses and applies, so the document
 * starts empty here.
 */
export function createStructureDocument(): DocumentStore<StructureDocument> {
  return createDocument<StructureDocument>(emptyStructureDocument());
}

// --- atoms and bonds -------------------------------------------------------

export function addAtom(
  doc: StructureDocument,
  x: number,
  y: number,
  el = "C",
  r = 0.9,
): StructureDocument {
  const atom: Atom = { id: doc.nextId, x, y, r, el };
  return {
    ...doc,
    nextId: doc.nextId + 1,
    model: { atoms: [...doc.model.atoms, atom], bonds: doc.model.bonds },
  };
}

export function addBond(
  doc: StructureDocument,
  a: number,
  b: number,
  order: Bond["order"] = 1,
): StructureDocument {
  const bond: Bond = {
    id: doc.nextId,
    a,
    b,
    order,
    stereo: "none",
    stereoOrient: "principle",
  };
  return {
    ...doc,
    nextId: doc.nextId + 1,
    model: { atoms: doc.model.atoms, bonds: [...doc.model.bonds, bond] },
  };
}

export function hasBond(doc: StructureDocument, a: number, b: number): boolean {
  return doc.model.bonds.some(
    (bond) =>
      (bond.a === a && bond.b === b) || (bond.a === b && bond.b === a),
  );
}

/** Bonds two existing atoms, unless they are the same atom or already bonded. */
export function connectAtoms(
  doc: StructureDocument,
  a: number,
  b: number,
  order: Bond["order"] = 1,
): StructureDocument {
  if (a === b || hasBond(doc, a, b)) return doc;
  return addBond(doc, a, b, order);
}

/** One step for the whole "extend a bond" gesture: new atom plus its bond. */
export function addAtomBonded(
  doc: StructureDocument,
  baseId: number,
  x: number,
  y: number,
  el = "C",
  order: Bond["order"] = 1,
): StructureDocument {
  const withAtom = addAtom(doc, x, y, el);
  return addBond(withAtom, baseId, withAtom.nextId - 1, order);
}

/** One step for drawing a fresh bond in empty space. */
export function addBondedPair(
  doc: StructureDocument,
  first: { x: number; y: number; el?: string },
  second: { x: number; y: number; el?: string },
  order: Bond["order"] = 1,
): StructureDocument {
  const withFirst = addAtom(doc, first.x, first.y, first.el ?? "C");
  const firstId = withFirst.nextId - 1;
  const withSecond = addAtom(withFirst, second.x, second.y, second.el ?? "C");
  return addBond(withSecond, firstId, withSecond.nextId - 1, order);
}

export function moveAtom(
  doc: StructureDocument,
  id: number,
  x: number,
  y: number,
): StructureDocument {
  const atoms = doc.model.atoms;
  const index = atoms.findIndex((a) => a.id === id);
  if (index < 0) return doc;
  const atom = atoms[index];
  if (atom.x === x && atom.y === y) return doc;
  const next = atoms.slice();
  next[index] = { ...atom, x, y };
  return { ...doc, model: { atoms: next, bonds: doc.model.bonds } };
}

export function setAtomLabel(
  doc: StructureDocument,
  id: number,
  el: string,
): StructureDocument {
  const atoms = doc.model.atoms;
  const index = atoms.findIndex((a) => a.id === id);
  if (index < 0 || atoms[index].el === el) return doc;
  const next = atoms.slice();
  next[index] = { ...next[index], el };
  return { ...doc, model: { atoms: next, bonds: doc.model.bonds } };
}

export function updateBond(
  doc: StructureDocument,
  id: number,
  patch: Partial<Bond>,
): StructureDocument {
  const bonds = doc.model.bonds;
  const index = bonds.findIndex((b) => b.id === id);
  if (index < 0) return doc;
  const bond = bonds[index];
  const merged = { ...bond, ...patch };
  const unchanged = (Object.keys(patch) as (keyof Bond)[]).every(
    (key) => bond[key] === merged[key],
  );
  if (unchanged) return doc;
  const next = bonds.slice();
  next[index] = merged;
  return { ...doc, model: { atoms: doc.model.atoms, bonds: next } };
}

/**
 * Drops the dragged atom onto another one: bonds that pointed at it are
 * rewired to the target, skipping duplicates and self-bonds.
 */
export function replaceDraggedAtomWith(
  doc: StructureDocument,
  movingId: number,
  targetId: number,
): StructureDocument {
  if (movingId === targetId) return doc;
  const bonds: Bond[] = [];
  for (const b of doc.model.bonds) {
    const other = b.a === movingId ? b.b : b.b === movingId ? b.a : null;
    if (other == null) {
      bonds.push(b);
      continue;
    }
    if (other === targetId) continue; // collapses onto the target
    const exists = bonds.some(
      (kept) =>
        (kept.a === targetId && kept.b === other) ||
        (kept.b === targetId && kept.a === other),
    );
    const alreadyInModel = hasBond(doc, targetId, other);
    if (exists || alreadyInModel) continue;
    bonds.push(b.a === movingId ? { ...b, a: targetId } : { ...b, b: targetId });
  }
  const atoms = doc.model.atoms.filter((a) => a.id !== movingId);
  return { ...doc, model: { atoms, bonds } };
}

// --- whole-model operations ------------------------------------------------

/** Replaces the content, e.g. opening a file: one undo step for the import. */
export function replaceModel(
  doc: StructureDocument,
  next: Model,
): StructureDocument {
  const maxId = Math.max(
    0,
    ...next.atoms.map((a) => a.id || 0),
    ...next.bonds.map((b) => b.id || 0),
  );
  return {
    ...doc,
    model: { atoms: next.atoms.slice(), bonds: next.bonds.slice() },
    arrows: [],
    nextArrowId: 1,
    aromaticEnabled: false,
    aromaticRings: {},
    nextId: Math.max(1, maxId + 1),
  };
}

/** Adds another structure alongside the current one, renumbering its ids. */
export function appendModel(
  doc: StructureDocument,
  next: Model,
): StructureDocument {
  if (next.atoms.length === 0 && next.bonds.length === 0) return doc;
  const idMap = new Map<number, number>();
  let cursor = doc.nextId;
  const atoms = next.atoms.map((a) => {
    const id = cursor++;
    idMap.set(a.id, id);
    return { ...a, id };
  });
  const bonds = next.bonds.map((b) => ({
    ...b,
    id: cursor++,
    a: idMap.get(b.a) ?? b.a,
    b: idMap.get(b.b) ?? b.b,
  }));
  return {
    ...doc,
    nextId: cursor,
    model: {
      atoms: [...doc.model.atoms, ...atoms],
      bonds: [...doc.model.bonds, ...bonds],
    },
  };
}

// --- arrows ----------------------------------------------------------------

/** The reaction arrow a file brings with it, where it lies once placed. */
export type ImportedArrow = { x: number; y: number; angle: number; length: number };

/** `doc` with the file's arrow added, if it brought one. */
export function withImportedArrow(
  doc: StructureDocument,
  arrow?: ImportedArrow,
): StructureDocument {
  return arrow ? addArrow(doc, arrow.x, arrow.y, arrow.angle, arrow.length) : doc;
}

export function addArrow(
  doc: StructureDocument,
  x: number,
  y: number,
  angle: number,
  length: number,
): StructureDocument {
  const arrow: Arrow = { id: doc.nextArrowId, x, y, angle, length };
  return {
    ...doc,
    nextArrowId: doc.nextArrowId + 1,
    arrows: [...doc.arrows, arrow],
  };
}

export function updateArrow(
  doc: StructureDocument,
  id: number,
  patch: Partial<Arrow>,
): StructureDocument {
  const index = doc.arrows.findIndex((a) => a.id === id);
  if (index < 0) return doc;
  const next = doc.arrows.slice();
  next[index] = { ...next[index], ...patch };
  return { ...doc, arrows: next };
}

export function removeArrow(
  doc: StructureDocument,
  id: number,
): StructureDocument {
  const arrows = doc.arrows.filter((a) => a.id !== id);
  return arrows.length === doc.arrows.length ? doc : { ...doc, arrows };
}

// --- aromatic circles ------------------------------------------------------

export function setAromaticEnabled(
  doc: StructureDocument,
  enabled: boolean,
): StructureDocument {
  return doc.aromaticEnabled === enabled
    ? doc
    : { ...doc, aromaticEnabled: enabled };
}

/** Gives the document its own drawing style, or (undefined) the application's. */
export function setDocumentStyle(
  doc: StructureDocument,
  style: StyleChoice | undefined,
): StructureDocument {
  if (doc.style === style) return doc;
  if (style === undefined) {
    const { style: _dropped, ...rest } = doc;
    return rest;
  }
  return { ...doc, style };
}

export function setRingEnabled(
  doc: StructureDocument,
  key: string,
  enabled: boolean,
): StructureDocument {
  if (!!doc.aromaticRings[key] === enabled) return doc;
  return { ...doc, aromaticRings: { ...doc.aromaticRings, [key]: enabled } };
}
