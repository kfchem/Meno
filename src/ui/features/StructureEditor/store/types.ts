import type { ImportedScheme, MarkPlaces, Relayout, WrittenAsLabel } from "../document";
import type { ArrowLook } from "../../../../lib/chem/reactionArrow";
import type { EditorAtom } from "../../../../utils/importers";
import type { Stroke, StrokeNode } from "../utils/stroke";
import type { StyleChoice } from "../../../../lib/chem/style";
import type { BondChem, ParsedAtom, ParsedBond } from "../../../../lib/chem/molecule";
import type { Workspace } from "../utils/workspace";

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
  /**
   * How a single bond with no stereo is drawn; plain when unset. "wedge" is
   * a ring's bond in perspective toward the viewer, narrow where
   * `stereoOrient` says; on a double bond it, or "bold", is the line the
   * second one is drawn beside.
   */
  display?: "plain" | "bold" | "hashed" | "dashed" | "wedge";
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
  /** What it sets for itself over the drawing style: its line and its head. */
  look?: ArrowLook;
};
/** A "+" between two structures of a reaction scheme: where its middle is. */
export type Plus = { id: number; x: number; y: number };
/** How a molecule in 3D is drawn: balls and sticks, or space-filling. */
export type Look3D = "balls" | "space";
/**
 * A measurement on a molecule in 3D, between its atoms by index, in the
 * order they were chosen: two, a distance; three, the angle at the middle
 * one; four, the torsion angle about the middle two. It is measured afresh
 * in whatever frame is shown.
 */
export type Measure3D = { id: number; atoms: number[] };
/**
 * A molecule in 3D, standing on the page: its atoms where its file put
 * them, in ångströms, and its bonds by atom index. How it is turned, and
 * which frame is shown, are the view's (`turns3d`, `frames3d`), not the
 * document's: they change nothing about it.
 */
export type Molecule3D = {
  id: number;
  atoms: ParsedAtom[];
  bonds: ParsedBond[];
  /**
   * Where on the page its centre stands, in world units; and `z`, how high
   * above the page - unset, as high as it reaches, so that no turn takes it
   * behind the page. Molecules turned together as one body have their
   * heights set, each where the turn put it.
   */
  at: { x: number; y: number; z?: number };
  /** The rest of a file's frames (a trajectory, conformers): x, y, z of every atom, frame by frame. */
  frames?: number[][];
  /** Each frame's energy, where its file gives one, in hartrees: the first frame's first. */
  energies?: number[];
  /** Its own look; unset, the 3D style's. */
  look?: Look3D;
  measures?: Measure3D[];
  /** The file it came from. */
  name?: string;
};
/** A turn, as a quaternion's x, y, z and w. */
export type Turn3D = [number, number, number, number];
/**
 * Structures with the arrows and "+" signs drawn among them: what a copy
 * takes, a picture shows and a paste brings.
 */
/**
 * A molecule in 3D as a copy carries it: as the document has it, and how it
 * was turned and which frame it showed, so that a paste shows it the same.
 */
export type Carried3D = Omit<Molecule3D, "id"> & { turn?: Turn3D; frame?: number };
export type Drawn = Model & { arrows?: Arrow[]; pluses?: Plus[]; molecules3d?: Carried3D[] };

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
  /** The molecule in 3D under the pointer: on its atoms, its bonds or within its rings. */
  hovered3d: { id: number } | null;
  /** The molecules in 3D on the page. */
  molecules3d: Molecule3D[];
  /** How each molecule in 3D is turned, by id; unturned if absent. */
  turns3d: Record<number, Turn3D>;
  /** Which frame each molecule in 3D shows, by id; the first if absent. */
  frames3d: Record<number, number>;
  /** The molecules in 3D selected, whole, by id: besides `sel`, which is the drawing's. */
  sel3d: Set<number>;
  /**
   * The atoms and bonds chosen in one molecule in 3D, by index, each in the
   * order chosen: what a measurement is of (utils/molecule3d `chosenPath`).
   */
  chosen3d: { id: number; atoms: number[]; bonds: number[] } | null;
  /** The measurement under the pointer: its molecule and its own id. */
  hoveredMeasure3d: { id: number; measure: number } | null;
  setHoveredMeasure3d: (h: { id: number; measure: number } | null) => void;
  setHovered3d: (h: { id: number } | null) => void;
  setTurn3d: (id: number, turn: Turn3D) => void;
  /** A molecule in 3D turned back to face as its file has it. */
  resetTurn3d: (id: number) => void;
  setFrame3d: (id: number, frame: number) => void;
  /** Molecules in 3D selected, alone or (`add`) with what is selected already. */
  selectMolecules3d: (ids: Iterable<number>, add?: boolean) => void;
  /** A molecule in 3D taken into the selection, or out of it. */
  toggleMolecule3dSel: (id: number) => void;
  /**
   * An atom of a molecule in 3D chosen, or let go if it was: one in another
   * molecule, or a fifth, starts the choice afresh.
   */
  chooseAtom3d: (id: number, atom: number) => void;
  /** A bond of a molecule in 3D chosen, or let go if it was; likewise. */
  chooseBond3d: (id: number, bond: number) => void;
  /**
   * Molecules in 3D turned together, as one body: where each now stands is
   * the document's, one undo step for all that share `gesture`, and how each
   * is turned the view's - but an undo or a redo of the step puts the turns
   * back as they were too. The drawing turned with them, if any, likewise.
   */
  turnMolecules3d: (
    moves: { id: number; at: { x: number; y: number; z?: number }; turn: Turn3D }[],
    gesture: string,
    drawing?: { id: number; x: number; y: number }[],
  ) => void;
  /**
   * Molecules in 3D turned where they stand, by the selection's handle, from
   * `turnsBefore` to `turnsAfter` (each set as it turned): one undo step,
   * which puts the turns back - though how each is turned is the view's,
   * and where they stand has not changed.
   */
  keepTurns3d: (turnsBefore: Record<number, Turn3D | undefined>, turnsAfter: Record<number, Turn3D>) => void;
  /** Moves a molecule in 3D on the page; moves sharing `gesture` are one undo step. */
  moveMolecule3d: (id: number, at: { x: number; y: number }, gesture?: string) => void;
  /** Moves molecules in 3D on the page together; moves sharing `gesture` are one undo step. */
  moveMolecules3d: (moves: { id: number; at: { x: number; y: number; z?: number } }[], gesture?: string) => void;
  removeMolecule3d: (id: number) => void;
  setLook3d: (id: number, look: Look3D) => void;
  /** A measurement of the atoms and bonds chosen, which are then let go. */
  measureChosen3d: () => void;
  removeMeasure3d: (id: number, measure: number) => void;
  /** The reaction arrow under the pointer: its menu is the one a right-click opens. */
  hoveredArrow: number | null;
  /** The "+" under the pointer, likewise. */
  hoveredPlus: number | null;
  hoverPulse: { id: number | null; nonce: number; until: number };
  arrows: Arrow[];
  pluses: Plus[];
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
  nextPlusId: number;
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
   * groups written by their labels first, where it writes them, then atoms
   * moved, and wedges changed where the layout needs them.
   */
  relayout: (change: Relayout, labels?: readonly WrittenAsLabel[]) => void;
  /**
   * The atoms the last edit drew out of an abbreviation - a run of them,
   * where the edits before it did too - which Clean-up leaves drawn out;
   * none after any other edit.
   */
  justExpanded: () => ReadonlySet<number>;
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
  /**
   * Atoms moved to where they go - and `marks`, arrows and pluses, with them
   * - all of one gesture one step.
   */
  moveAtoms: (moves: { id: number; x: number; y: number }[], gesture: string, marks?: MarkPlaces) => void;
  /** The selection turned over, left to right or top to bottom (utils/selection). */
  turnSelectionOver: (axis: "vertical" | "horizontal") => void;
  /** The selection deleted, as one undo step. */
  deleteSelection: () => void;
  /** A structure from the clipboard added where it already stands, selected, as one undo step. */
  pasteModel: (next: Drawn) => void;
  setHoveredFromId: (id: number) => void;
  clearHovered: () => void;
  setHoveredArrow: (id: number | null) => void;
  setHoveredPlus: (id: number | null) => void;
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
  openModel: (next: Model, scheme?: ImportedScheme) => void;
  /** A file opened over the canvas's contents, as one undo step. */
  replaceModel: (next: Model, scheme?: ImportedScheme) => void;
  /**
   * A workspace file opened: everything in it, as it was saved - over what
   * the canvas holds, as one step, or (`start`) as where the document starts.
   */
  openWorkspace: (ws: Workspace, start?: boolean) => void;
  /** A file dropped onto the canvas, or a SMILES beside what is drawn: added, selected, as one undo step. */
  appendModel: (next: Model, scheme?: ImportedScheme) => void;
  /** Clears hover, selection and gestures after the structure is replaced. */
  forgetInteraction: () => void;
  /** A reaction arrow added, pointing `angle` radians from the x axis (right), as one step; its id. */
  addArrow: (x: number, y: number, angle?: number, length?: number) => number;
  /** An arrow moved or reshaped; a run of changes in one gesture - a drag - is one step. */
  updateArrow: (id: number, patch: Partial<Arrow>, gesture?: string) => void;
  /** A "+" added, as one step; its id. */
  addPlus: (x: number, y: number) => number;
  removeArrow: (id: number) => void;
  /** A "+" moved; a run of moves in one gesture, a drag, is one step. */
  movePlus: (id: number, x: number, y: number, gesture?: string) => void;
  removePlus: (id: number) => void;
  /** What a cut takes, gone as one undo step: atoms, bonds, arrows and pluses. */
  /** What a cut took, gone: the drawn part, and the molecules in 3D by id, in one step. */
  deleteDrawn: (part: Drawn, molecules3d?: number[]) => void;
  /** An abbreviation drawn out as the atoms it stands for, as one undo step. */
  expandAbbreviation: (id: number) => void;
  /** A group of atoms shown as one atom labelled `label`, holding them, as one undo step. */
  contractToAbbreviation: (ids: ReadonlySet<number>, label: string) => void;
  /**
   * What an arrow sets for itself, in place of what it had. `coalesceKey`
   * takes a run of changes to one setting - a slider dragged - as one step.
   */
  setArrowLook: (id: number, look: ArrowLook, coalesceKey?: string) => void;
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
