import type { ImportedArrow } from "../document";
import type { Stroke, StrokeNode } from "../utils/stroke";
import type { StyleChoice } from "../../../../lib/chem/style";

export type Atom = { id: number; x: number; y: number; r: number; el: string };
export type Bond = {
  id: number;
  a: number;
  b: number;
  order: 1 | 2 | 3;
  stereo?: "up" | "down" | "wavy" | "none";
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
  /** The atom a long press has lifted to be moved, before it moves. */
  moveArmed: number | null;
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
  deleteAtom: (id: number) => void;
  deleteBond: (id: number) => void;
  /**
   * A new layout for some of the structure - a clean-up - as one undo step:
   * atoms moved, and wedges changed where the layout needs them.
   */
  relayout: (change: {
    atoms: { id: number; x: number; y: number }[];
    bonds: Pick<Bond, "id" | "stereo" | "stereoOrient">[];
  }) => void;
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
  toggleAtomSel: (id: number, multi?: boolean) => void;
  clearSel: () => void;
  setHoveredFromId: (id: number) => void;
  clearHovered: () => void;
  clearAtomHover: () => void;
  clearBondHover: () => void;
  /** Begins a stroke out of an atom: one bond, or a chain. */
  startExtend: (atomId: number, kind?: Stroke["kind"]) => void;
  updateExtend: (x: number, y: number) => void;
  /** A pause in the stroke: see `holdStroke`. */
  holdExtend: () => void;
  setMoveArmed: (atomId: number | null) => void;
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
  /** A file dropped onto the canvas, added as one undo step. */
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
