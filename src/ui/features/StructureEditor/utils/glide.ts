/**
 * How a drawing goes from one shape to another - after a Clean-up, an undo,
 * a snap - rather than jumping: each structure turns as a whole, or turns
 * over, about its middle, moves to where it is going, and settles into its
 * new shape on the way. Moving each atom straight to its place would fold a
 * structure through itself whenever it comes out turned round.
 */

export type Pt = { x: number; y: number; z?: number };

type Part = {
  ids: number[];
  /** The structure's middle before and after. */
  from: Pt;
  to: Pt;
  /** How far it turns, in radians, and whether it turns over. */
  turn: number;
  over: boolean;
  /** Each atom about the middle as it was, and what the turn leaves for it to move. */
  about: Map<number, Pt>;
  rest: Map<number, Pt>;
};

export type GlidePlan = { parts: Part[] };

function middle(ids: number[], at: Map<number, Pt>): Pt {
  let x = 0;
  let y = 0;
  for (const id of ids) {
    const p = at.get(id)!;
    x += p.x;
    y += p.y;
  }
  return { x: x / ids.length, y: y / ids.length };
}

/** The turn that best takes `a` onto `b` (both about their middles), turned over first if `over`. */
function bestTurn(ids: number[], a: Map<number, Pt>, b: Map<number, Pt>, over: boolean): { turn: number; miss: number } {
  let sxx = 0;
  let sxy = 0;
  let syx = 0;
  let syy = 0;
  for (const id of ids) {
    const p = a.get(id)!;
    const q = b.get(id)!;
    const px = p.x;
    const py = over ? -p.y : p.y;
    sxx += px * q.x;
    sxy += px * q.y;
    syx += py * q.x;
    syy += py * q.y;
  }
  const turn = Math.atan2(sxy - syx, sxx + syy);
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  let miss = 0;
  for (const id of ids) {
    const p = a.get(id)!;
    const q = b.get(id)!;
    const py = over ? -p.y : p.y;
    miss += (c * p.x - s * py - q.x) ** 2 + (s * p.x + c * py - q.y) ** 2;
  }
  return { turn, miss };
}

/**
 * The way from where atoms are drawn to where they are to be, structure by
 * structure (`parts`: the atom ids of each). Atoms not in both are left out:
 * they are drawn where they are.
 */
export function planGlide(from: Map<number, Pt>, to: Map<number, Pt>, parts: number[][]): GlidePlan {
  const out: Part[] = [];
  for (const all of parts) {
    const ids = all.filter((id) => from.has(id) && to.has(id));
    if (!ids.length) continue;
    const mf = middle(ids, from);
    const mt = middle(ids, to);
    const a = new Map(ids.map((id) => [id, { x: from.get(id)!.x - mf.x, y: from.get(id)!.y - mf.y }]));
    const b = new Map(ids.map((id) => [id, { x: to.get(id)!.x - mt.x, y: to.get(id)!.y - mt.y }]));
    // (one atom, or two: nothing to turn over)
    const straight = bestTurn(ids, a, b, false);
    const overed = ids.length > 2 ? bestTurn(ids, a, b, true) : { turn: 0, miss: Infinity };
    const over = overed.miss < straight.miss - 1e-9;
    const turn = over ? overed.turn : straight.turn;
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const rest = new Map<number, Pt>();
    for (const id of ids) {
      const p = a.get(id)!;
      const py = over ? -p.y : p.y;
      const q = b.get(id)!;
      const fz = from.get(id)!.z;
      const tz = to.get(id)!.z;
      rest.set(id, {
        x: q.x - (c * p.x - s * py),
        y: q.y - (s * p.x + c * py),
        ...(fz != null && tz != null ? { z: tz - fz } : {}),
      });
    }
    out.push({ ids, from: mf, to: mt, turn, over, about: a, rest });
  }
  return { parts: out };
}

/**
 * Where each atom is drawn `e` of the way there (0 to 1, eased by the
 * caller): turned that far, turned over that far - drawn narrowing to a line
 * and opening out the other side, as a page turns - moved that far, and that
 * far settled. `from` gives each atom's depth as it was.
 */
export function glideAt(plan: GlidePlan, from: Map<number, Pt>, e: number): Map<number, Pt> {
  const out = new Map<number, Pt>();
  for (const part of plan.parts) {
    const c = Math.cos(part.turn * e);
    const s = Math.sin(part.turn * e);
    const squash = part.over ? 1 - 2 * e : 1;
    const mx = part.from.x + (part.to.x - part.from.x) * e;
    const my = part.from.y + (part.to.y - part.from.y) * e;
    for (const id of part.ids) {
      const p = part.about.get(id)!;
      const r = part.rest.get(id)!;
      const py = p.y * squash;
      const z0 = from.get(id)?.z;
      out.set(id, {
        x: mx + c * p.x - s * py + r.x * e,
        y: my + s * p.x + c * py + r.y * e,
        ...(z0 != null && r.z != null ? { z: z0 + r.z * e } : {}),
      });
    }
  }
  return out;
}

/** The structures of a drawing: its atoms, joined by its bonds. */
export function partsOf(atoms: readonly { id: number }[], bonds: readonly { a: number; b: number }[]): number[][] {
  const up = new Map<number, number>(atoms.map((a) => [a.id, a.id]));
  const top = (id: number): number => {
    let r = id;
    while (up.get(r) !== r) r = up.get(r)!;
    let n = id;
    while (up.get(n) !== r) {
      const next = up.get(n)!;
      up.set(n, r);
      n = next;
    }
    return r;
  };
  for (const b of bonds) {
    if (!up.has(b.a) || !up.has(b.b)) continue;
    const ra = top(b.a);
    const rb = top(b.b);
    if (ra !== rb) up.set(ra, rb);
  }
  const groups = new Map<number, number[]>();
  for (const a of atoms) {
    const r = top(a.id);
    const g = groups.get(r);
    if (g) g.push(a.id);
    else groups.set(r, [a.id]);
  }
  return [...groups.values()];
}
