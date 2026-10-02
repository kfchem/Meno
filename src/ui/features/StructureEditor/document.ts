/**
 * The 2D editor's document: what a structure tab actually contains, and what
 * undo, redo and (later) saving act on. Everything here is pure - the store
 * calls these through `document.edit()` so each gesture becomes one step.
 *
 * What is deliberately *not* here: hover, drag previews, the camera, the label
 * edit buffer, fit requests. Those belong to the view (see store/).
 */
import { createDocument, type DocumentStore } from "../../../lib/doc";
import { bondChem, chemistry, type AtomChem } from "../../../lib/chem/molecule";
import { placedAbbreviation } from "../../../lib/chem/abbreviationPlace";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import type { StyleChoice } from "../../../lib/chem/style";
import type { ArrowLook } from "../../../lib/chem/reactionArrow";
import type { Arrow, Atom, Bond, Drawn, Model, Plus } from "./store/types";

export type StructureDocument = {
  model: Model;
  arrows: Arrow[];
  /** The "+" signs of a reaction scheme. */
  pluses: Plus[];
  /** Legacy global aromatic circles toggle. */
  aromaticEnabled: boolean;
  /** Per-ring aromatic circle flags, keyed by ring key. */
  aromaticRings: Record<string, boolean>;
  /** Ids are handed out from one counter shared by atoms and bonds. */
  nextId: number;
  nextArrowId: number;
  nextPlusId: number;
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
    pluses: [],
    aromaticEnabled: false,
    aromaticRings: {},
    nextId: 1,
    nextArrowId: 1,
    nextPlusId: 1,
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

/**
 * Atoms put where they are to go, together - a selection moved, turned or
 * turned over - and, where given, a depth changed and a bond's wedge made
 * hashes or the other way round; everything else about them kept.
 */
export function placeAtoms(
  doc: StructureDocument,
  moves: readonly { id: number; x: number; y: number; z?: number }[],
  stereo: readonly Pick<Bond, "id" | "stereo">[] = [],
): StructureDocument {
  const to = new Map(moves.map((m) => [m.id, m]));
  let changed = false;
  const atoms = doc.model.atoms.map((a) => {
    const m = to.get(a.id);
    if (!m || (m.x === a.x && m.y === a.y && (m.z === undefined || m.z === a.z))) return a;
    changed = true;
    return { ...a, x: m.x, y: m.y, ...(m.z !== undefined ? { z: m.z } : {}) };
  });
  const flip = new Map(stereo.map((b) => [b.id, b.stereo]));
  const bonds = doc.model.bonds.map((b) => {
    const s = flip.get(b.id);
    if (s === undefined || s === b.stereo) return b;
    changed = true;
    return { ...b, stereo: s };
  });
  return changed ? { ...doc, model: { atoms, bonds } } : doc;
}

/**
 * A stroke drawn out of atom `baseId`, in one edit: a bond to each of its
 * nodes in turn - a new carbon where a node has no atom, or the atom already
 * there (`atomId`), or one this stroke added before (`pathIndex`). A bond
 * that is already there is not drawn twice.
 */
export function addStroke(
  doc: StructureDocument,
  baseId: number,
  nodes: readonly {
    x: number;
    y: number;
    atomId?: number;
    pathIndex?: number;
  }[],
): StructureDocument {
  if (!doc.model.atoms.some((a) => a.id === baseId)) return doc;
  let d = doc;
  const ids: number[] = [];
  let from = baseId;
  for (const node of nodes) {
    let to: number;
    if (node.atomId != null) to = node.atomId;
    else if (node.pathIndex != null && ids[node.pathIndex] != null)
      to = ids[node.pathIndex];
    else {
      d = addAtom(d, node.x, node.y);
      to = d.nextId - 1;
    }
    ids.push(to);
    d = connectAtoms(d, from, to);
    from = to;
  }
  return d;
}

/**
 * Atoms and bonds taken out, in one edit: an atom goes with its bonds, and a
 * carbon those left with no bonds at all goes too - a carbon is only there
 * as the meeting of its bonds, and on its own would be drawn as CH4. A
 * labelled atom, an O or an N, stays where it was.
 */
export function deleteParts(
  doc: StructureDocument,
  atomIds: Iterable<number>,
  bondIds: Iterable<number>,
): StructureDocument {
  const atomsGone = new Set(atomIds);
  const bondsGone = new Set(bondIds);
  const { atoms, bonds } = doc.model;
  for (const b of bonds) {
    if (atomsGone.has(b.a) || atomsGone.has(b.b)) bondsGone.add(b.id);
  }
  const left = bonds.filter((b) => !bondsGone.has(b.id));
  const stillBonded = new Set(left.flatMap((b) => [b.a, b.b]));
  for (const b of bonds) {
    if (!bondsGone.has(b.id)) continue;
    for (const end of [b.a, b.b]) {
      const atom = atoms.find((a) => a.id === end);
      if (atom && atom.el === "C" && !stillBonded.has(end)) atomsGone.add(end);
    }
  }
  const kept = atoms.filter((a) => !atomsGone.has(a.id));
  if (kept.length === atoms.length && left.length === bonds.length) return doc;
  return { ...doc, model: { atoms: kept, bonds: left } };
}

/**
 * A new layout for some of the structure, as edits: where each atom goes
 * (and its depth, where it is drawn in perspective; none, where it is not),
 * the wedges changed, and the H atoms drawn to carry a wedge - added, or
 * taken away with their bonds where no longer drawn.
 */
export type Relayout = {
  atoms: { id: number; x: number; y: number; z?: number; stereoCentre?: boolean }[];
  bonds: (Pick<Bond, "id" | "stereo" | "stereoOrient"> & { display?: Bond["display"] })[];
  /** H atoms to add, each bonded to `on`, the bond wedged as given. */
  added?: {
    x: number;
    y: number;
    on: number;
    stereo: NonNullable<Bond["stereo"]>;
    stereoOrient: NonNullable<Bond["stereoOrient"]>;
  }[];
  /** Atoms to take away, with their bonds. */
  removed?: number[];
};

/**
 * A new layout for some of the structure - a clean-up - in one edit: atoms
 * moved, wedges changed, H atoms added and taken away where the new layout
 * needs them. Nothing that would not change is touched.
 */
export function relayout(doc: StructureDocument, change: Relayout): StructureDocument {
  const to = new Map(change.atoms.map((a) => [a.id, a]));
  const gone = new Set(change.removed ?? []);
  let changed = gone.size > 0 || (change.added?.length ?? 0) > 0;
  const atoms = doc.model.atoms.flatMap((a): Atom[] => {
    if (gone.has(a.id)) return [];
    const p = to.get(a.id);
    if (!p) return [a];
    if (p.x === a.x && p.y === a.y && p.z === a.z && !!p.stereoCentre === !!a.stereoCentre) return [a];
    changed = true;
    const { z: _z, stereoCentre: _c, ...rest } = a;
    return [
      {
        ...rest,
        x: p.x,
        y: p.y,
        ...(p.z != null ? { z: p.z } : {}),
        ...(p.stereoCentre ? { stereoCentre: true } : {}),
      },
    ];
  });
  const patch = new Map(change.bonds.map((b) => [b.id, b]));
  const bonds = doc.model.bonds.flatMap((b): Bond[] => {
    if (gone.has(b.a) || gone.has(b.b)) return [];
    const p = patch.get(b.id);
    const display = p && "display" in p ? p.display : b.display;
    if (!p || (p.stereo === b.stereo && p.stereoOrient === b.stereoOrient && display === b.display)) return [b];
    changed = true;
    const { display: _display, ...rest } = b;
    return [{ ...rest, stereo: p.stereo, stereoOrient: p.stereoOrient, ...(display ? { display } : {}) }];
  });
  if (!changed) return doc;
  let nextId = doc.nextId;
  for (const h of change.added ?? []) {
    const id = nextId++;
    atoms.push({ id, x: h.x, y: h.y, r: 0.9, el: "H" });
    bonds.push({ id: nextId++, a: h.on, b: id, order: 1, stereo: h.stereo, stereoOrient: h.stereoOrient });
  }
  return { ...doc, nextId, model: { atoms, bonds } };
}

/**
 * An atom's chemistry set anew - its element or label, charge, radical and
 * isotope, each left off where it has none - leaving where it is alone.
 */
/**
 * An abbreviation drawn out as the atoms it stands for - as the file gave
 * them, turned to where its bond goes now, or the dictionary's, laid out
 * on from that bond - the labelled atom become the one it is attached by,
 * its bonds out leaving from the atoms they did. One undo step.
 */
export function expandAbbreviation(doc: StructureDocument, id: number): StructureDocument {
  const atoms = doc.model.atoms;
  const a = atoms.find((x) => x.id === id);
  if (!a) return doc;
  const touching = doc.model.bonds.filter((b) => b.a === id || b.b === id);
  const out = touching[0] ? atoms.find((x) => x.id === (touching[0].a === id ? touching[0].b : touching[0].a)) : undefined;
  const now = out ? { x: out.x - a.x, y: out.y - a.y } : null;
  const s = a.abbrev ?? placedAbbreviation(a.el, now, NOMINAL_BOND_LENGTH);
  if (!s || !s.atoms.length) return doc;
  // a file's: turned by as much as its bond out has turned since
  const turn = a.abbrev && s.toward && now ? Math.atan2(now.y, now.x) - Math.atan2(s.toward.y, s.toward.x) : 0;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const head = s.attach[0] ?? 0;
  let nextId = doc.nextId;
  const ids = s.atoms.map((_, k) => (k === head ? id : nextId++));
  const placed = s.atoms.map((p) => ({ x: a.x + p.x * cos - p.y * sin, y: a.y + p.x * sin + p.y * cos }));
  const atomOf = (k: number): Atom => {
    const { x: _x, y: _y, z, stereoCentre, ...chem } = s.atoms[k];
    return {
      id: ids[k],
      x: placed[k].x,
      y: placed[k].y,
      r: a.r,
      el: chem.el,
      ...chemistry(chem),
      // (in perspective, as Clean-up draws a cage)
      ...(z != null ? { z } : {}),
      ...(stereoCentre ? { stereoCentre: true } : {}),
    };
  };
  const nextAtoms = atoms.map((x) => (x.id === id ? atomOf(head) : x));
  s.atoms.forEach((_, k) => {
    if (k !== head) nextAtoms.push(atomOf(k));
  });
  const order = new Map(touching.map((b, k) => [b.id, k]));
  const nextBonds = doc.model.bonds.map((b) => {
    const k = order.get(b.id);
    if (k == null) return b;
    const at = s.attach[k] ?? head;
    const to = ids[at];
    const moved = b.a === id ? { ...b, a: to } : { ...b, b: to };
    // to a pi system's star: a haptic bond, to all its atoms; to a donor
    // that lends its pair, a coordination bond (drawn as it was)
    const pi = s.haptic?.find((h) => h.star === at);
    if (pi) return { ...moved, endpoints: pi.atoms.map((e) => ids[e]), attach: "all" as const, coordination: true };
    return s.lends?.[k] && !moved.dative ? { ...moved, coordination: true } : moved;
  });
  for (const b of s.bonds) {
    nextBonds.push({
      id: nextId++,
      a: ids[b.a1],
      b: ids[b.a2],
      order: b.order,
      stereo: b.stereo ?? "none",
      ...(b.stereoOrient ? { stereoOrient: b.stereoOrient } : {}),
      ...(b.display ? { display: b.display } : {}),
      ...bondChem(b),
      ...(b.endpoints ? { endpoints: b.endpoints.map((e) => ids[e]) } : {}),
    });
  }
  return { ...doc, nextId, model: { atoms: nextAtoms, bonds: nextBonds } };
}

/**
 * The atoms `ids` - a group with one bond to the rest of the drawing - shown
 * as one atom labelled `label` where the group is attached, holding them as
 * its abbreviation does (`abbrev`), so that *Expand abbreviation* draws them
 * out again as they were. Unchanged where the atoms are not such a group.
 */
export function contractToAbbreviation(
  doc: StructureDocument,
  ids: ReadonlySet<number>,
  label: string,
): StructureDocument {
  const inside = doc.model.atoms.filter((a) => ids.has(a.id));
  const crossing = doc.model.bonds.filter((b) => ids.has(b.a) !== ids.has(b.b));
  if (!inside.length || crossing.length !== 1) return doc;
  const out = crossing[0];
  const attachId = ids.has(out.a) ? out.a : out.b;
  const att = inside.find((a) => a.id === attachId)!;
  const other = doc.model.atoms.find((a) => a.id === (attachId === out.a ? out.b : out.a))!;
  const index = new Map(inside.map((a, i) => [a.id, i]));
  const inner = doc.model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b));
  const abbrev = {
    atoms: inside.map((a) => {
      const { abbrev: _abbrev, ...chem } = chemistry(a);
      return { el: a.el, ...chem, x: a.x - att.x, y: a.y - att.y };
    }),
    bonds: inner.map((b) => ({
      a1: index.get(b.a)!,
      a2: index.get(b.b)!,
      order: b.order,
      ...(b.stereo && b.stereo !== "none" ? { stereo: b.stereo } : {}),
      ...bondChem(b),
      // (a haptic bond's ends by index, as an abbreviation keeps them)
      ...(b.endpoints ? { endpoints: b.endpoints.map((e) => index.get(e)!).filter((e) => e != null) } : {}),
    })),
    attach: [index.get(attachId)!],
    toward: { x: other.x - att.x, y: other.y - att.y },
  };
  const atoms = doc.model.atoms
    .filter((a) => !ids.has(a.id) || a.id === attachId)
    .map((a) => (a.id === attachId ? { id: a.id, x: a.x, y: a.y, r: a.r, el: label, abbrev } : a));
  const bonds = doc.model.bonds.filter((b) => !(ids.has(b.a) && ids.has(b.b)));
  return { ...doc, model: { atoms, bonds } };
}

export function setAtomChemistry(
  doc: StructureDocument,
  id: number,
  chem: AtomChem,
): StructureDocument {
  const atoms = doc.model.atoms;
  const index = atoms.findIndex((a) => a.id === id);
  if (index < 0) return doc;
  const was = atoms[index];
  // (all of what it is: what is given is the atom it is made - a new label
  // leaves no abbreviation, list or Rgroup of the old one behind)
  const same =
    was.el === chem.el &&
    JSON.stringify(chemistry(was)) === JSON.stringify(chemistry(chem));
  if (same) return doc;
  const {
    charge: _q,
    radical: _r,
    isotope: _i,
    rgroups: _g,
    list: _l,
    valence: _v,
    hCount: _h,
    abbrev: _a,
    ...rest
  } = was;
  const next = atoms.slice();
  next[index] = { ...rest, el: chem.el, ...chemistry(chem) };
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
  // A bond whose order or stereo is changed is the bond it is made: what
  // a file said it was besides - a query, a hydrogen or a coordination
  // bond, a double bond of either configuration - goes with the change.
  if ("order" in patch || "stereo" in patch) {
    for (const key of ["query", "hydrogen", "coordination"] as const) {
      if (!(key in patch)) delete merged[key];
    }
    if (merged.order !== 2 && merged.stereo === "either") merged.stereo = "none";
  }
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
    pluses: [],
    nextPlusId: 1,
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
  for (const a of next.atoms) idMap.set(a.id, cursor++);
  // its Sgroups made its own, apart from any of the same id already here
  const groups = new Map<number, number>();
  const groupId = (g: number) => {
    if (!groups.has(g)) groups.set(g, cursor++);
    return groups.get(g)!;
  };
  const atoms = next.atoms.map((a) => ({
    ...a,
    id: idMap.get(a.id)!,
    ...(a.sgroups
      ? {
          sgroups: a.sgroups.map((g) => ({
            ...g,
            id: groupId(g.id),
            ...(g.parent != null ? { parent: groupId(g.parent) } : {}),
          })),
        }
      : {}),
  }));
  const bonds = next.bonds.map((b) => ({
    ...b,
    id: cursor++,
    a: idMap.get(b.a) ?? b.a,
    b: idMap.get(b.b) ?? b.b,
    ...(b.endpoints ? { endpoints: b.endpoints.map((e) => idMap.get(e) ?? e) } : {}),
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

// --- arrows and pluses ----------------------------------------------------

/**
 * The arrows and "+" signs a file or a paste brings with it, where they lie
 * once placed: given ids of the document's own as they are added.
 */
export type ImportedScheme = {
  arrows?: Omit<Arrow, "id">[];
  pluses?: Omit<Plus, "id">[];
};

/** The arrows and pluses drawn with a part - a paste, a document's record - as a scheme to add. */
export function schemeOf(part: Drawn): ImportedScheme {
  return {
    arrows: (part.arrows ?? []).map(({ id: _id, ...a }) => a),
    pluses: (part.pluses ?? []).map(({ id: _id, ...p }) => p),
  };
}

/** `doc` with the scheme's arrows and pluses added, if it brought any. */
export function withImportedScheme(
  doc: StructureDocument,
  scheme?: ImportedScheme,
): StructureDocument {
  let next = doc;
  for (const a of scheme?.arrows ?? []) {
    next = addArrow(next, a.x, a.y, a.angle, a.length);
    if (a.look) next = setArrowLook(next, next.nextArrowId - 1, a.look);
  }
  for (const p of scheme?.pluses ?? []) next = addPlus(next, p.x, p.y);
  return next;
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

/** `doc` with the arrow setting `look` for itself, in place of what it set. */
export function setArrowLook(
  doc: StructureDocument,
  id: number,
  look: ArrowLook,
): StructureDocument {
  const index = doc.arrows.findIndex((a) => a.id === id);
  if (index < 0) return doc;
  const next = doc.arrows.slice();
  const { look: _was, ...arrow } = next[index];
  next[index] = Object.keys(look).length ? { ...arrow, look } : arrow;
  return { ...doc, arrows: next };
}

export function removeArrow(
  doc: StructureDocument,
  id: number,
): StructureDocument {
  const arrows = doc.arrows.filter((a) => a.id !== id);
  return arrows.length === doc.arrows.length ? doc : { ...doc, arrows };
}

export function addPlus(doc: StructureDocument, x: number, y: number): StructureDocument {
  const pluses = doc.pluses ?? [];
  const nextPlusId = doc.nextPlusId ?? 1;
  return { ...doc, nextPlusId: nextPlusId + 1, pluses: [...pluses, { id: nextPlusId, x, y }] };
}

export function movePlus(doc: StructureDocument, id: number, x: number, y: number): StructureDocument {
  const pluses = doc.pluses ?? [];
  const index = pluses.findIndex((p) => p.id === id);
  if (index < 0) return doc;
  const next = pluses.slice();
  next[index] = { ...next[index], x, y };
  return { ...doc, pluses: next };
}

export function removePlus(doc: StructureDocument, id: number): StructureDocument {
  const pluses = (doc.pluses ?? []).filter((p) => p.id !== id);
  return pluses.length === (doc.pluses ?? []).length ? doc : { ...doc, pluses };
}

/** Where arrows and pluses go, by id. */
export type MarkPlaces = {
  arrows?: { id: number; x: number; y: number }[];
  pluses?: { id: number; x: number; y: number }[];
};

/** `doc` with the arrows and pluses `places` names where it says. */
export function placeMarks(doc: StructureDocument, places?: MarkPlaces): StructureDocument {
  if (!places?.arrows?.length && !places?.pluses?.length) return doc;
  const arrowAt = new Map((places.arrows ?? []).map((p) => [p.id, p]));
  const plusAt = new Map((places.pluses ?? []).map((p) => [p.id, p]));
  const at = <T extends { id: number; x: number; y: number }>(t: T, m: Map<number, { x: number; y: number }>): T => {
    const p = m.get(t.id);
    return p ? { ...t, x: p.x, y: p.y } : t;
  };
  return {
    ...doc,
    arrows: doc.arrows.map((a) => at(a, arrowAt)),
    pluses: (doc.pluses ?? []).map((p) => at(p, plusAt)),
  };
}

/** `doc` without the atoms and bonds given, nor the arrows and pluses: what a cut takes. */
export function deleteDrawn(
  doc: StructureDocument,
  atoms: Set<number>,
  bonds: Set<number>,
  arrows: Set<number>,
  pluses: Set<number>,
): StructureDocument {
  const rest = atoms.size || bonds.size ? deleteParts(doc, atoms, bonds) : doc;
  const keptArrows = rest.arrows.filter((a) => !arrows.has(a.id));
  const keptPluses = (rest.pluses ?? []).filter((p) => !pluses.has(p.id));
  return keptArrows.length === rest.arrows.length && keptPluses.length === (rest.pluses ?? []).length
    ? rest
    : { ...rest, arrows: keptArrows, pluses: keptPluses };
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
