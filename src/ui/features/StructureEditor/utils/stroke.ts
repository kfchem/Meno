/**
 * A stroke: bonds drawn out of an atom in one press of the button.
 *
 * - A **bond** stroke - a plain drag from an atom - draws one bond, which
 *   points where the pointer leads it (see `snapBond`) and, after a pause,
 *   goes exactly where the pointer is.
 * - A **chain** stroke - a double-click on an atom, then a drag - lays an
 *   atom down every time the pointer has gone a bond's length past the last
 *   one, turning 120 degrees each time to follow it (see `chainStep`); a
 *   pause lays down the bond it is on.
 *
 * Either ends on an atom already there when it comes within reach of one -
 * it closes a ring - and a chain goes on from it. A bond also ends on the
 * atom the pointer is on, however far away: a long bond closes a ring too. Nothing is added to the
 * document until the button comes up: the stroke is one undo step.
 */
import { chainStart, chainStep, snapBond, type Pt } from "./extendSnap";

/**
 * An atom a stroke has reached: a new one where it goes, an atom already
 * there (`atomId`), or one this stroke laid down before (`pathIndex`).
 */
export type StrokeNode = Pt & { atomId?: number; pathIndex?: number };

export type Stroke = {
  kind: "bond" | "chain";
  baseId: number;
  nodes: StrokeNode[];
  /** Which way the chain turned last: +1 left, -1 right, 0 not yet. */
  lastTurn: number;
  /** A bond stroke after a pause: it goes where the pointer is, unsnapped. */
  free: boolean;
};

type StrokeModel = {
  atoms: readonly { id: number; x: number; y: number }[];
  bonds: readonly { a: number; b: number }[];
};

/** How near an atom the end of a bond has to come to close onto it. */
export const JOIN_REACH = 0.4;
/** How far past the last atom the pointer has to be for a chain's pause or release to add a bond. */
const LAY_REACH = 0.35;
const RELEASE_REACH = 0.5;

export function startStroke(kind: Stroke["kind"], baseId: number): Stroke {
  return { kind, baseId, nodes: [], lastTurn: 0, free: false };
}

/** The atom a stroke is at: where it is, the one before it, and what it is bonded to. */
function tipOf(model: StrokeModel, s: Stroke) {
  const at = new Map(model.atoms.map((a) => [a.id, a]));
  const bondedTo = (id: number) =>
    model.bonds.flatMap((b) =>
      b.a === id ? [b.b] : b.b === id ? [b.a] : [],
    );
  const base = at.get(s.baseId);
  if (!base) return null;
  const n = s.nodes.length;
  const tip: Pt = n ? s.nodes[n - 1] : base;
  const previous: Pt | null = n > 1 ? s.nodes[n - 2] : n === 1 ? base : null;
  const tipAtom = n ? s.nodes[n - 1].atomId : s.baseId;
  // the atoms the tip is bonded to, in the model and in the stroke
  const neighbours: Pt[] = [];
  const bonded = new Set<number>();
  if (tipAtom != null) {
    for (const id of bondedTo(tipAtom)) {
      const a = at.get(id);
      if (a) neighbours.push(a);
      bonded.add(id);
    }
  }
  if (previous) neighbours.push(previous);
  return { tip, previous, tipAtom, neighbours, bonded, at };
}

export type StrokeTarget = {
  /** The atom the bond starts at, and where it ends. */
  tip: Pt;
  end: Pt;
  /** Set when it ends on an atom already there, or one of this stroke's. */
  atomId?: number;
  pathIndex?: number;
  /** The bond it makes 120 degrees with, when it snapped to that. */
  trigonalTo?: number;
  turn?: 1 | -1;
};

/** The bond the pointer is leading, not yet laid down. */
export function strokeTarget(
  model: StrokeModel,
  s: Stroke,
  pointer: Pt,
  length: number,
): StrokeTarget | null {
  const t = tipOf(model, s);
  if (!t) return null;
  let end: Pt;
  let trigonalTo: number | undefined;
  let turn: 1 | -1 | undefined;
  if (s.kind === "bond" && s.free) {
    end = pointer;
  } else if (s.kind === "chain" && t.previous) {
    const step = chainStep(t.previous, t.tip, pointer, s.lastTurn, length);
    end = step.end;
    turn = step.turn;
  } else if (s.kind === "chain") {
    const first = chainStart(t.tip, t.neighbours, pointer, length);
    end = first.end;
    trigonalTo = first.trigonalTo;
    if (first.turn !== 0) turn = first.turn;
  } else {
    const b = snapBond(t.tip, t.neighbours, pointer, length);
    end = b.end;
    trigonalTo = b.trigonalTo;
  }
  // closing onto an atom within reach: one already there...
  const reach = JOIN_REACH * length;
  let bestFar = reach;
  let join: { atomId?: number; pathIndex?: number; at: Pt } | null = null;
  // (a bond goes to the atom the pointer is on, however far that is: a
  // ring is closed with a long bond as well as a short one)
  if (s.kind === "bond") {
    for (const a of model.atoms) {
      if (a.id === t.tipAtom || t.bonded.has(a.id)) continue;
      const far = Math.hypot(a.x - pointer.x, a.y - pointer.y);
      if (far < bestFar) {
        bestFar = far;
        join = { atomId: a.id, at: a };
      }
    }
    if (join) bestFar = 0;
  }
  for (const a of model.atoms) {
    if (a.id === t.tipAtom || t.bonded.has(a.id)) continue;
    const far = Math.hypot(a.x - end.x, a.y - end.y);
    if (far < bestFar) {
      bestFar = far;
      join = { atomId: a.id, at: a };
    }
  }
  // ...or one this stroke laid down, short of the last two
  s.nodes.forEach((node, i) => {
    if (i >= s.nodes.length - 2 || node.atomId != null || node.pathIndex != null)
      return;
    const far = Math.hypot(node.x - end.x, node.y - end.y);
    if (far < bestFar) {
      bestFar = far;
      join = { pathIndex: i, at: node };
    }
  });
  if (join) {
    const j = join as { atomId?: number; pathIndex?: number; at: Pt };
    return {
      tip: t.tip,
      end: { x: j.at.x, y: j.at.y },
      atomId: j.atomId,
      pathIndex: j.pathIndex,
      turn,
    };
  }
  return { tip: t.tip, end, trigonalTo, turn };
}

function lay(s: Stroke, target: StrokeTarget): Stroke {
  const node: StrokeNode = { x: target.end.x, y: target.end.y };
  if (target.atomId != null) node.atomId = target.atomId;
  if (target.pathIndex != null) node.pathIndex = target.pathIndex;
  return {
    ...s,
    nodes: [...s.nodes, node],
    lastTurn: target.turn ?? s.lastTurn,
  };
}

/**
 * The stroke after the pointer has moved: a chain lays an atom down for
 * every bond length the pointer has gone past the last one.
 */
export function advanceStroke(
  model: StrokeModel,
  s: Stroke,
  pointer: Pt,
  length: number,
): Stroke {
  if (s.kind !== "chain") return s;
  let next = s;
  for (let i = 0; i < 64; i++) {
    const target = strokeTarget(model, next, pointer, length);
    if (!target) break;
    if (Math.hypot(pointer.x - target.tip.x, pointer.y - target.tip.y) < length)
      break;
    next = lay(next, target);
  }
  return next;
}

/**
 * A pause in the stroke: a bond lets go of the grid and follows the pointer
 * exactly; a chain lays down the bond it is on, snapped as it is.
 */
export function holdStroke(
  model: StrokeModel,
  s: Stroke,
  pointer: Pt,
  length: number,
): Stroke {
  if (s.kind === "bond") return s.free ? s : { ...s, free: true };
  const target = strokeTarget(model, s, pointer, length);
  if (!target) return s;
  const far = Math.hypot(pointer.x - target.tip.x, pointer.y - target.tip.y);
  return far < LAY_REACH * length ? s : lay(s, target);
}

/**
 * Everything the stroke adds when the button comes up: its atoms, and the
 * bond it is on - always for a bond, for a chain only when the pointer has
 * gone far enough past the last atom to mean it.
 */
export function finishStroke(
  model: StrokeModel,
  s: Stroke,
  pointer: Pt,
  length: number,
): StrokeNode[] {
  const target = strokeTarget(model, s, pointer, length);
  if (!target) return s.nodes;
  if (s.kind === "chain") {
    const far = Math.hypot(pointer.x - target.tip.x, pointer.y - target.tip.y);
    if (far < RELEASE_REACH * length) return s.nodes;
  }
  return lay(s, target).nodes;
}
