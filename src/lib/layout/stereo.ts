/**
 * Stereochemistry shown where it reads (docs/LAYOUT-2D.md, section 6): a
 * wedge or hashes on a bond out of the rings, its narrow end at the
 * stereocentre - to an end atom first, then to a chain - and never on a
 * ring bond while there is another way. A stereocentre at a ring fusion,
 * with no bond out of the rings, gets its H drawn, straight out, and the
 * wedge on that.
 *
 * A configuration is given as the neighbours in order (-1 for an implicit
 * H) and the sign of the volume the first three span, seen from the
 * centre. Drawn, a neighbour on a wedge stands out of the page, one on
 * hashes behind it, the rest in it; the wedge's sense is whichever gives
 * that sign back.
 */
import { angleOf, centroid, splitOutside, splitWidestGap, sub, type Point } from "./geometry";
import { key, type Molecule } from "./perceive";

export type Tetrahedral = {
  /** Neighbours in order; -1 for an implicit H, last. */
  neighbours: readonly number[];
  /** The sign of the volume the first three span, seen from the centre. */
  volume: 1 | -1;
};

export type Wedge = {
  /** The stereocentre: the narrow end. */
  from: number;
  /** The other end: an atom, or -1 for the H drawn on `from`. */
  to: number;
  stereo: "up" | "down";
};

export type Stereo = {
  wedges: Wedge[];
  /** Hydrogens drawn to show a centre that has no other bond to put a wedge on. */
  hydrogens: { on: number; at: Point }[];
};

type V3 = [number, number, number];
const det = (a: V3, b: V3, c: V3) =>
  a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);

/**
 * The sign of the volume a centre's first three neighbours span as drawn,
 * or 0 where the drawing does not say. With the first three all in the
 * page, the fourth, on its wedge, says it: it stands opposite them.
 */
export function drawnVolume(
  at: Point,
  neighbours: readonly (Point | null)[],
  lift: readonly number[],
): number {
  const v = neighbours.map((p, i): V3 | null => (p ? [p.x - at.x, p.y - at.y, lift[i]] : null));
  if (v[0] && v[1] && v[2]) {
    const d = det(v[0], v[1], v[2]);
    if (Math.abs(d) > 1e-6) return Math.sign(d);
  }
  if (v[0] && v[1] && v[3]) {
    const d = -det(v[0], v[1], v[3]);
    if (Math.abs(d) > 1e-6) return Math.sign(d);
  }
  return 0;
}

export function placeStereo(
  mol: Molecule,
  pos: Map<number, Point>,
  tetra: ReadonlyMap<number, Tetrahedral>,
): Stereo {
  const wedges: Wedge[] = [];
  const hydrogens: { on: number; at: Point }[] = [];
  const used = new Set<string>();
  const wideEnds = new Set<number>();
  const narrowEnds = new Set<number>();
  const centres = [...tetra.keys()].filter((c) => pos.has(c));
  const ringBond = (a: number, b: number) => mol.ringBonds.has(key(a, b));

  // centres with fewest ways to show them first, so they get theirs
  const options = (c: number) => mol.neighbours[c].filter((n) => !ringBond(c, n)).length;
  centres.sort((p, q) => options(p) - options(q) || p - q);

  for (const c of centres) {
    const t = tetra.get(c)!;
    const at = pos.get(c)!;
    const hasH = t.neighbours.includes(-1);
    type Choice = { to: number; rank: number };
    const choices: Choice[] = [];
    // a wedge starting where another ends, or ending where another starts,
    // makes a run of them, which reads as the chain being out of the page
    // rather than the centre (two meeting at their wide ends - a glycoside's
    // oxygen - are nothing of the kind)
    const touches = (a: number, b: number) =>
      (wideEnds.has(a) ? 10 : 0) + (narrowEnds.has(b) ? 10 : 0);
    for (const n of mol.neighbours[c]) {
      if (used.has(key(c, n))) continue;
      const inRing = ringBond(c, n);
      const end = mol.neighbours[n].length === 1;
      const centre = tetra.has(n);
      const rank =
        (inRing ? 100 : 0) +
        (end ? 0 : 2) +
        (centre ? 4 : 0) +
        (mol.el[n] === "H" ? -1 : 0) +
        touches(c, n);
      choices.push({ to: n, rank });
    }
    // An implicit H drawn and wedged: at a ring atom with nothing out of
    // the rings to carry the wedge, first of all; elsewhere before a bond
    // between two centres - the main chain kept plain, the H showing the
    // stereo - or one that would make a run of wedges.
    const outOfRings = mol.neighbours[c].filter((n) => !ringBond(c, n));
    if (hasH && (mol.systemOf[c] >= 0 && outOfRings.length === 0)) choices.push({ to: -1, rank: -10 });
    else if (hasH) choices.push({ to: -1, rank: 5 + (wideEnds.has(c) ? 10 : 0) });
    choices.sort((p, q) => p.rank - q.rank || p.to - q.to);

    let hPos: Point | null = null;
    if (hasH) {
      const taken = mol.neighbours[c].map((n) => angleOf(sub(pos.get(n)!, at)));
      const centresOfRings = mol.ringsOf[c].map((r) =>
        angleOf(sub(centroid(mol.rings[r].map((v) => pos.get(v)!)), at)),
      );
      const [t0] = mol.systemOf[c] >= 0 ? splitOutside(taken, centresOfRings, 1) : splitWidestGap(taken, 1);
      // straight out, unless something is there already - a neighbour's
      // methyl, at a steroid's C9 - then turned aside within the room
      const others = [...pos.entries()].filter(([a]) => a !== c).map(([, p]) => p);
      others.push(...hydrogens.map((h) => h.at));
      let bestRoom = -1;
      for (const turn of [0, 25, -25, 40, -40]) {
        const t1 = t0 + (turn * Math.PI) / 180;
        const p = { x: at.x + Math.cos(t1), y: at.y + Math.sin(t1) };
        const room = Math.min(...others.map((o) => Math.hypot(o.x - p.x, o.y - p.y)));
        if (room > bestRoom + 1e-9) {
          bestRoom = room;
          hPos = p;
        }
        if (room >= 0.8) break;
      }
    }
    // An H drawn at a ring fusion stands straight up on its wedge, or straight
    // down on its hashes, as a steroid's are drawn - the sense it shows read
    // from the page as well as from the wedge - where nothing is in the way
    // and no bond runs that way. (Which way it points does not change what
    // it says: only whether it is a wedge or hashes does.)
    const upright = (centre: number, stereo: "up" | "down"): Point | null => {
      if (mol.systemOf[centre] < 0) return null;
      const t1 = stereo === "up" ? Math.PI / 2 : -Math.PI / 2;
      const along = mol.neighbours[centre].some((n) => {
        const d = angleOf(sub(pos.get(n)!, at)) - t1;
        return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < (25 * Math.PI) / 180;
      });
      if (along) return null;
      const p = { x: at.x, y: at.y + (stereo === "up" ? 1 : -1) };
      const near = [...pos.entries()].some(
        ([a, q]) => a !== centre && Math.hypot(q.x - p.x, q.y - p.y) < 0.7,
      );
      const nearH = hydrogens.some((h) => Math.hypot(h.at.x - p.x, h.at.y - p.y) < 0.7);
      return near || nearH ? null : p;
    };
    for (const choice of choices) {
      const place = (n: number) => (n === -1 ? hPos : pos.get(n) ?? null);
      let done = false;
      for (const stereo of ["up", "down"] as const) {
        const lift = t.neighbours.map((n) => (n === choice.to ? (stereo === "up" ? 1 : -1) : 0));
        const drawn = t.neighbours.map((n) => (n === -1 && choice.to !== -1 ? null : place(n)));
        if (drawnVolume(at, drawn, lift) === t.volume) {
          wedges.push({ from: c, to: choice.to, stereo });
          narrowEnds.add(c);
          if (choice.to === -1) hydrogens.push({ on: c, at: upright(c, stereo) ?? hPos! });
          else {
            used.add(key(c, choice.to));
            wideEnds.add(choice.to);
          }
          done = true;
          break;
        }
      }
      if (done) break;
    }
  }
  return { wedges, hydrogens };
}

