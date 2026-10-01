import type { ImportedArrow, Relayout } from "../document";
import type { EditorAtom } from "../../../../utils/importers";
import type { Stroke, StrokeNode } from "../utils/stroke";
import type { StyleChoice } from "../../../../lib/chem/style";
import type { BondChem } from "../../../../lib/chem/molecule";

/** An atom as the editor holds it: its chemistry (lib/chem/molecule), where it is, and more. */
export type Atom = EditorAtom & {
  /**
   * How near the viewer the atom is, where its structure is drawn in
   * perspective - a cage, as Clean-up draws one: a bond passing behind
   * another is drawn broken there. World units.
   */
  z?: number;
  /**
   * A stereocentre whose configuration the perspective drawing itself shows,
   * with no wedge: it is read from where its bonds point (lib/layout/drawn).
   */
  stereoCentre?: boolean;
};
export type Bond = BondChem & {
  id: number;
  a: number;
  b: number;
  order: 1 | 2 | 3;
  /** A single bond's wedge, hash or wave; a double bond's "either": cis or trans not known. */
  stereo?: "up" | "down" | "wavy" | "either" | "none";
  doubleMode?: "auto" | "center" | "left" | "right";
  stereoOrient?: "principle" | "reverse";
  /** How a single bond with no stereo is drawn; plain when unset. */
  display?: "plain" | "bold" | "hashed" | "dashed";
  /** A dative bond, drawn as an arrow from `a`, the donor, to `b`. */
  dative?: boolean;
};

export type Sel = { atoms: Set<number>; bonds: Set<number> };

export type Model = { atoms: Atom[]; bonds: Bond[] };
export type Arrow = {
  id: number;
  x: number;
  y: number;
  angle: number; // radians
  length: number; // world units
};

export type EditorState = {
  model: Model;
  sel: Sel;
  /** The last atom chosen into the selection: where a Shift+click's path starts. */
  selAnchor: number | null;
  /**
   * A box or a lasso being drawn to select what it holds, in world units:
   * the box's two corners, or the lasso's path.
   */
  boxSelect: { active: boolean; kind: "box" | "lasso"; points: { x: number; y: number }[] };
  hovered: { atomId: number | null; bondId: number | null };
  hoverPulse: { id: number | null; nonce: number; until: number };
  arrows: Arrow[];
  fitNonce: number;
  autoFitSuspended: boolean;
  aromaticEnabled: boolean; // legacy/global
  aromaticRings: Record<string, boolean>; // per-ring enabled flags by ringKey
  /** The document's own drawing style, if it has one (see useDrawingStyle). */
  docStyle?: StyleChoice;
  labelEdit: {
    active: boolean;
    atomId: number | null;
    value: string;
    autoCap: boolean;
    /** When it was begun, and with what: a double-click takes back one its first click began. */
    opened?: { at: number; value: string };
  };
  moveDrag: {
    active: boolean;
    atomId: number | null;
    pointer: { x: number; y: number } | null;
    mode?: "snap" | "free";
    /**
     * Where the dragged atom is actually previewed (after snapping), published
     * by MovePreview2D so other layers - the label, for one - can follow it.
     */
    preview?: { x: number; y: number } | null;
  };
  extend: {
    active: boolean;
    atomId: number | null;
    pointer: { x: number; y: number } | null;
    /** "free" once a bond stroke has paused: it follows the pointer exactly. */
    mode: "snap" | "free";
    /** The stroke being drawn: a bond or a chain, and what it has laid down. */
    stroke?: Stroke | null;
    /**
     * Where the bond the pointer is leading ends, as ExtendPreview2D shows it
     * (after snapping, and the spring into place) - on an atom already there
     * or one of the stroke's own when it closes onto it - so the drawing can
     * lay it out there.
     */
    preview?: { x: number; y: number; atomId?: number; pathIndex?: number } | null;
  };
  panHold: { active: boolean; pointerId: number | null };
  suppressDblClickUntil: number;
  nextId: number;
  nextArrowId: number;
  addAtom: (x: number, y: number, el?: string, r?: number) => number;
  addBond: (a: number, b: number, order?: Bond["order"]) => number;
  /** New atom plus its bond to `baseId`, as one undo step. */
  addAtomBonded: (
    baseId: number,
    x: number,
    y: number,
    el?: string,
    order?: Bond["order"],
  ) => number;
  /** Two new atoms and the bond between them, as one undo step. */
  addBondedPair: (
    first: { x: number; y: number; el?: string },
    second: { x: number; y: number; el?: string },
    order?: Bond["order"],
  ) => void;
  connectAtoms: (a: number, b: number, order?: Bond["order"]) => number | null;
  replaceDraggedAtomWith: (movingId: number, targetId: number) => void;
  moveAtom: (id: number, x: number, y: number) => void;
  /**
   * Deletes an atom and its bonds, or a bond, as one undo step; a carbon
   * left with no bonds goes too.
   */
  /** An atom's charge one up (+1) or one down (-1), as one undo step. */
  stepCharge: (id: number, step: 1 | -1) => void;
  /** An atom's unpaired electron given, or taken away. */
  toggleRadical: (id: number) => void;
  deleteAtom: (id: number) => void;
  deleteBond: (id: number) => void;
  /**
   * A new layout for some of the structure - a clean-up - as one undo step:
   * atoms moved, and wedges changed where the layout needs them.
   */
  relayout: (change: Relayout) => void;
  updateBond: (id: number, patch: Partial<Bond>) => void;
  setBondOrder: (id: number, order: Bond["order"]) => void;
  setBondStereo: (id: number, stereo: NonNullable<Bond["stereo"]>) => void;
  setBondDoubleMode: (
    id: number,
    mode: NonNullable<Bond["doubleMode"]>,
  ) => void;
  setBondStereoOrient: (
    id: number,
    orient: NonNullable<Bond["stereoOrient"]>,
  ) => void;
  setSel: (sel: Sel, anchor?: number | null) => void;
  toggleAtomSel: (id: number) => void;
  toggleBondSel: (id: number) => void;
  selectPathTo: (id: number) => void;
  selectStructure: (id: number) => void;
  selectAll: () => void;
  clearSel: () => void;
  setBoxSelect: (box: EditorState["boxSelect"]) => void;
  /** Atoms moved together - a selection dragged or turned - the moves of one gesture one undo step. */
  moveAtoms: (moves: { id: number; x: number; y: number }[], gesture: string) => void;
  /** The selection turned over, left to right or top to bottom (utils/selection). */
  turnSelectionOver: (axis: "vertical" | "horizontal") => void;
  /** The selection deleted, as one undo step. */
  deleteSelection: () => void;
  /** A structure from the clipboard added where it already stands, selected, as one undo step. */
  pasteModel: (next: Model) => void;
  setHoveredFromId: (id: number) => void;
  clearHovered: () => void;
  clearAtomHover: () => void;
  clearBondHover: () => void;
  /** Begins a stroke out of an atom: one bond, or a chain. */
  startExtend: (atomId: number, kind?: Stroke["kind"]) => void;
  updateExtend: (x: number, y: number) => void;
  /** A pause in the stroke: see `holdStroke`. */
  holdExtend: () => void;
  commitExtend: () => void;
  cancelExtend: () => void;
  /** A finished stroke, added as one undo step. */
  drawStroke: (
    baseId: number,
    nodes: readonly StrokeNode[],
    kind: Stroke["kind"],
  ) => void;
  suppressDoubleClick: (ms?: number) => void;
  triggerHoverPulse: (bondId: number) => void;
  beginPanHold: (pointerId: number | null) => void;
  endPanHold: (pointerId?: number | null) => void;
  setMoveMode: (mode: "snap" | "free") => void;
  beginMoveDrag: (
    atomId: number,
    pointer?: { x: number; y: number } | null,
  ) => void;
  updateMovePointer: (x: number, y: number) => void;
  setMoveDragPreview: (x: number, y: number) => void;
  /**
   * The file this canvas was last saved to, which Save writes to again; none
   * until it has been saved once.
   */
  savedPath: string | null;
  /** The document has just been written to `path`: it is saved there. */
  markSavedAs: (path: string) => void;
  setExtendPreview: (
    x: number,
    y: number,
    join?: { atomId?: number; pathIndex?: number },
  ) => void;
  endMoveDrag: () => void;
  /** The structure a tab opens with: where its document starts, not an edit. */
  openModel: (next: Model, arrow?: ImportedArrow) => void;
  /** A file opened over the canvas's contents, as one undo step. */
  replaceModel: (next: Model, arrow?: ImportedArrow) => void;
  /** A file dropped onto the canvas, or a SMILES beside what is drawn: added, selected, as one undo step. */
  appendModel: (next: Model, arrow?: ImportedArrow) => void;
  /** Clears hover, selection and gestures after the structure is replaced. */
  forgetInteraction: () => void;
  addArrow: (x: number, y: number, angle?: number, length?: number) => number;
  updateArrow: (id: number, patch: Partial<Arrow>) => void;
  removeArrow: (id: number) => void;
  requestFit: () => void;
  beginAutoFitSuspend: () => void;
  endAutoFitSuspend: () => void;
  findAtomNear: (
    x: number,
    y: number,
    tol?: number,
    excludeId?: number | null,
  ) => number | null;
  beginLabelEdit: (
    atomId: number,
    initial?: string,
    forceLower?: boolean,
  ) => void;
  setLabelEditValue: (value: string) => void;
  commitLabelEdit: () => void;
  cancelLabelEdit: () => void;
  setAromaticEnabled: (v: boolean) => void;
  /**
   * Gives the document its own drawing style, or the application's again
   * (undefined). Changes sharing `coalesceKey` - a drag along a slider - are
   * one undo step.
   */
  setDocumentStyle: (style: StyleChoice | undefined, coalesceKey?: string) => void;
  toggleAromatic: () => void;
  setRingEnabled: (key: string, v: boolean) => void;
  toggleRing: (key: string) => void;
};
