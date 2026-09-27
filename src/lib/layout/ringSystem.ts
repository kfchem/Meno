/**
 * A ring system laid out on its own, in a frame of its own: its rings as
 * regular polygons on the lattice, one after another.
 *
 * The first ring is set square on the lattice - a six-membered ring with two
 * sides upright - or, where the system has a macrocycle, the macrocycle is
 * first, drawn as a chain closed on itself. Each ring after it has some of
 * its atoms placed already, by the rings before it; the rest of the ring is
 * a run of atoms between two placed ones, laid on the arc of the ring's own
 * regular polygon between them. On a shared side, that is the regular
 * polygon fused on that side. Where more of the ring is placed - a ring
 * fused on two sides at once, as in pyrene, or a bridge - it is the part of
 * the polygon the placed atoms leave, on whichever side has room.
 */
import {
  add,
  angleOf,
  centroid,
  cross,
  dir,
  dist,
  len,
  norm,
  scale,
  segmentsCross,
  splitWidestGap,
  sub,
  type Point,
} from "./geometry";
import { macrocycleShapes } from "./macrocycle";
import type { Molecule, RingSystem } from "./perceive";

/** Rings this size and over are macrocycles, drawn as a closed zigzag. */
export const MACROCYCLE = 9;

/** The circumradius of a regular polygon of `n` sides of length 1. */
const radius = (n: number) => 1 / (2 * Math.sin(Math.PI / n));

/**
 * The angle of a regular ring's first atom, round from its centre, that sets
 * it square: a triangle, pentagon, hexagon or heptagon with an apex at the
 * top; a square or octagon with a side level at the top.
 */
function squareStart(n: number): number {
  return n === 4 || n === 8 ? Math.PI / 2 + Math.PI / n : Math.PI / 2;
}

/** How many ways a ring system can be laid out: one per macrocycle shape offered. */
/**
 * A system of macrocycles strung through six-membered rings with chains
 * between (vancomycin) starts from the ring the most of them run through:
 * the macrocycles are then chains drawn between rings already regular.
 * That ring, or null for any other system.
 */
function hubOf(rings: number[][]): number[] | null {
  const macro = rings.filter((r) => r.length >= MACROCYCLE);
  if (macro.length < 2) return null;
  const runsThrough = (r: number[]) => macro.filter((m) => r.filter((a) => m.includes(a)).length >= 3).length;
  const hubs = rings.filter((r) => r.length === 6 && runsThrough(r) >= 2);
  return hubs.sort((p, q) => runsThrough(q) - runsThrough(p))[0] ?? null;
}

export function ringSystemVariants(mol: Molecule, sys: RingSystem): number {
  const rings = sys.rings.map((i) => mol.rings[i]);
  const big = Math.max(0, ...rings.map((r) => r.length));
  if (big < MACROCYCLE || hubOf(rings)) return 1;
  return macrocycleShapes(big).length;
}

export function placeRingSystem(
  mol: Molecule,
  sys: RingSystem,
  variant = 0,
  start?: number,
): Map<number, Point> {
  const pos = new Map<number, Point>();
  const rings = sys.rings.map((i) => mol.rings[i]);
  const placedRing = new Set<number>();

  // first: the largest macrocycle; else a six-membered ring, or a four,
  // among the most fused; else the largest ring
  const fusedCount = (r: number[]) =>
    rings.filter((q) => q !== r && q.filter((a) => r.includes(a)).length >= 2).length;
  // (a ring that can lie square on the lattice - six, then four - sets the
  // system square)
  const fit = (r: number[]) => (r.length === 6 ? 2 : r.length === 4 ? 1 : 0);
  // and a ring a larger one is bridged across (sharing three atoms or more)
  // before others: it stays regular, and the larger ring arcs round from it,
  // the bridge inside - taxol's A ring, and its eight-membered B
  const bridgedFrom = (r: number[]) =>
    rings.some((q) => q !== r && q.length > r.length && q.filter((a) => r.includes(a)).length >= 3) ? 1 : 0;
  const ordered = [...rings].sort((p, q) => {
    const pm = p.length >= MACROCYCLE ? p.length : 0;
    const qm = q.length >= MACROCYCLE ? q.length : 0;
    if (pm !== qm) return qm - pm;
    if (fit(p) !== fit(q)) return fit(q) - fit(p);
    if (bridgedFrom(p) !== bridgedFrom(q)) return bridgedFrom(q) - bridgedFrom(p);
    const f = fusedCount(q) - fusedCount(p);
    if (f) return f;
    return q.length - p.length;
  });
  // (or the ring asked for: a bridged system is tried from each)
  const first = start != null ? mol.rings[start] : hubOf(rings) ?? ordered[0];

  // a macrocycle that runs mostly through other rings is a ring of rings,
  // round a circle; one that runs through a ring or two on its way
  // (sirolimus's pyran) is still a chain closed on itself, never round
  const through = new Set(
    rings
      .filter((r) => r !== first && r.filter((a) => first.includes(a)).length >= 3)
      .flatMap((r) => r.filter((a) => first.includes(a))),
  );
  const shapes = first.length >= MACROCYCLE ? macrocycleShapes(first.length) : [];
  if (first.length >= MACROCYCLE && through.size >= 0.4 * first.length && shortLinks(first, through)) {
    ringOfBlocks(mol, first, rings, pos).forEach((i) => placedRing.add(i));
  } else if (first.length >= MACROCYCLE) {
    const shape = shapes[variant % shapes.length];
    const at = macrocycleFit(mol, first, shape, rings);
    first.forEach((a, i) => pos.set(a, shape[at(i)]));
  } else {
    const r = radius(first.length);
    const t0 = squareStart(first.length);
    first.forEach((a, i) => pos.set(a, scale(dir(t0 - (i * 2 * Math.PI) / first.length), r)));
  }
  placedRing.add(rings.indexOf(first));

  // A bridged pair of rings has three bridges between its bridgeheads: the
  // path they share and each one's own. The shortest is drawn inside the
  // other two (taxol's gem-dimethyl carbon, artemisinin's peroxide). Where
  // it is one ring's own path, that ring waits until the other is down, so
  // the other is laid out whole and the bridge crosses it.
  const waitsFor = new Map<number, number>();
  rings.forEach((r, i) =>
    rings.forEach((q, j) => {
      if (i === j) return;
      const shared = r.filter((a) => q.includes(a));
      if (shared.length < 3) return;
      const own = r.filter((a) => !q.includes(a));
      const theirs = q.filter((a) => !r.includes(a));
      const ends = shared.filter((a) => {
        const k = r.indexOf(a);
        return !shared.includes(r[(k + 1) % r.length]) || !shared.includes(r[(k - 1 + r.length) % r.length]);
      });
      const inner = shared.filter((a) => !ends.includes(a));
      // on a tie, the bridge that is fused to nothing else goes inside
      const elsewhere = (path: number[]) =>
        path.filter((a) => rings.some((o) => o !== r && o !== q && o.includes(a))).length;
      const weigh = (path: number[]) => path.length + 0.1 * elsewhere(path);
      if (weigh(own) < weigh(theirs) && weigh(own) < weigh(inner)) waitsFor.set(i, j);
    }),
  );

  while (placedRing.size < rings.length) {
    // next: the ring most fused to what is placed - on a side before a
    // bridge, a bridge before one touching at an atom (spiro)
    let next = -1;
    let nextRank = -Infinity;
    rings.forEach((r, i) => {
      if (placedRing.has(i)) return;
      const shared = r.filter((a) => pos.has(a)).length;
      if (!shared) return;
      const waiting = waitsFor.has(i) && !placedRing.has(waitsFor.get(i)!);
      const rank =
        (waiting ? -5000 : 0) +
        (shared === 2 ? 1000 : shared > 2 ? 500 : 0) +
        (r.length === 6 ? 50 : 0) +
        (r.length < MACROCYCLE ? 20 : 0) -
        r.length;
      if (rank > nextRank) {
        nextRank = rank;
        next = i;
      }
    });
    if (next < 0) break;
    placeRing(rings[next], pos, rings);
    placedRing.add(next);
  }
  return pos;
}

/**
 * Whether the rings a macrocycle runs through are each linked to the next
 * by no more than two atoms - a porphyrin's meso carbons, a cyclodextrin's
 * glycosidic oxygens - so that it is rings strung together, and nothing
 * else, rather than a chain with rings in it (vancomycin's peptide).
 */
function shortLinks(ring: number[], through: Set<number>): boolean {
  const start = ring.findIndex((a) => through.has(a));
  if (start < 0) return false;
  let run = 0;
  for (let k = 1; k <= ring.length; k++) {
    if (through.has(ring[(start + k) % ring.length])) run = 0;
    else if (++run > 2) return false;
  }
  return true;
}

/**
 * A macrocycle that runs through other rings, not along their sides - the
 * pyrroles of a porphyrin, the glucoses of a cyclodextrin, the aromatic
 * rings of vancomycin: a ring of rings. Each group of those rings is laid
 * out on its own, and stands in the macrocycle as one straight side from
 * where the macrocycle enters it to where it leaves; the macrocycle, so
 * shortened, is set round a circle, and each group hung on its side with
 * the rest of it outside. Returns the rings it placed, by index.
 */
function ringOfBlocks(
  mol: Molecule,
  macro: number[],
  rings: number[][],
  pos: Map<number, Point>,
): number[] {
  const n = macro.length;
  const others = rings.map((_, i) => i).filter((i) => rings[i] !== macro);
  // groups: rings fused to each other
  const group = new Map<number, number>();
  others.forEach((i) => group.set(i, i));
  const find = (i: number): number => (group.get(i) === i ? i : find(group.get(i)!));
  for (const i of others) {
    for (const j of others) {
      if (i < j && rings[i].filter((a) => rings[j].includes(a)).length >= 2) group.set(find(j), find(i));
    }
  }
  const blocks = new Map<number, number[]>();
  for (const i of others) blocks.set(find(i), [...(blocks.get(find(i)) ?? []), i]);
  const inMacro = new Set(macro);
  type Block = { rings: number[]; path: number[]; local: Map<number, Point> };
  const threads: Block[] = [];
  for (const members of blocks.values()) {
    const atoms = new Set(members.flatMap((i) => rings[i]));
    const shared = macro.map((a, i) => (atoms.has(a) ? i : -1)).filter((i) => i >= 0);
    if (shared.length < 3) continue;
    // the run of the macrocycle through the block, in the macrocycle's order
    const start = shared.find((i) => !atoms.has(macro[(i - 1 + n) % n]));
    if (start == null) continue;
    const path: number[] = [];
    for (let k = 0; k < n && atoms.has(macro[(start + k) % n]); k++) path.push(macro[(start + k) % n]);
    if (path.length !== shared.length) continue;
    const sub = { atoms: [...atoms], rings: members.map((i) => mol.rings.indexOf(rings[i])) };
    threads.push({ rings: members, path, local: placeRingSystem(mol, sub) });
  }
  // the macrocycle's sides: a bond, or a block from its first atom to its last
  const blockAt = new Map<number, Block>();
  for (const b of threads) blockAt.set(b.path[0], b);
  const corners: number[] = [];
  const sides: number[] = [];
  const firstCorner = macro.findIndex((a, i) => {
    const prev = macro[(i - 1 + n) % n];
    return !threads.some((b) => b.path.includes(a) && b.path.includes(prev) && a !== b.path[0]);
  });
  for (let k = 0; k < n; ) {
    const a = macro[(firstCorner + k) % n];
    corners.push(a);
    const b = blockAt.get(a);
    if (b) {
      sides.push(dist(b.local.get(b.path[0])!, b.local.get(b.path[b.path.length - 1])!));
      k += b.path.length - 1;
    } else {
      sides.push(1);
      k += 1;
    }
  }
  // round a circle: the radius at which the sides' angles close the ring
  const turns = (r: number) => sides.reduce((sum, l) => sum + 2 * Math.asin(Math.min(1, l / (2 * r))), 0);
  let lo = Math.max(...sides) / 2;
  let hi = sides.reduce((sum, l) => sum + l, 0);
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    if (turns(mid) > 2 * Math.PI) lo = mid;
    else hi = mid;
  }
  const r = (lo + hi) / 2;
  let t = Math.PI / 2;
  corners.forEach((a, i) => {
    pos.set(a, scale(dir(t), r));
    t -= 2 * Math.asin(Math.min(1, sides[i] / (2 * r)));
  });
  // each block on its side, the rest of it outside the circle
  for (const b of threads) {
    const p0 = pos.get(b.path[0])!;
    const p1 = pos.get(b.path[b.path.length - 1])!;
    const l0 = b.local.get(b.path[0])!;
    const l1 = b.local.get(b.path[b.path.length - 1])!;
    const rest = [...b.local.keys()].filter((a) => !b.path.includes(a));
    let best: Map<number, Point> | null = null;
    let bestOut = -Infinity;
    for (const flipped of [false, true]) {
      const src = (p: Point) => (flipped ? { x: p.x, y: -p.y } : p);
      const a0 = src(l0);
      const a1 = src(l1);
      const turn = angleOf(sub(p1, p0)) - angleOf(sub(a1, a0));
      const place = (p: Point) => {
        const q = sub(src(p), a0);
        const c = Math.cos(turn);
        const sn = Math.sin(turn);
        return add(p0, { x: q.x * c - q.y * sn, y: q.x * sn + q.y * c });
      };
      const placed = new Map<number, Point>();
      for (const [a, p] of b.local) placed.set(a, place(p));
      const out = rest.length ? rest.reduce((sum, a) => sum + len(placed.get(a)!), 0) / rest.length : 0;
      if (out > bestOut) {
        bestOut = out;
        best = placed;
      }
    }
    for (const [a, p] of best!) if (!inMacro.has(a) || !pos.has(a)) pos.set(a, p);
  }
  return [rings.indexOf(macro), ...threads.flatMap((b) => b.rings)];
}

/**
 * Which corner of the macrocycle's shape each of its atoms takes (as a map
 * from the atom's place in the ring to the shape's). A zigzag's corners
 * alternate: one points out, with room for what hangs there; the next points
 * in, with room for nothing. So the atoms that carry something - a branch, a
 * ring fused on - take the corners that point out, the bare CH2s the ones
 * that point in: of every way round the shape, and either direction, the
 * one that leaves the least on corners pointing in.
 */
function macrocycleFit(
  mol: Molecule,
  ring: number[],
  shape: Point[],
  rings: number[][],
): (i: number) => number {
  const n = ring.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += cross(shape[i], shape[(i + 1) % n]);
  const inward = shape.map((p, i) => {
    const prev = shape[(i - 1 + n) % n];
    const next = shape[(i + 1) % n];
    // a turn against the way round is a corner pointing in
    return Math.sign(cross(sub(p, prev), sub(next, p))) * Math.sign(area) < 0;
  });
  const inRing = new Set(ring);
  // how much hangs off each atom of the ring, a few atoms deep
  const load = ring.map((a) => {
    let weight = 0;
    for (const b of mol.neighbours[a]) {
      if (inRing.has(b)) continue;
      const seen = new Set([a, b]);
      const todo = [b];
      while (todo.length && seen.size < 8) {
        const u = todo.pop()!;
        for (const v of mol.neighbours[u]) {
          if (!seen.has(v) && !inRing.has(v)) {
            seen.add(v);
            todo.push(v);
          }
        }
      }
      weight += 1 + 0.5 * (seen.size - 2);
    }
    return weight;
  });
  // A ring the macrocycle runs through (three atoms or more of it): through
  // three, across a corner of it, the ring stands outside the macrocycle
  // where that corner points in - its middle atom on a corner pointing in;
  // through more, the ring can only lie inside a corner pointing out.
  // A ring fused on a side: a regular ring there needs both ends of that
  // side to be corners pointing out - at one pointing in, its next side
  // would run along the macrocycle's own bond. Along a zigzag the corners
  // alternate, so fused rings go where the shape turns, at its corners.
  const pointIn: number[] = [];
  const pointOut: number[] = [];
  for (const r of rings) {
    if (r === ring) continue;
    const shared = ring.map((a, i) => (r.includes(a) ? i : -1)).filter((i) => i >= 0);
    if (shared.length === 2) pointOut.push(...shared);
    if (shared.length < 3) continue;
    for (const i of shared) {
      if (!r.includes(ring[(i - 1 + n) % n]) || !r.includes(ring[(i + 1) % n])) continue;
      (shared.length === 3 ? pointIn : pointOut).push(i);
    }
  }
  // a double bond in the ring keeps its cis or trans: taken against the
  // ring atoms either side of it (a substituent is on the other side from
  // its ring neighbour, so a configuration given against it is turned round)
  const fixed: { i: number; cis: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const bi = mol.bondIndex.get(a < b ? `${a},${b}` : `${b},${a}`);
    const st = bi != null ? mol.bonds[bi].stereo : undefined;
    if (!st || mol.bonds[bi!].order !== 2) continue;
    const before = ring[(i - 1 + n) % n];
    const after = ring[(i + 2) % n];
    const onA = mol.neighbours[a].includes(st.refs[0]) && st.refs[0] !== b ? st.refs[0] : st.refs[1];
    const onB = onA === st.refs[0] ? st.refs[1] : st.refs[0];
    const cis = st.cis !== (onA !== before) !== (onB !== after);
    fixed.push({ i, cis });
  }
  const at = (shift: number, way: number, k: number) => shape[(((shift + way * k) % n) + n) % n];
  let best = { shift: 0, way: 1 };
  let bestCost = Infinity;
  for (const way of [1, -1]) {
    for (let shift = 0; shift < n; shift++) {
      let cost = 0;
      for (const { i, cis } of fixed) {
        const pa = at(shift, way, i);
        const pb = at(shift, way, i + 1);
        const side = (k: number) => Math.sign(cross(sub(pb, pa), sub(at(shift, way, k), pa)));
        if ((side(i - 1) === side(i + 2)) !== cis) cost += 1000;
      }
      for (let i = 0; i < n; i++) {
        if (inward[(((shift + way * i) % n) + n) % n]) cost += load[i];
      }
      for (const i of pointIn) {
        if (!inward[(((shift + way * i) % n) + n) % n]) cost += 20;
      }
      for (const i of pointOut) {
        if (inward[(((shift + way * i) % n) + n) % n]) cost += 20;
      }
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        best = { shift, way };
      }
    }
  }
  return (i) => (((best.shift + best.way * i) % n) + n) % n;
}

/** Places the atoms of a ring not yet placed, given those that are. */
function placeRing(ring: number[], pos: Map<number, Point>, rings: number[][] = []): void {
  const n = ring.length;
  const placed = ring.map((a) => pos.has(a));
  const count = placed.filter(Boolean).length;
  if (count === 1) {
    placeSpiro(ring, pos);
    return;
  }
  // the runs of unplaced atoms, each between two placed ones
  for (let i = 0; i < n; i++) {
    if (!placed[i] || placed[(i + 1) % n]) continue;
    const run: number[] = [];
    let j = (i + 1) % n;
    while (!placed[j]) {
      run.push(ring[j]);
      j = (j + 1) % n;
    }
    // a macrocycle's run is a chain, drawn as one: a zigzag, never an arc
    if (n >= MACROCYCLE && run.length >= 3) placeChainRun(ring[i], ring[j], run, pos, rings);
    else placeRun(ring[i], ring[j], run, n, pos);
  }
}

/**
 * A run of a macrocycle between two atoms already placed, drawn as a chain:
 * each bond turned sixty degrees from the last, zigzag where it can be and
 * cornering where it must, clear of what is placed and crossing none of
 * it, bulging away from it - and the last atom set a bond from both its
 * neighbours to close onto the far end. Found by a beam search over the
 * ways each bond can turn.
 */
function placeChainRun(
  from: number,
  to: number,
  run: number[],
  pos: Map<number, Point>,
  rings: number[][] = [],
): void {
  // the six-membered rings the run passes through, yet to be drawn: where
  // it does, it turns as the hexagon does, the same way at each atom
  const hexagon = (u: number, v: number, w: number) =>
    rings.findIndex((r) => r.length === 6 && r.includes(u) && r.includes(v) && r.includes(w));
  const a = pos.get(from)!;
  const b = pos.get(to)!;
  const k = run.length;
  const placed = [...pos.entries()].filter(([v]) => v !== from && v !== to).map(([, p]) => p);
  const middle = placed.length ? centroid(placed) : scale(add(a, b), 0.5);
  const bonds: [Point, Point][] = [];
  // (the bonds among placed atoms are those a bond's length apart)
  const pts = [...pos.values()];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.abs(dist(pts[i], pts[j]) - 1) < 0.05) bonds.push([pts[i], pts[j]]);
    }
  }
  const crowd = (p: Point) => {
    let c = 0;
    for (const o of placed) {
      const d = dist(p, o);
      if (d < 0.6) c += 50;
      else if (d < 0.9) c += 10 * (0.9 - d);
    }
    return c;
  };
  const crosses = (p: Point, q: Point) =>
    bonds.reduce((c, [u, v]) => c + (segmentsCross(p, q, u, v) ? 1 : 0), 0);
  // Where the rest of a hexagon the run enters will fall, once drawn round
  // from three of its atoms, u, v and w in order along the run: those of
  // its atoms neither on the run nor placed.
  const rest = (r: number, u: Point, v: Point, w: Point, vAtom: number, wAtom: number): Point[] => {
    const ring = rings[r];
    const c = add(v, norm(add(sub(u, v), sub(w, v))));
    const iv = ring.indexOf(vAtom);
    const step = ring[(iv + 1) % 6] === wAtom ? 1 : -1;
    const turnTo = Math.sign(cross(sub(v, c), sub(w, c)));
    const out: Point[] = [];
    for (let d = 1; d < 6; d++) {
      const atom = ring[(iv + step * d + 6) % 6];
      if (run.includes(atom) || atom === from || atom === to || pos.has(atom)) continue;
      out.push(add(c, dir(angleOf(sub(v, c)) + turnTo * d * (Math.PI / 3))));
    }
    return out;
  };
  type State = { at: Point[]; t: number; turn: number; ring: number; ghosts: Point[]; cost: number };
  let beam: State[] = [];
  for (let s = 0; s < 12; s++) {
    const t = (s * Math.PI) / 6;
    const p = add(a, dir(t));
    beam.push({ at: [p], t, turn: 0, ring: -1, ghosts: [], cost: crowd(p) + 5 * crosses(a, p) });
  }
  // (a point too near where a hexagon's rest will fall)
  const onGhost = (p: Point, ghosts: Point[]) => ghosts.reduce((c, g) => c + (dist(p, g) < 0.9 ? 20 : 0), 0);
  const WIDTH = 400;
  for (let step = 1; step < k - 1; step++) {
    const next: State[] = [];
    const left = k - step; // bonds still to go after this atom, to b
    // the turn made at run[step - 1], between the atoms either side of it
    const before = step >= 2 ? run[step - 2] : from;
    const ring = hexagon(before, run[step - 1], run[step]);
    for (const st of beam) {
      for (const turn of [1, -1]) {
        // (inside a hexagon, the same way as the turn before it there)
        if (ring >= 0 && st.ring === ring && turn !== st.turn) continue;
        const t = st.t + (turn * Math.PI) / 3;
        const last = st.at[st.at.length - 1];
        const p = add(last, dir(t));
        // (still able to reach the far end)
        if (dist(p, b) > left + 1e-9) continue;
        let cost = st.cost + crowd(p) + 5 * crosses(last, p) + onGhost(p, st.ghosts);
        for (let j = 0; j < st.at.length - 1; j++) if (dist(p, st.at[j]) < 0.9) cost += 20;
        // a zigzag turns each way in turn; a corner is two turns alike
        if (turn === st.turn && ring < 0) cost += 0.3;
        // entering a hexagon: room for the rest of it, kept from then on
        let ghosts = st.ghosts;
        if (ring >= 0 && st.ring !== ring) {
          const u = step >= 2 ? st.at[step - 2] : a;
          const fresh = rest(ring, u, last, p, run[step - 1], run[step]);
          for (const g of fresh) {
            cost += crowd(g);
            for (const q of [a, ...st.at, p]) if (dist(q, g) < 0.9) cost += 20;
          }
          ghosts = [...ghosts, ...fresh];
        }
        next.push({ at: [...st.at, p], t, turn, ring, ghosts, cost });
      }
    }
    next.sort((p, q) => p.cost - q.cost);
    beam = next.slice(0, WIDTH);
    if (!beam.length) break;
  }
  let best: Point[] | null = null;
  let bestCost = Infinity;
  const angle = (u: Point, v: Point, w: Point) => {
    const x1 = sub(u, v);
    const x2 = sub(w, v);
    return Math.acos(Math.max(-1, Math.min(1, (x1.x * x2.x + x1.y * x2.y) / (len(x1) * len(x2)))));
  };
  for (const st of beam) {
    const last = st.at[st.at.length - 1];
    const closes = k === 1 ? [] : apexOf(last, b);
    for (const p of closes) {
      const at = [...st.at, p];
      let cost = st.cost + crowd(p) + 5 * (crosses(last, p) + crosses(p, b)) + onGhost(p, st.ghosts);
      for (let j = 0; j < at.length - 2; j++) if (dist(p, at[j]) < 0.9) cost += 20;
      // the angles the closing bends, against 120 degrees
      const prev = at.length >= 3 ? at[at.length - 3] : a;
      for (const [u, v, w] of [
        [prev, last, p],
        [last, p, b],
      ]) {
        cost += ((angle(u, v, w) - (2 * Math.PI) / 3) / (Math.PI / 6)) ** 2;
      }
      // room at each end among the bonds already there
      for (const [end, first] of [
        [a, at[0]],
        [b, p],
      ] as const) {
        for (const o of placed) {
          if (Math.abs(dist(o, end) - 1) > 0.05) continue;
          const t = angle(o, end, first);
          if (t < (100 * Math.PI) / 180) cost += 3 * ((100 * Math.PI) / 180 - t);
        }
      }
      // away from what is placed
      cost -= 0.3 * len(sub(centroid(at), middle));
      if (cost < bestCost) {
        bestCost = cost;
        best = at;
      }
    }
  }
  if (!best) {
    placeRun(from, to, run, run.length + 2, pos);
    return;
  }
  // the strain of closing it shared out along the chain: bonds 1, each
  // chain atom's neighbours a 120-degree angle apart, clear of what is
  // placed - the rings the run passes through left as they are
  const line = [a, ...best.map((p) => ({ ...p })), b];
  const ids = [from, ...run, to];
  const free = ids.map((v, i) => i > 0 && i < ids.length - 1 && !rings.some((r) => r.length < MACROCYCLE && r.includes(v)));
  const pull = (i: number, j: number, target: number, k: number) => {
    if (!free[i] && !free[j]) return;
    const d = sub(line[j], line[i]);
    const l = len(d) || 1e-9;
    const f = ((l - target) / l) * k;
    const [wi, wj] = free[i] && free[j] ? [0.5, 0.5] : free[i] ? [1, 0] : [0, 1];
    line[i] = add(line[i], scale(d, f * wi));
    line[j] = sub(line[j], scale(d, f * wj));
  };
  for (let it = 0; it < 300; it++) {
    for (let i = 0; i + 1 < line.length; i++) pull(i, i + 1, 1, 0.5);
    for (let i = 0; i + 2 < line.length; i++) if (free[i + 1]) pull(i, i + 2, Math.sqrt(3), 0.15);
    for (let i = 0; i < line.length; i++) {
      if (!free[i]) continue;
      for (const o of placed) {
        const d = sub(line[i], o);
        const l = len(d);
        if (l < 0.9 && l > 1e-9) line[i] = add(line[i], scale(d, ((0.9 - l) / l) * 0.3));
      }
    }
  }
  run.forEach((atom, i) => pos.set(atom, line[i + 1]));
}

/** The points a bond's length from both `p` and `q`. */
function apexOf(p: Point, q: Point): Point[] {
  const d = dist(p, q);
  if (d > 2 || d < 1e-9) return [];
  const m = scale(add(p, q), 0.5);
  const h = Math.sqrt(Math.max(0, 1 - (d / 2) ** 2));
  const u = { x: -(q.y - p.y) / d, y: (q.x - p.x) / d };
  return [add(m, scale(u, h)), add(m, scale(u, -h))];
}

/** A ring touching what is placed at one atom: set on the far side of it. */
function placeSpiro(ring: number[], pos: Map<number, Point>): void {
  const n = ring.length;
  const i0 = ring.findIndex((a) => pos.has(a));
  const at = pos.get(ring[i0])!;
  // the way out from the atom: away from the placed atoms near it
  const near = [...pos.entries()].filter(([a, p]) => a !== ring[i0] && dist(p, at) < 1.5);
  const taken = near.map(([, p]) => angleOf(sub(p, at)));
  const [out] = splitWidestGap(taken, 1);
  const r = radius(n);
  const c = add(at, scale(dir(out), r));
  const start = out + Math.PI; // the shared atom, seen from the centre
  for (let k = 1; k < n; k++) {
    pos.set(ring[(i0 + k) % n], add(c, scale(dir(start - (k * 2 * Math.PI) / n), r)));
  }
}

/**
 * Places `run`, the atoms of an `n`-membered ring between placed atoms `from`
 * and `to`, on an arc of the ring's regular polygon between them - of the
 * four such arcs (two circles, the short way round or the long), the one
 * whose bonds come nearest 1 and that keeps clear of what is placed.
 */
function placeRun(from: number, to: number, run: number[], n: number, pos: Map<number, Point>): void {
  const a = pos.get(from)!;
  const b = pos.get(to)!;
  const d = dist(a, b);
  const steps = run.length + 1;
  let r = radius(n);
  if (d > 2 * r) r = d / 2;
  const mid = scale(add(a, b), 0.5);
  const across = norm({ x: -(b.y - a.y), y: b.x - a.x });
  // across a diameter (para atoms of a ring fused on two sides) the centre
  // is the midpoint itself: rounding must not move it off
  const h = d > 2 * r * (1 - 1e-6) ? 0 : Math.sqrt(Math.max(0, r * r - (d * d) / 4));
  const others = [...pos.entries()].filter(([k]) => k !== from && k !== to).map(([, p]) => p);
  const middle = others.length ? centroid(others) : mid;

  let best: Point[] | null = null;
  let bestCost = Infinity;
  for (const side of [1, -1]) {
    const c = add(mid, scale(across, side * h));
    const ta = angleOf(sub(a, c));
    const tb = angleOf(sub(b, c));
    for (const way of [1, -1]) {
      // from a to b going `way` round the circle
      let sweep = (tb - ta) * way;
      while (sweep <= 0) sweep += 2 * Math.PI;
      const pts: Point[] = [];
      for (let k = 1; k < steps; k++) pts.push(add(c, scale(dir(ta + (way * sweep * k) / steps), r)));
      const step = 2 * r * Math.sin(sweep / steps / 2);
      let cost = 40 * Math.abs(step - 1);
      for (const p of pts) {
        for (const o of others) {
          const dd = dist(p, o);
          if (dd < 0.55) cost += 100;
          else if (dd < 0.9) cost += 5 * (0.9 - dd);
        }
      }
      // outward, away from the middle of what is placed
      const bulge = centroid(pts);
      cost -= 0.5 * len(sub(bulge, middle));
      // a convex ring: the run on the far side of the line from the placed
      // atoms' middle
      const sideOfRun = Math.sign(cross(sub(b, a), sub(bulge, a)));
      const sideOfRest = Math.sign(cross(sub(b, a), sub(middle, a)));
      if (others.length && sideOfRun === sideOfRest) cost += 2;
      if (cost < bestCost) {
        bestCost = cost;
        best = pts;
      }
    }
  }
  run.forEach((atom, i) => pos.set(atom, best![i]));
}
