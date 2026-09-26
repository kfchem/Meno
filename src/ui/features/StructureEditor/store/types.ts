import type { ImportedArrow } from "../document";

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
    mode: "snap" | "free";
    /**
     * Where the new atom is previewed (after snapping), published by
     * ExtendPreview2D so the drawing can lay the new bond out there.
     */
    preview?: { x: number; y: number } | null;
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
  startExtend: (atomId: number) => void;
  updateExtend: (x: number, y: number) => void;
  commitExtend: () => void;
  cancelExtend: () => void;
  suppressDoubleClick: (ms?: number) => void;
  triggerHoverPulse: (bondId: number) => void;
  beginPanHold: (pointerId: number | null) => void;
  endPanHold: (pointerId?: number | null) => void;
  setExtendMode: (mode: "snap" | "free") => void;
  setMoveMode: (mode: "snap" | "free") => void;
  beginMoveDrag: (
    atomId: number,
    pointer?: { x: number; y: number } | null,
  ) => void;
  updateMovePointer: (x: number, y: number) => void;
  setMoveDragPreview: (x: number, y: number) => void;
  setExtendPreview: (x: number, y: number) => void;
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
  toggleAromatic: () => void;
  setRingEnabled: (key: string, v: boolean) => void;
  toggleRing: (key: string) => void;
};
