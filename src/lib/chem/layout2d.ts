export type Atom = {
  id: number;
  x: number;
  y: number;
  el: string;
  charge?: number;
  isotope?: number;
};
export type Bond = {
  a1: number;
  a2: number;
  order: 1 | 2 | 3;
  stereo?: "up" | "down" | "wavy" | "none";
  // Double-bond offset layout modes
  doubleMode?: "auto" | "center" | "left" | "right";
  // Wedge orientation principle vs. reverse principle
  stereoOrient?: "principle" | "reverse";
};
export type Vec2 = { x: number; y: number };

export type LayoutOptions = {
  lineWidthPx: number;
  doubleOffsetPx: number;
  tripleOffsetPx: number;
  wedgeWidthPx: number;
  /** Least distance between the hashes of a hashed wedge, centre to centre. */
  hashSpacingPx: number;
  wavyAmpPx: number;
  wavyFreq: number;
  fontPx: number;
  paddingPx: number;
  showCarbonLabels: boolean;
  /** Draw the hydrogens a labelled atom carries, e.g. OH, NH2. Default: on. */
  showImplicitHydrogens?: boolean;
  /**
   * How bonds meet. "round" (the default) rounds the corners of a wedge and
   * fills the join where bonds meet with a round cap; "sharp" leaves the
   * wedge's corners as they are cut and mitres the join instead.
   */
  joinStyle?: "round" | "sharp";
  units?: "px" | "world";
  minLinePx?: number;
  // boolean: all rings ON, undefined/false: OFF
  // { enabled: Set<string> }: enable only rings with ringKey (ascending concat of 6 atom ids)
  aromaticCircle?: boolean | { enabled: Set<string> };
};

export type LineSeg = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  widthPx: number;
};
export type Poly = { points: Vec2[] };
/** Where a line of the drawing runs into another's end, and which way it leaves that point. */
export type Meet = { at: Vec2; dir: Vec2 };
/** A corner within one stroke - a wavy bond's - and the ways its two pieces leave it. */
export type Bend = { at: Vec2; dirs: Vec2[] };
/**
 * What one bond draws, and where its lines need finishing off: `ends` are
 * line ends nothing else meets, `meets` the points where its lines run into
 * a neighbour's, `bends` the corners along a wavy bond. The drawing rounds
 * them all or squares them all, never some of each.
 */
export type BondPrimitives = {
  lines: LineSeg[];
  polys: Poly[];
  meets?: Meet[];
  ends?: Vec2[];
  bends?: Bend[];
};
/** A piece of a label; `sub` marks a subscript such as the 2 in NH2. */
export type TextRun = { text: string; sub?: boolean };

/** How a subscript is drawn, as a fraction of the label's font size. */
export const SUB_SCALE = 0.7;
export const SUB_DROP = 0.28;

export type TextItem = {
  x: number;
  y: number;
  /** The whole label as plain text (subscripts inline), for simple consumers. */
  text: string;
  fontPx: number;
  /** The label split into runs, so subscripts can be drawn smaller. */
  runs?: TextRun[];
  /**
   * Which run sits on the atom: the element symbol, so that OH hangs to the
   * right of the atom and HO to its left.
   */
  anchorRun?: number;
  /** The atom this label belongs to, by index. */
  atom?: number;
};

/** How far a label reaches around its atom. */
export type LabelBox = { left: number; right: number; half: number };
export type Circle = { c: Vec2; r: number; key?: string };

export type Layout = {
  lines: LineSeg[];
  polys: Poly[];
  texts: TextItem[];
  circles: Circle[];
  fills: Circle[];
  bounds: { min: Vec2; max: Vec2 };
  /**
   * Pixels per coordinate unit this layout was built for. Sizes the layout
   * reports in pixels (a line's width, a label's font in px units) divide by
   * it to land back in the coordinates everything else is in.
   */
  zoom: number;
};

export function pxToWorld(px: number, zoom: number): number {
  return px / Math.max(zoom, 1e-6);
}

/**
 * Rough advance width of a character, as a fraction of the font size. The
 * canvas measures text properly; here there is nothing to measure against, so
 * this only has to place the hydrogens beside an element symbol - the symbol
 * itself is anchored on its atom and does not depend on it.
 */
function advanceEm(ch: string): number {
  if (ch >= "0" && ch <= "9") return 0.556;
  if (ch >= "a" && ch <= "z") return 0.55;
  return 0.667;
}

function runWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += advanceEm(ch) * size;
  return w;
}

export function computeBounds(atoms: Atom[]): { min: Vec2; max: Vec2 } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const a of atoms) {
    if (a.x < minX) minX = a.x;
    if (a.y < minY) minY = a.y;
    if (a.x > maxX) maxX = a.x;
    if (a.y > maxY) maxY = a.y;
  }
  if (!isFinite(minX)) return { min: { x: -1, y: -1 }, max: { x: 1, y: 1 } };
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/** How far a label reaches either side of its atom, and above and below. */
export function labelBox(t: TextItem, fontSize: number): LabelBox {
  const runs = t.runs ?? [{ text: t.text }];
  const anchor = Math.min(t.anchorRun ?? 0, runs.length - 1);
  const size = (i: number) => fontSize * (runs[i].sub ? SUB_SCALE : 1);
  let left = runWidth(runs[anchor].text, fontSize) / 2;
  let right = left;
  for (let i = 0; i < anchor; i++) left += runWidth(runs[i].text, size(i));
  for (let i = anchor + 1; i < runs.length; i++) {
    right += runWidth(runs[i].text, size(i));
  }
  // roughly half the height of a capital, with a little room to spare
  return { left, right, half: fontSize * 0.45 };
}

/** The box a label takes up, so the drawing's bounds can make room for it. */
function expandBoundsForLabels(
  bounds: { min: Vec2; max: Vec2 },
  texts: TextItem[],
  fontSize: number,
): { min: Vec2; max: Vec2 } {
  const out = {
    min: { x: bounds.min.x, y: bounds.min.y },
    max: { x: bounds.max.x, y: bounds.max.y },
  };
  for (const t of texts) {
    const { left, right, half } = labelBox(t, fontSize);
    out.min.x = Math.min(out.min.x, t.x - left);
    out.max.x = Math.max(out.max.x, t.x + right);
    out.min.y = Math.min(out.min.y, t.y - half);
    out.max.y = Math.max(out.max.y, t.y + half);
  }
  return out;
}

function toWorld(
  n: number,
  zoom: number,
  units: "px" | "world" | undefined
): number {
  return units === "world" ? n : pxToWorld(n, zoom);
}

function vsub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function vadd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function vscale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}
function vlen(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}
function vnorm(a: Vec2): Vec2 {
  const L = vlen(a);
  return L > 1e-9 ? { x: a.x / L, y: a.y / L } : { x: 1, y: 0 };
}
function vcross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

function vdot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}
function vperp(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x };
}

// function trimEnds is no longer used (kept here commented for reference)
// function trimEnds(p1: Vec2, p2: Vec2, trimWorld: number): { a: Vec2; b: Vec2 } {
//   const dir = vnorm(vsub(p2, p1))
//   const a = vadd(p1, vscale(dir, trimWorld))
//   const b = vadd(p2, vscale(dir, -trimWorld))
//   return { a, b }
// }

function buildTripleLines(
  p1: Vec2,
  p2: Vec2,
  offsetWorld: number
): [LineSeg, LineSeg, LineSeg] {
  const dir = vsub(p2, p1);
  const n = vnorm(vperp(dir));
  const o = vscale(n, offsetWorld);
  return [
    {
      x1: p1.x + o.x,
      y1: p1.y + o.y,
      x2: p2.x + o.x,
      y2: p2.y + o.y,
      widthPx: 0,
    },
    { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, widthPx: 0 },
    {
      x1: p1.x - o.x,
      y1: p1.y - o.y,
      x2: p2.x - o.x,
      y2: p2.y - o.y,
      widthPx: 0,
    },
  ];
}

/**
 * A line as a point and a direction; the cut the wide end of a wedge follows.
 * `reach` is how far a corner may travel to land on it - see WEDGE_MITRE_REACH.
 */
type Cut = { on: Vec2; dir: Vec2; key: number; reach: number };

/**
 * A bond carrying on from the wide end of a wedge: which way it goes, how far
 * it reaches either side of its own line, and how long it is. A double bond
 * reaches past its centre by the gap between its two lines, and a cut that
 * only knew about a single line would leave the outer one stranded off the
 * wedge.
 */
type Neighbour = { dir: Vec2; half: number; wide: boolean; len: number };

/**
 * A bond that runs nearly straight on through the wide end of a wedge cannot
 * be followed: its edge is almost the wedge's own, so the corner that chases
 * it runs off towards infinity. Past this angle between the two the wide end
 * is cut square across instead.
 */
const WEDGE_CUT_MAX_DEG = 175;
const WEDGE_CUT_MIN_SIN = Math.sin(
  ((180 - WEDGE_CUT_MAX_DEG) * Math.PI) / 180,
);

/**
 * How far along the bond it follows a corner of the wide end may travel. This
 * is a mitre limit: the shallower the angle, the further the corner has to go
 * to meet the bond's edge, and letting it run would swallow the bond whole.
 * Half the bond keeps the join inside the bond that makes it; beyond that the
 * wide end is cut square and the bond leaves it with a step.
 */
const WEDGE_MITRE_REACH = 0.5;

/**
 * Where the wide end of a wedge meets another bond, a square cut leaves a
 * notch on the side the bond descends to. Pick, for this side of the wedge,
 * the bond to follow and the line to cut along: one of that bond's edges,
 * half a line width off its centre, so the cut face and that edge are one run.
 *
 * Which edge depends on what else is at the atom. A single bond carries on
 * away from the wedge, and the edge that carries the outline round is its far
 * one, so the cut takes the bond in whole. Where two bonds carry on, each is
 * followed by its near edge, which is the outline between them, and the two
 * cuts meet in the dent.
 */
function baseCut(
  atom: Vec2,
  side: number,
  axis: Vec2,
  neighbours: Neighbour[],
): Cut | null {
  if (neighbours.length === 0) return null;
  const n = vperp(axis);
  // the neighbour furthest round to this side; with only one bond both sides
  // follow it, which is the cut parallel to that bond
  let key = -1;
  let best = -Infinity;
  for (let i = 0; i < neighbours.length; i++) {
    const m = neighbours[i].dir;
    const d = (m.x * n.x + m.y * n.y) * side;
    if (d > best) {
      best = d;
      key = i;
    }
  }
  if (key < 0) return null;
  const { dir, half, wide, len } = neighbours[key];
  // A bond running nearly straight on through the wide end cannot usefully be
  // cut along: its line is almost the wedge's own, and following it would
  // draw the end out into a spike. Square across the wedge is what carries
  // such a bond out of it, and the other side still follows its own bond.
  if (Math.abs(vcross(dir, axis)) < WEDGE_CUT_MIN_SIN) {
    return {
      on: vadd(atom, vscale(axis, -half)),
      dir: vperp(axis),
      key,
      // square across the axis: the corner only has to come back as far as
      // the cut itself, whatever the bond does
      reach: half * 4,
    };
  }
  const off = vperp(dir);
  const towardsTip = off.x * axis.x + off.y * axis.y >= 0 ? 1 : -1;
  // Take the bond in whole when it is the only one carrying on, or when it is
  // drawn as more than one line: a second line ends beside its own, not on the
  // atom, so a cut that stopped at the atom would leave it stranded.
  const takeWhole = neighbours.length === 1 || wide;
  const edge = takeWhole ? -towardsTip : towardsTip;
  return {
    on: vadd(atom, vscale(off, edge * half)),
    dir,
    key,
    reach: len * WEDGE_MITRE_REACH,
  };
}

/**
 * Where a double bond meets another at an atom, the line beside each of them
 * should meet its neighbour's rather than stop short of it: run on to where
 * the two would cross. Returns the point to end at, or the one given, and
 * says whether it found a line to meet: two thick lines that end on the same
 * point still want a cap over the corner they leave open.
 */
function mitreOffsetEnd(
  atoms: Atom[],
  atIdx: number,
  from: Vec2,
  along: Vec2,
  outward: Vec2,
  offset: number,
  fallback: Vec2,
  sideOf: (b: Bond) => number[],
  others: Bond[],
  limit: number,
): { at: Vec2; met: boolean } {
  const at = { x: atoms[atIdx].x, y: atoms[atIdx].y };
  const mine = { on: vadd(from, vscale(vperp(along), offset)), dir: along };
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const b of others) {
    const far = b.a1 === atIdx ? b.a2 : b.a1;
    const o = atoms[far];
    if (!o) continue;
    const d = vsub({ x: o.x, y: o.y }, at);
    if (vlen(d) < 1e-9) continue;
    const dir = vnorm(d);
    // Offsets are reported against the bond's own direction, a1 to a2. Here
    // the direction runs from this atom outwards, which is the other way
    // round when the bond ends at this atom rather than starting from it, and
    // a line taken to the wrong side of it is one no end will ever meet.
    const flip = b.a1 === atIdx ? 1 : -1;
    // the two bonds' own directions from the atom; a line belongs to the
    // side of the corner its offset leans towards
    const bisect = vnorm(vadd(outward, dir));
    const sideMine = Math.sign(
      vperp(along).x * offset * bisect.x + vperp(along).y * offset * bisect.y,
    );
    for (const raw of sideOf(b)) {
      const off = raw * flip;
      const sideOther = Math.sign(
        vperp(dir).x * off * bisect.x + vperp(dir).y * off * bisect.y,
      );
      // only ever meet the line on the same side of the corner
      if (sideMine * sideOther < 0) continue;
      const line = { on: vadd(at, vscale(vperp(dir), off)), dir };
      const den = vcross(mine.dir, line.dir);
      if (Math.abs(den) < 1e-6) continue;
      const s = vcross(vsub(line.on, mine.on), line.dir) / den;
      const p = vadd(mine.on, vscale(mine.dir, s));
      const dist = vlen(vsub(p, at));
      if (dist > limit || dist >= bestD) continue;
      best = p;
      bestD = dist;
    }
  }
  return { at: best ?? fallback, met: best != null };
}

/**
 * How far the line beside a double bond stops short of an atom. Where it runs
 * inside the angle the bond makes with another bond there, it ends on the
 * bisector of that angle - its offset over the tangent of half the angle, so
 * 1.5 pt at a 120 degree corner in ACS proportions. With nothing on its side
 * it runs right up to the atom.
 */
function sideLineBack(
  atoms: Atom[],
  atIdx: number,
  outward: Vec2,
  side: Vec2,
  offset: number,
  others: Bond[],
): number {
  const at = atoms[atIdx];
  let back = 0;
  for (const b of others) {
    const o = atoms[b.a1 === atIdx ? b.a2 : b.a1];
    if (!o) continue;
    const d = vsub({ x: o.x, y: o.y }, { x: at.x, y: at.y });
    if (vlen(d) < 1e-9) continue;
    const u = vnorm(d);
    if (vdot(u, side) <= 1e-9) continue;
    const theta = Math.acos(Math.max(-1, Math.min(1, vdot(u, outward))));
    if (theta < 1e-6) continue;
    back = Math.max(back, offset / Math.tan(theta / 2));
  }
  return back;
}

/** A plain bond: one line, no stereo, nothing else to it. */
function isPlainSingle(b: Bond): boolean {
  return b.order === 1 && (b.stereo == null || b.stereo === "none");
}

/**
 * Where the line of a centred double bond that lies `offset` off it (on the
 * side of its own a1-to-a2 normal) meets a plain bond leaving `atIdx` along
 * `u`: on that bond's own line. The double bond and the plain one each ask
 * this with the same arguments, so they agree on the point exactly.
 */
function centredMeetPoint(
  atoms: Atom[],
  dbl: Bond,
  atIdx: number,
  offset: number,
  u: Vec2,
): Vec2 | null {
  const a = atoms[dbl.a1];
  const c = atoms[dbl.a2];
  const at = atoms[atIdx];
  const d = vnorm(vsub({ x: c.x, y: c.y }, { x: a.x, y: a.y }));
  const n = vperp(d);
  const den = vcross(d, u);
  if (Math.abs(den) < 1e-6) return null;
  // at + n*offset + t*d lies on at + k*u
  const t = (-offset * vcross(n, u)) / den;
  return vadd({ x: at.x, y: at.y }, vadd(vscale(n, offset), vscale(d, t)));
}

/**
 * The two lines of a double bond drawn centred, each carried on to meet the
 * line of a neighbouring double bond where they share an atom. Left to stop
 * short, consecutive double bonds read as four loose lines rather than a
 * chain.
 */
/** Where the lines of a double bond sit, either side of its own line. */
function doubleOffsets(
  b: Bond,
  off: number,
  doubleSides?: Map<Bond, number | undefined>,
): number[] {
  if (b.order !== 2) return [];
  const mode = b.doubleMode || "auto";
  if (mode === "center") return [off * 0.5, -off * 0.5];
  if (mode === "left") return [off];
  if (mode === "right") return [-off];
  const sgn = doubleSides?.get(b);
  return sgn == null ? [off * 0.5, -off * 0.5] : [off * sgn];
}

function centredPair(
  p1: Vec2,
  p2: Vec2,
  dir: Vec2,
  n: Vec2,
  off: number,
  widthPx: number,
  bond: Bond,
  atoms: Atom[],
  adjBonds?: Map<number, Bond[]>,
  doubleSides?: Map<Bond, number | undefined>,
): { lines: LineSeg[]; meets: Meet[]; ends: Vec2[] } {
  const half = off * 0.5;
  const limit = off * 2;
  const sideOf = (b: Bond) => doubleOffsets(b, off, doubleSides);
  const others = (idx: number) =>
    (adjBonds?.get(idx) ?? []).filter(
      (b) => b !== bond && b.order === 2 && b.stereo !== "up" && b.stereo !== "down",
    );
  const out: LineSeg[] = [];
  const meets: Meet[] = [];
  const ends: Vec2[] = [];
  for (const sgn of [1, -1]) {
    const o = vscale(n, half * sgn);
    const a = vadd(p1, o);
    const b = vadd(p2, o);
    const endA = mitreOffsetEnd(
      atoms,
      bond.a1,
      p1,
      dir,
      dir,
      half * sgn,
      a,
      sideOf,
      others(bond.a1),
      limit,
    );
    const endB = mitreOffsetEnd(
      atoms,
      bond.a2,
      p2,
      dir,
      vscale(dir, -1),
      half * sgn,
      b,
      sideOf,
      others(bond.a2),
      limit,
    );
    // Not met by a double bond's line: run on to the plain bond on this
    // line's side, the way ACS 1996 draws a centred double bond. That bond
    // still reaches the atom, so the line ends on it partway, and the corner
    // is finished between the line and that bond both ways.
    const plainEnd = (
      atIdx: number,
      outward: Vec2,
      end: { at: Vec2; met: boolean },
    ): { at: Vec2; met: boolean; through?: Vec2 } => {
      if (end.met) return end;
      const atom = atoms[atIdx];
      if (atom.el !== "C") return end;
      let best: Vec2 | null = null;
      let bestU: Vec2 | null = null;
      let bestT = -Infinity;
      for (const nb of adjBonds?.get(atIdx) ?? []) {
        if (nb === bond || !isPlainSingle(nb)) continue;
        const far = atoms[nb.a1 === atIdx ? nb.a2 : nb.a1];
        if (!far) continue;
        const u0 = vsub({ x: far.x, y: far.y }, { x: atom.x, y: atom.y });
        if (vlen(u0) < 1e-9) continue;
        const u = vnorm(u0);
        if (Math.sign(vdot(u, n)) !== Math.sign(sgn)) continue;
        const pt = centredMeetPoint(atoms, bond, atIdx, half * sgn, u);
        if (!pt) continue;
        // the first plain bond the line reaches, coming in from the bond
        const t = vdot(vsub(pt, { x: atom.x, y: atom.y }), outward);
        if (t > bestT) {
          best = pt;
          bestU = u;
          bestT = t;
        }
      }
      return best && bestU ? { at: best, met: true, through: bestU } : end;
    };
    const endA2 = plainEnd(bond.a1, dir, endA);
    const endB2 = plainEnd(bond.a2, vscale(dir, -1), endB);
    endA.at = endA2.at;
    endA.met = endA2.met;
    endB.at = endB2.at;
    endB.met = endB2.met;
    const along = vnorm(vsub(endB.at, endA.at));
    if (endA.met) meets.push({ at: endA.at, dir: along });
    else ends.push(endA.at);
    if (endB.met) meets.push({ at: endB.at, dir: vscale(along, -1) });
    else ends.push(endB.at);
    for (const e of [endA2, endB2]) {
      if (!e.through) continue;
      meets.push({ at: e.at, dir: e.through }, { at: e.at, dir: vscale(e.through, -1) });
    }
    out.push({
      x1: endA.at.x,
      y1: endA.at.y,
      x2: endB.at.x,
      y2: endB.at.y,
      widthPx,
    });
  }
  return { lines: out, meets, ends };
}

/** Where two cuts cross: the point both bonds' outlines meet at. */
function cutsCross(a: Cut, b: Cut): Vec2 | null {
  const den = vcross(a.dir, b.dir);
  if (Math.abs(den) < 1e-6) return null;
  const s = vcross(vsub(b.on, a.on), b.dir) / den;
  return vadd(a.on, vscale(a.dir, s));
}

/**
 * Slides a base corner along the wedge's edge until it sits on the cut, or
 * gives up. A bond leaving the atom at a shallow angle to the wedge meets that
 * edge far away; cutting to it would draw the wedge out into a spike instead
 * of tidying its end, and a square end there is no worse than any other bond
 * end, so the corner is left alone.
 */
function cornerOnCut(
  cut: Cut | null,
  corner: Vec2,
  tipCorner: Vec2,
  intoWedge: number,
): Vec2 | null {
  if (!cut) return null;
  const e = vnorm(vsub(tipCorner, corner));
  const den = vcross(e, cut.dir);
  // nearly parallel to the edge: the cut would run off to infinity
  if (Math.abs(den) < 1e-6) return null;
  const t = vcross(vsub(cut.on, corner), cut.dir) / den;
  if (t > intoWedge || t < -cut.reach) return null;
  return vadd(corner, vscale(e, t));
}

/**
 * Replaces each corner of a polygon with an arc of `radius`, the way a round
 * join does. The radius is reduced where an edge is too short to give it room,
 * so a wedge's narrow end becomes a semicircle rather than losing its shape.
 *
 * Only corners that stick out are rounded, and only those `soften` allows. A
 * corner that folds inwards, or one that a bond runs into, keeps its point:
 * rounding it would scoop out the join instead of softening a free edge.
 */
export function roundPolyCorners(
  points: Vec2[],
  radius: number,
  soften?: boolean[],
  segments = 4,
): Vec2[] {
  const n = points.length;
  if (n < 3 || radius <= 0) return points;
  // which way the outline is wound, so a corner can be told from a dent
  let twice = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    twice += p.x * q.y - q.x * p.y;
  }
  const winding = twice >= 0 ? 1 : -1;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const b = points[i];
    const a = points[(i - 1 + n) % n];
    const c = points[(i + 1) % n];
    if (soften && !soften[i]) {
      out.push(b);
      continue;
    }
    if (vcross(vsub(b, a), vsub(c, b)) * winding < 0) {
      out.push(b);
      continue;
    }
    const v1 = vsub(a, b);
    const v2 = vsub(c, b);
    const l1 = vlen(v1);
    const l2 = vlen(v2);
    if (l1 < 1e-9 || l2 < 1e-9) {
      out.push(b);
      continue;
    }
    const u1 = vscale(v1, 1 / l1);
    const u2 = vscale(v2, 1 / l2);
    const cosA = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y));
    const angle = Math.acos(cosA);
    // straight or folded back on itself: nothing to round
    if (angle < 1e-3 || Math.PI - angle < 1e-3) {
      out.push(b);
      continue;
    }
    const half = angle / 2;
    // keep the arc inside both edges, sharing each with the next corner
    const dist = Math.min(radius / Math.tan(half), l1 / 2, l2 / 2);
    const r = dist * Math.tan(half);
    const t1 = vadd(b, vscale(u1, dist));
    const t2 = vadd(b, vscale(u2, dist));
    const bis = vnorm(vadd(u1, u2));
    const centre = vadd(b, vscale(bis, r / Math.sin(half)));
    const a1 = Math.atan2(t1.y - centre.y, t1.x - centre.x);
    const a2 = Math.atan2(t2.y - centre.y, t2.x - centre.x);
    let sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 8)));
    const count = Math.max(steps, segments);
    for (let k = 0; k <= count; k++) {
      const ang = a1 + (sweep * k) / count;
      out.push({
        x: centre.x + r * Math.cos(ang),
        y: centre.y + r * Math.sin(ang),
      });
    }
  }
  return out;
}

/**
 * Fills the notches where bonds meet at an atom the way a mitre join does:
 * for each gap between two bonds, out to the point where the outlines of the
 * two would cross. A gap too shallow for that is cut off square instead.
 */
export function mitreJoinPolys(
  centre: Vec2,
  dirs: Vec2[],
  halfWidth: number,
  miterLimit = 4,
): Poly[] {
  if (dirs.length < 2 || halfWidth <= 0) return [];
  const round = [...dirs].sort(
    (a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x),
  );
  const out: Poly[] = [];
  for (let i = 0; i < round.length; i++) {
    const d1 = round[i];
    const d2 = round[(i + 1) % round.length];
    // the two outlines facing the gap that runs anticlockwise from d1 to d2
    const e1 = vadd(centre, vscale(vperp(d1), halfWidth));
    const e2 = vsub(centre, vscale(vperp(d2), halfWidth));
    const den = vcross(d1, d2);
    let apex: Vec2 | null = null;
    if (Math.abs(den) > 1e-6) {
      const s = vcross(vsub(e2, e1), d2) / den;
      const p = vadd(e1, vscale(d1, s));
      if (vlen(vsub(p, centre)) <= halfWidth * miterLimit) apex = p;
    }
    out.push({
      points: apex ? [centre, e1, apex, e2] : [centre, e1, e2],
    });
  }
  return out;
}

/**
 * Solid wedge. Neither end is a point: the narrow end is as wide as a plain
 * bond so the join at an atom is as clean as a line-to-line one, and the wide
 * end is cut along the bonds that continue from its atom - following each of
 * them where there are two, which dents the middle of the cut inwards.
 */
function buildWedgeTriangle(
  p1: Vec2,
  p2: Vec2,
  baseHalfWorld: number,
  tipHalfWorld: number,
  baseNeighbours: Neighbour[] = [],
  round = false,
): Poly {
  const dir = vnorm(vsub(p2, p1));
  // Keep a taper even when the minimum line width would otherwise make the
  // narrow end as wide as the base (very low zoom).
  const tipHalf = Math.min(tipHalfWorld, baseHalfWorld * 0.5);
  const nb = vscale(vperp(dir), baseHalfWorld);
  const nt = vscale(vperp(dir), tipHalf);
  // Reach just past the atom so the flat tip overlaps the bonds meeting there,
  // the way a mitred line join does.
  const tip = vadd(p2, vscale(dir, tipHalf));
  const tipL = vadd(tip, nt);
  const tipR = vsub(tip, nt);
  const cutL = baseCut(p1, 1, dir, baseNeighbours);
  const cutR = baseCut(p1, -1, dir, baseNeighbours);
  // A corner may slide towards the tip as far as the tip and no further, and
  // back past the atom as far as the cut it follows allows.
  const side = vlen(vsub(tipL, vadd(p1, nb)));
  const squareL = vadd(p1, nb);
  const squareR = vsub(p1, nb);
  const cornerL = cornerOnCut(cutL, squareL, tipL, side);
  const cornerR = cornerOnCut(cutR, squareR, tipR, side);
  // Either both corners follow their cut or neither does. One alone leaves the
  // wide end slewed across the wedge, which at some angles no longer covers
  // the atom at all and cuts the bonds there adrift.
  const mitredL = cornerR ? cornerL : null;
  const mitredR = cornerL ? cornerR : null;
  // A square end left at an atom other bonds meet would stop right at the
  // atom, and the cap that fills the join there would bulge out of it. Reach
  // the cap's width past the atom instead, so the end covers it.
  const back =
    baseNeighbours.length > 0
      ? vscale(dir, -Math.min(tipHalfWorld, baseHalfWorld))
      : { x: 0, y: 0 };
  const baseL = mitredL ?? vadd(squareL, back);
  const baseR = mitredR ?? vadd(squareR, back);
  const points = [baseL];
  // A corner cut along a bond carries on into that bond, so it is not a free
  // corner and must stay as it is; the rest may be softened.
  const soften = [!mitredL];
  if (mitredL && mitredR && cutL && cutR && cutL.key !== cutR.key) {
    // Two bonds carry on from the wide end, so the cut follows one on each
    // side and turns between them.
    const edge = vsub(baseR, baseL);
    const n = vperp(edge);
    const towardsTip = n.x * dir.x + n.y * dir.y >= 0 ? 1 : -1;
    const inwards =
      ((p1.x - baseL.x) * n.x + (p1.y - baseL.y) * n.y) * towardsTip > 0;
    if (inwards) {
      // the turn is inwards: stop at the atom rather than at where the two
      // outlines cross, which is further out than anything else there reaches
      // and would show a sliver of background through the join
      points.push(p1);
      soften.push(false);
    } else {
      // the turn is outwards - a bond carrying straight on through the wide
      // end puts it there - so follow both cuts to where they meet
      const cross = cutsCross(cutL, cutR);
      if (cross && vlen(vsub(cross, p1)) <= baseHalfWorld) {
        points.push(cross);
        soften.push(false);
      }
    }
  }
  points.push(baseR, tipR, tipL);
  soften.push(!mitredR, true, true);
  return {
    points: round ? roundPolyCorners(points, tipHalf, soften) : points,
  };
}

/**
 * Hashes across a wedge, from `narrow` (the stereocentre) to `wide`: the
 * bond's own ends, before anything is trimmed for a label. `span` says how
 * much of it is actually drawn, measured from the narrow end.
 *
 * ACS 1996 spaces them by the hash spacing: as many as fit at least that far
 * apart along the drawn length, spread evenly over it, the last flush with
 * the wide end and none on the narrow atom. Each is as long as the wedge is
 * wide where it sits - nothing at the narrow atom, the full broad end at the
 * wide one - so a label takes hashes away rather than making them bigger.
 */
function buildHashedWedgeSegments(
  narrow: Vec2,
  wide: Vec2,
  wideHalf: number,
  spacing: number,
  lineWidth: number,
  span?: { from: number; to: number },
): LineSeg[] {
  const dir = vnorm(vsub(wide, narrow));
  const n = vperp(dir);
  const full = vlen(vsub(wide, narrow));
  // where the last hash's centre sits when nothing is trimmed
  const reach = full - lineWidth / 2;
  const start = Math.max(0, span ? span.from : 0);
  const end = Math.min(full, span ? span.to : full) - lineWidth / 2;
  const length = end - start;
  if (!(length > 0) || !(reach > 0) || !(spacing > 0)) return [];
  const count = Math.max(1, Math.floor(length / spacing + 1e-9));
  const out: LineSeg[] = [];
  for (let k = 1; k <= count; k++) {
    const at = start + (length * k) / count;
    const half = Math.min(wideHalf, (wideHalf * at) / reach);
    const c = vadd(narrow, vscale(dir, at));
    const a = vadd(c, vscale(n, half));
    const b = vsub(c, vscale(n, half));
    out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, widthPx: 0 });
  }
  return out;
}

/**
 * A wavy bond. `phase` carries the bond's own length and how far into it the
 * drawn part starts, so that trimming for a label shortens the wave rather
 * than squeezing the same number of turns into less room.
 */
function buildWavySegments(
  p1: Vec2,
  p2: Vec2,
  ampPx: number,
  freq: number,
  zoom: number,
  units: "px" | "world" | undefined,
  phase?: { start: number; full: number }
): LineSeg[] {
  const dir = vnorm(vsub(p2, p1));
  const n = vperp(dir);
  const L = vlen(vsub(p2, p1));
  // A whole number of half turns, so the wave meets the bond's own line at
  // both ends: an end left mid-turn sits beside the atom, and the cap that
  // rounds it off then looks loose.
  const turns = Math.max(0.5, Math.round(freq * 2) / 2);
  const steps = Math.max(8, Math.floor(L / Math.max(pxToWorld(6, zoom), 1e-6)));
  const amp = toWorld(ampPx, zoom, units);
  const out: LineSeg[] = [];
  let prev: Vec2 | null = null;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const base = vadd(p1, vscale(dir, L * t));
    const u =
      phase && phase.full > 1e-9 ? (phase.start + L * t) / phase.full : t;
    const off = Math.sin(2 * Math.PI * turns * u);
    const pt = vadd(base, vscale(n, amp * off));
    if (prev) {
      out.push({ x1: prev.x, y1: prev.y, x2: pt.x, y2: pt.y, widthPx: 0 });
    }
    prev = pt;
  }
  return out;
}

/**
 * Valences used to work out how many hydrogens a drawn atom carries. Charges
 * and radicals are not modelled yet, so a charged atom gets no hydrogens here.
 */
const DEFAULT_VALENCE: Record<string, number> = {
  B: 3,
  C: 4,
  N: 3,
  O: 2,
  Si: 4,
  P: 3,
  S: 2,
  Se: 2,
  F: 1,
  Cl: 1,
  Br: 1,
  I: 1,
};

/** Hydrogens left on an atom of `el` whose bond orders sum to `bondOrderSum`. */
export function implicitHydrogens(el: string, bondOrderSum: number): number {
  const valence = DEFAULT_VALENCE[el];
  if (valence == null) return 0;
  return Math.max(0, valence - bondOrderSum);
}

/**
 * How far from vertical, either way, the bonds of a labelled atom may lean and
 * still count as vertical for placing its hydrogens: 10 degrees. Not 15:
 * bonds snap to 15-degree steps, and the edge of the band should not sit on
 * one of them.
 */
const SIN_VERTICAL_BAND = Math.sin((10 * Math.PI) / 180);

export function buildTextLabels(
  atoms: Atom[],
  opts: LayoutOptions,
  bonds: Bond[] = []
): TextItem[] {
  // Bond orders and directions per atom: the first decides how many hydrogens
  // an atom carries, the second which side to write them on.
  const orderSum = new Map<number, number>();
  const away = new Map<number, Vec2>();
  const note = (i: number, j: number, order: number) => {
    orderSum.set(i, (orderSum.get(i) ?? 0) + order);
    const from = atoms[i];
    const to = atoms[j];
    if (!from || !to) return;
    const d = vnorm(vsub({ x: to.x, y: to.y }, { x: from.x, y: from.y }));
    const acc = away.get(i) ?? { x: 0, y: 0 };
    away.set(i, { x: acc.x + d.x, y: acc.y + d.y });
  };
  for (const b of bonds) {
    const order = b.order ?? 1;
    note(b.a1, b.a2, order);
    note(b.a2, b.a1, order);
  }

  const out: TextItem[] = [];
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const show = opts.showCarbonLabels || a.el !== "C";
    if (!show) continue;
    const h =
      opts.showImplicitHydrogens === false
        ? 0
        : implicitHydrogens(a.el, orderSum.get(i) ?? 0);
    if (h <= 0) {
      out.push({
        x: a.x,
        y: a.y,
        text: a.el,
        fontPx: opts.fontPx,
        runs: [{ text: a.el }],
        anchorRun: 0,
        atom: i,
      });
      continue;
    }
    const hydrogens: TextRun[] =
      h > 1 ? [{ text: "H" }, { text: String(h), sub: true }] : [{ text: "H" }];
    // Keep the hydrogens clear of the bonds: if the neighbours sit to the
    // right, write HO rather than OH. Within a band either side of vertical
    // they sit neither side, and OH it is - otherwise a bond that leans a
    // hair to the right flips the label, and a dragged atom swinging through
    // vertical flickers between the two.
    const toward = away.get(i) ?? { x: 0, y: 0 };
    const neighboursRight =
      toward.x > Math.hypot(toward.x, toward.y) * SIN_VERTICAL_BAND;
    const runs = neighboursRight
      ? [...hydrogens, { text: a.el }]
      : [{ text: a.el }, ...hydrogens];
    out.push({
      x: a.x,
      y: a.y,
      text: runs.map((r) => r.text).join(""),
      fontPx: opts.fontPx,
      runs,
      anchorRun: neighboursRight ? runs.length - 1 : 0,
      atom: i,
    });
  }
  return out;
}

/**
 * Which end of a wedge carries the wide base. By the usual principle the thin
 * end points at the stereocentre, i.e. the atom of higher degree; the reverse
 * orientation swaps the ends.
 */
function wedgeBaseAtom(bond: Bond, deg?: Map<number, number>): number {
  const degA = deg?.get(bond.a1) || 0;
  const degB = deg?.get(bond.a2) || 0;
  const thinAtA = degA >= degB; // tie: thin end at a1
  const baseAtA = bond.stereoOrient === "reverse" ? thinAtA : !thinAtA;
  return baseAtA ? bond.a1 : bond.a2;
}

function degreeMap(bonds: Bond[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const b of bonds) {
    m.set(b.a1, (m.get(b.a1) || 0) + 1);
    m.set(b.a2, (m.get(b.a2) || 0) + 1);
  }
  return m;
}

export function buildBondPrimitives(
  atoms: Atom[],
  bond: Bond,
  opts: LayoutOptions,
  zoom: number,
  deg?: Map<number, number>,
  // Where a second line stops no longer depends on whether the bond is in a
  // ring - the angles at its atoms decide - but callers still pass it.
  _inRing?: boolean,
  autoSgn?: number,
  adjBonds?: Map<number, Bond[]>,
  labelBoxes?: Map<number, LabelBox>,
  doubleSides?: Map<Bond, number | undefined>
): BondPrimitives {
  const a = atoms[bond.a1];
  const c = atoms[bond.a2];
  const p1o = { x: a.x, y: a.y };
  const p2o = { x: c.x, y: c.y };
  const lines: LineSeg[] = [];
  const polys: Poly[] = [];
  const units = opts.units ?? "px";
  let lwPx = units === "world" ? opts.lineWidthPx * zoom : opts.lineWidthPx;
  const minPx = Math.max(0.5, opts.minLinePx ?? 1);
  if (!(lwPx >= minPx)) lwPx = minPx;
  // Stop a bond short of a label so the two do not overlap. How far depends
  // on which way the bond leaves: OH reaches further to the right than up, so
  // measuring by font size alone lets a bond run into a wide label from one
  // side and leaves a gap from another.
  const hasLabel = (el: string) => opts.showCarbonLabels || el !== "C";
  const fontWorld = toWorld(opts.fontPx, zoom, units);
  // Additional clearance ≈ half the line thickness (in world units)
  const trimMargin = pxToWorld(lwPx * 0.5, zoom);
  const dir0 = vsub(p2o, p1o);
  const L0 = vlen(dir0);
  const dir = L0 > 1e-9 ? vscale(dir0, 1 / L0) : { x: 1, y: 0 };
  /** How far the label at an atom reaches along the bond, either way. */
  const labelReach = (idx: number, el: string, towards: Vec2) => {
    if (!hasLabel(el)) return 0;
    const box = idx >= 0 ? labelBoxes?.get(idx) : undefined;
    if (!box) return Math.max(0, fontWorld * 0.5) + trimMargin;
    // the box around the atom, met along the bond
    const sx = towards.x >= 0 ? box.right : box.left;
    const tx = Math.abs(towards.x) > 1e-9 ? sx / Math.abs(towards.x) : Infinity;
    const ty =
      Math.abs(towards.y) > 1e-9 ? box.half / Math.abs(towards.y) : Infinity;
    return Math.min(tx, ty) + trimMargin;
  };
  const trimA0 = labelReach(bond.a1, a.el, dir);
  const trimB0 = labelReach(bond.a2, c.el, vscale(dir, -1));
  const trimA = Math.min(trimA0, Math.max(0, L0 * 0.45));
  const trimB = Math.min(trimB0, Math.max(0, L0 * 0.45));
  const p1 = vadd(p1o, vscale(dir, trimA));
  const p2 = vadd(p2o, vscale(dir, -trimB));
  // Where a label has taken the bond's end, the line simply stops there, and
  // that end is finished off like any other free end.
  const labelEnds: Vec2[] = [];
  if (hasLabel(a.el) && trimA > 0) labelEnds.push(p1);
  if (hasLabel(c.el) && trimB > 0) labelEnds.push(p2);
  if (bond.stereo === "up" || bond.stereo === "down") {
    const baseAtP1 = wedgeBaseAtom(bond, deg) === bond.a1;
    const baseHalf = toWorld(opts.wedgeWidthPx * 0.5, zoom, units);
    // The narrow end is a bond's width, matching the join caps at atoms.
    const tipHalf = pxToWorld(lwPx * 0.5, zoom);
    const bp1 = baseAtP1 ? p1 : p2;
    const bp2 = baseAtP1 ? p2 : p1;
    if (bond.stereo === "up") {
      // Directions of the bonds continuing from the wide end, to cut it along
      // them. A labelled atom is left out: the bond stops short of the label,
      // so there is no join to make.
      const baseIdx = baseAtP1 ? bond.a1 : bond.a2;
      const tipIdx = baseAtP1 ? bond.a2 : bond.a1;
      const baseAtom = atoms[baseIdx];
      const neighbours: Neighbour[] = [];
      if (!hasLabel(baseAtom.el)) {
        const half = pxToWorld(lwPx * 0.5, zoom);
        const doubleHalf = toWorld(opts.doubleOffsetPx, zoom, units) * 0.5;
        const tripleHalf = toWorld(opts.tripleOffsetPx, zoom, units);
        for (const b of adjBonds?.get(baseIdx) ?? []) {
          const other = b.a1 === baseIdx ? b.a2 : b.a1;
          if (other === tipIdx || other === baseIdx) continue;
          const o = atoms[other];
          if (!o) continue;
          const d = vsub({ x: o.x, y: o.y }, { x: baseAtom.x, y: baseAtom.y });
          if (vlen(d) < 1e-9) continue;
          // how far that bond reaches either side of its own line
          const spread =
            b.order === 3 ? tripleHalf : b.order === 2 ? doubleHalf : 0;
          neighbours.push({
            dir: vnorm(d),
            half: half + spread,
            wide: spread > 0,
            len: vlen(d),
          });
        }
      }
      const tri = buildWedgeTriangle(
        bp1,
        bp2,
        baseHalf,
        tipHalf,
        neighbours,
        (opts.joinStyle ?? "round") === "round",
      );
      polys.push(tri);
      return { lines, polys };
    } else {
      // Place the hashes on the bond itself and draw the part that is left
      // after any label has taken its share.
      const wideO = baseAtP1 ? p1o : p2o;
      const narrowO = baseAtP1 ? p2o : p1o;
      const trimWide = baseAtP1 ? trimA : trimB;
      const trimNarrow = baseAtP1 ? trimB : trimA;
      const segs = buildHashedWedgeSegments(
        narrowO,
        wideO,
        baseHalf,
        toWorld(opts.hashSpacingPx, zoom, units),
        pxToWorld(lwPx, zoom),
        { from: trimNarrow, to: L0 - trimWide },
      );
      for (let i = 0; i < segs.length; i++) segs[i].widthPx = lwPx;
      lines.push(...segs);
      const ends = segs.flatMap((l) => [
        { x: l.x1, y: l.y1 },
        { x: l.x2, y: l.y2 },
      ]);
      return { lines, polys, ends };
    }
  }
  if (bond.stereo === "wavy") {
    lines.push(
      ...buildWavySegments(p1, p2, opts.wavyAmpPx, opts.wavyFreq, zoom, units, {
        start: trimA,
        full: L0,
      })
    );
    for (const l of lines) l.widthPx = lwPx;
    // A wave is short straight pieces end to end; the corner between two of
    // them wants the same finish as a join, or it shows as a nick.
    const bends: Bend[] = [];
    for (let i = 1; i < lines.length; i++) {
      const prev = lines[i - 1];
      const next = lines[i];
      bends.push({
        at: { x: next.x1, y: next.y1 },
        dirs: [
          vnorm({ x: prev.x1 - prev.x2, y: prev.y1 - prev.y2 }),
          vnorm({ x: next.x2 - next.x1, y: next.y2 - next.y1 }),
        ],
      });
    }
    return { lines, polys, bends, ends: labelEnds };
  }
  if (bond.order === 1) {
    // No trimming: ensure bonds meet cleanly at atoms
    lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, widthPx: lwPx });
    return { lines, polys, ends: labelEnds };
  }
  if (bond.order === 2) {
    const off = toWorld(opts.doubleOffsetPx, zoom, units);
    const dir = vnorm(vsub(p2, p1));
    const n = vperp(dir);

    const mode = bond.doubleMode || "auto";
    // Which side the second line goes: null puts one either side, at half
    // the offset, and a number puts a single one that far off the axis.
    const sgn =
      mode === "center"
        ? null
        : mode === "left"
          ? 1
          : mode === "right"
            ? -1
            : autoSgn == null || !isFinite(autoSgn)
              ? null
              : autoSgn >= 0
                ? 1
                : -1;
    if (sgn == null) {
      // Symmetric placement: two lines at +/-off/2 from the axis, each run on
      // to meet its neighbour's where two double bonds share an atom
      const pair = centredPair(
        p1,
        p2,
        dir,
        n,
        off,
        lwPx,
        bond,
        atoms,
        adjBonds,
        doubleSides,
      );
      lines.push(...pair.lines);
      return { lines, polys, meets: pair.meets, ends: pair.ends };
    }
    // Skew placement: the bond's own line, and a second one to one side of
    // it. That one meets the line of a double bond next door where they share
    // an atom, rather than stopping short of it: two double bonds in a row
    // read as a chain that way, and as four loose lines otherwise. Elsewhere
    // it stops on the bisector of the angle it runs inside, and runs up to an
    // atom with nothing on its side - in a ring, both ends; in a chain, the
    // end inside the zigzag. A label takes both lines' ends alike.
    const o = vscale(n, off * sgn);
    const around = (idx: number) =>
      (adjBonds?.get(idx) ?? []).filter((nb) => nb !== bond);
    const back1 = hasLabel(a.el)
      ? 0
      : sideLineBack(atoms, bond.a1, dir, vscale(n, sgn), off, around(bond.a1));
    const back2 = hasLabel(c.el)
      ? 0
      : sideLineBack(
          atoms,
          bond.a2,
          vscale(dir, -1),
          vscale(n, sgn),
          off,
          around(bond.a2),
        );
    const room = Math.max(0, vlen(vsub(p2, p1)) * 0.45);
    const ps1 = vadd(p1, vscale(dir, Math.min(back1, room)));
    const ps2 = vadd(p2, vscale(dir, -Math.min(back2, room)));
    const others = (idx: number) =>
      (adjBonds?.get(idx) ?? []).filter(
        (nb) =>
          nb !== bond &&
          nb.order === 2 &&
          nb.stereo !== "up" &&
          nb.stereo !== "down",
      );
    const sideOf = (nb: Bond) => doubleOffsets(nb, off, doubleSides);
    const ps1b = mitreOffsetEnd(
      atoms,
      bond.a1,
      p1,
      dir,
      dir,
      off * sgn,
      vadd(ps1, o),
      sideOf,
      others(bond.a1),
      off * 2,
    );
    const ps2b = mitreOffsetEnd(
      atoms,
      bond.a2,
      p2,
      dir,
      vscale(dir, -1),
      off * sgn,
      vadd(ps2, o),
      sideOf,
      others(bond.a2),
      off * 2,
    );
    lines.push(
      { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, widthPx: lwPx },
      {
        x1: ps1b.at.x,
        y1: ps1b.at.y,
        x2: ps2b.at.x,
        y2: ps2b.at.y,
        widthPx: lwPx,
      },
    );
    const meets: Meet[] = [];
    const ends: Vec2[] = [...labelEnds];
    const along = vnorm(vsub(ps2b.at, ps1b.at));
    if (ps1b.met) meets.push({ at: ps1b.at, dir: along });
    else ends.push(ps1b.at);
    if (ps2b.met) meets.push({ at: ps2b.at, dir: vscale(along, -1) });
    else ends.push(ps2b.at);
    return { lines, polys, meets, ends };
  }
  if (bond.order === 3) {
    // Triple bond outer offset matches the double-bond offset
    const off = toWorld(opts.doubleOffsetPx, zoom, units);
    // The outer lines run the bond's whole length, square to the atoms at
    // either end, as ACS 1996 draws them.
    const [o1, , o3] = buildTripleLines(p1, p2, off);
    lines.push(
      { x1: o1.x1, y1: o1.y1, x2: o1.x2, y2: o1.y2, widthPx: lwPx },
      { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, widthPx: lwPx },
      { x1: o3.x1, y1: o3.y1, x2: o3.x2, y2: o3.y2, widthPx: lwPx }
    );
    const ends = [
      ...labelEnds,
      { x: o1.x1, y: o1.y1 },
      { x: o1.x2, y: o1.y2 },
      { x: o3.x1, y: o3.y1 },
      { x: o3.x2, y: o3.y2 },
    ];
    return { lines, polys, ends };
  }
  lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, widthPx: lwPx });
  return { lines, polys, ends: labelEnds };
}

/**
 * Where bonds meet, and where one simply ends, the drawing is finished off:
 * with a cap of half a line width when joins are round, and with a mitre
 * between the bonds when they are sharp. Not every atom wants one.
 *
 * `caps` are the atoms a round cap belongs on and `mitres` the atoms a sharp
 * join is built at, with the directions of the plain bonds arriving there.
 * The drag preview draws the atom it is carrying itself, so it asks the same
 * question of the same function rather than guessing: a dot the drawing does
 * not have must not appear for as long as the atom is moving.
 */
export function joinsAtAtoms(
  atoms: Atom[],
  bonds: Bond[],
  opts: LayoutOptions,
  deg: Map<number, number>,
  doubleSides?: Map<Bond, number | undefined>,
): { caps: Set<number>; mitres: Map<number, Vec2[]> } {
  // A double bond drawn centred has no line along the bond itself, so nothing
  // of it reaches the atom for a cap to round off: a cap there is a dot in
  // mid air between the two lines. Which way an automatic one went is known
  // once the sides are worked out; without them, it is taken as centred.
  const onAxis = (b: Bond) =>
    b.order !== 2 ||
    (doubleSides
      ? doubleOffsets(b, 1, doubleSides).length === 1
      : b.doubleMode !== undefined &&
        b.doubleMode !== "auto" &&
        b.doubleMode !== "center");
  const reaching = new Map<number, number>();
  for (const b of bonds) {
    if (!onAxis(b)) continue;
    reaching.set(b.a1, (reaching.get(b.a1) ?? 0) + 1);
    reaching.set(b.a2, (reaching.get(b.a2) ?? 0) + 1);
  }
  const plainDirs = new Map<number, Vec2[]>();
  const plainEnds = new Set<number>();
  for (const b of bonds) {
    // A wedge is a shape of its own, and a hashed one is a row of hashes:
    // a cap at either would sit past the last of them as a loose dot.
    if (b.stereo === "up" || b.stereo === "down") continue;
    if (!onAxis(b)) continue;
    plainEnds.add(b.a1);
    plainEnds.add(b.a2);
    const p = { x: atoms[b.a1].x, y: atoms[b.a1].y };
    const q = { x: atoms[b.a2].x, y: atoms[b.a2].y };
    if (vlen(vsub(q, p)) < 1e-9) continue;
    plainDirs.set(b.a1, [...(plainDirs.get(b.a1) ?? []), vnorm(vsub(q, p))]);
    plainDirs.set(b.a2, [...(plainDirs.get(b.a2) ?? []), vnorm(vsub(p, q))]);
  }
  // The wide end of a solid wedge covers the join at its atom itself, either
  // by reaching past it or by being cut along the bonds there; a cap on top of
  // that only bulges out of the wedge.
  const wedgeEnds = new Set<number>();
  for (const b of bonds) {
    if (b.stereo === "up") wedgeEnds.add(wedgeBaseAtom(b, deg));
  }
  const caps = new Set<number>();
  const mitres = new Map<number, Vec2[]>();
  for (let i = 0; i < atoms.length; i++) {
    const d = deg.get(i) || 0;
    const showLabel = opts.showCarbonLabels || atoms[i].el !== "C";
    // A label takes the bond's end with it, and a wedge's wide end covers its
    // own join, so neither wants anything here.
    if (showLabel || wedgeEnds.has(i)) continue;
    // A free end of a plain bond, or any atom bonds meet at - including one
    // where only wedges meet, whose thin ends are each a bond wide and do
    // not fill the join between them on their own. Something has to reach
    // the atom for the cap to round off, though.
    if (plainEnds.has(i) || (d >= 2 && (reaching.get(i) ?? 0) > 0)) caps.add(i);
    if (d >= 2) mitres.set(i, plainDirs.get(i) ?? []);
  }
  return { caps, mitres };
}

export function buildAllPrimitives(
  atoms: Atom[],
  bonds: Bond[],
  opts: LayoutOptions,
  zoom: number
): { lines: LineSeg[]; polys: Poly[]; circles: Circle[]; fills: Circle[] } {
  const lines: LineSeg[] = [];
  const polys: Poly[] = [];
  const circles: Circle[] = [];
  const fills: Circle[] = [];
  const deg = degreeMap(bonds);
  // adjacency by index
  // Which side the second line of each double bond takes. Worked out for all
  // of them before any is drawn, so that a bond can meet its neighbour's line
  // where they share an atom instead of stopping short of it.
  const doubleSides = new Map<Bond, number | undefined>();
  for (const b of bonds) {
    if (b.order !== 2) continue;
    if (b.doubleMode !== undefined && b.doubleMode !== "auto") continue;
    const p1 = { x: atoms[b.a1].x, y: atoms[b.a1].y };
    const p2 = { x: atoms[b.a2].x, y: atoms[b.a2].y };
    const axis = vsub(p2, p1);
    const L0 = vlen(axis);
    const dir = L0 > 1e-9 ? vscale(axis, 1 / L0) : { x: 1, y: 0 };
    const n = vperp(dir); // Treat +n as "left"
    const neigh1 = bonds
      .filter((o) => o !== b && (o.a1 === b.a1 || o.a2 === b.a1))
      .map((o) => (o.a1 === b.a1 ? o.a2 : o.a1));
    const neigh2 = bonds
      .filter((o) => o !== b && (o.a1 === b.a2 || o.a2 === b.a2))
      .map((o) => (o.a1 === b.a2 ? o.a2 : o.a1));
    const EPS = Math.max(1e-4, L0 * 0.06); // Ignore near-axis to suppress flipping
    let plus = 0;
    let minus = 0;
    for (const [from, list] of [
      [p1, neigh1],
      [p2, neigh2],
    ] as [Vec2, number[]][]) {
      for (const o of list) {
        const v = { x: atoms[o].x - from.x, y: atoms[o].y - from.y };
        const s = v.x * n.x + v.y * n.y;
        if (s > EPS) plus++;
        else if (s < -EPS) minus++;
      }
    }
    let sgn: number | undefined = plus === minus ? undefined : plus > minus ? 1 : -1;
    if (sgn != null) {
      // A bond of its own width beside the second line leaves no room for it.
      const clearance = (side: number) => {
        let worst = Math.PI;
        for (const [from, list] of [
          [p1, neigh1],
          [p2, neigh2],
        ] as [Vec2, number[]][]) {
          for (const o of list) {
            const v = vnorm({ x: atoms[o].x - from.x, y: atoms[o].y - from.y });
            if ((v.x * n.x + v.y * n.y) * side <= 0) continue;
            const along = Math.abs(v.x * dir.x + v.y * dir.y);
            worst = Math.min(worst, Math.acos(Math.min(1, along)));
          }
        }
        return worst;
      };
      const CROWDED = Math.PI / 4;
      const here = clearance(sgn);
      const there = clearance(-sgn);
      if (here < CROWDED && there > here) sgn = -sgn;
    }
    doubleSides.set(b, sgn);
  }

  // bonds at each atom, and just the neighbours, which the ring search uses
  // measure the labels once: the bonds are trimmed to them
  const fontWorld = toWorld(opts.fontPx, zoom, opts.units);
  const labelBoxes = new Map<number, LabelBox>();
  for (const tx of buildTextLabels(atoms, opts, bonds)) {
    if (tx.atom != null) labelBoxes.set(tx.atom, labelBox(tx, fontWorld));
  }
  const adjBonds = new Map<number, Bond[]>();
  for (const b of bonds) {
    adjBonds.set(b.a1, [...(adjBonds.get(b.a1) || []), b]);
    adjBonds.set(b.a2, [...(adjBonds.get(b.a2) || []), b]);
  }
  const adj = new Map<number, number[]>();
  for (const b of bonds) {
    adj.set(b.a1, [...(adj.get(b.a1) || []), b.a2]);
    adj.set(b.a2, [...(adj.get(b.a2) || []), b.a1]);
  }
  // detect 6-cycle ring edges
  const ringEdges = new Set<string>();
  // For each 6-cycle ring, store its center and the set of edges belonging only to that ring
  const ringCenters: Array<{ c: Vec2; edges: Set<string> }> = [];
  {
    const seen = new Set<string>();
    function dfs6(
      startIdx: number,
      currIdx: number,
      path: number[],
      visited: Set<number>
    ) {
      if (path.length === 6) {
        if ((adj.get(currIdx) || []).includes(startIdx)) {
          const cycle = [...path];
          const key = [...cycle].sort((a, b) => a - b).join("-");
          if (!seen.has(key)) {
            seen.add(key);
            const pts: Vec2[] = [];
            const edgesLocal = new Set<string>();
            for (let i = 0; i < 6; i++) {
              const u = cycle[i];
              const v = cycle[(i + 1) % 6];
              const idu = atoms[u].id,
                idv = atoms[v].id;
              const ekey = idu < idv ? `${idu}-${idv}` : `${idv}-${idu}`;
              ringEdges.add(ekey); // Global set (for inRing checks)
              edgesLocal.add(ekey); // Per-ring set
              pts.push({ x: atoms[u].x, y: atoms[u].y });
            }
            // Ring center (simple average)
            const c = pts.reduce(
              (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
              { x: 0, y: 0 }
            );
            const cx = c.x / 6,
              cy = c.y / 6;
            ringCenters.push({ c: { x: cx, y: cy }, edges: edgesLocal });
          }
        }
        return;
      }
      for (const nxt of adj.get(currIdx) || []) {
        if (nxt === startIdx && path.length >= 3) continue;
        if (visited.has(nxt)) continue;
        visited.add(nxt);
        dfs6(startIdx, nxt, [...path, nxt], visited);
        visited.delete(nxt);
      }
    }
    for (let i = 0; i < atoms.length; i++) dfs6(i, i, [i], new Set([i]));
  }
  // optional aromatic circle detection (6-cycle with >=3 double bonds)
  const aromaticEdges = new Set<string>();
  const enableAll = opts.aromaticCircle === true;
  const enabledSet: Set<string> | null =
    typeof opts.aromaticCircle === "object" &&
    opts.aromaticCircle &&
    (opts.aromaticCircle as any).enabled
      ? (opts.aromaticCircle as any).enabled
      : null;
  if (enableAll || enabledSet) {
    const seen = new Set<string>();
    function dfs(
      startIdx: number,
      currIdx: number,
      path: number[],
      visited: Set<number>
    ) {
      if (path.length === 6) {
        if ((adj.get(currIdx) || []).includes(startIdx)) {
          const cycle = [...path];
          // ringKey: concatenation of atom.id in ascending order
          const ids = cycle.map((i) => atoms[i].id).sort((a, b) => a - b);
          const ringKey = ids.join("-");
          if (!seen.has(ringKey)) {
            seen.add(ringKey);
            let doubles = 0;
            const pts: Vec2[] = [];
            for (let i = 0; i < 6; i++) {
              const u = cycle[i];
              const v = cycle[(i + 1) % 6];
              const be = bonds.find(
                (bb) =>
                  (bb.a1 === u && bb.a2 === v) || (bb.a1 === v && bb.a2 === u)
              );
              if (be && be.order === 2) doubles++;
              pts.push({ x: atoms[u].x, y: atoms[u].y });
              // Edge-key calculation is deferred to demotion time; skip here
            }
            const isAromatic = doubles >= 3;
            const isEnabled =
              enableAll || (!!enabledSet && enabledSet.has(ringKey));
            if (isAromatic && isEnabled) {
              const c = pts.reduce(
                (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
                { x: 0, y: 0 }
              );
              c.x /= 6;
              c.y /= 6;
              let r = 0;
              for (const p of pts) r += Math.hypot(p.x - c.x, p.y - c.y);
              r /= 6;
              circles.push({ c, r: r * 0.5, key: ringKey });
              // Demote these 6 edges (belonging to this ring)
              for (let i = 0; i < 6; i++) {
                const u = cycle[i];
                const v = cycle[(i + 1) % 6];
                const idu = atoms[u].id,
                  idv = atoms[v].id;
                const ekey = idu < idv ? `${idu}-${idv}` : `${idv}-${idu}`;
                aromaticEdges.add(ekey);
              }
            }
          }
        }
        return;
      }
      for (const nxt of adj.get(currIdx) || []) {
        if (nxt === startIdx && path.length >= 3) continue;
        if (visited.has(nxt)) continue;
        visited.add(nxt);
        dfs(startIdx, nxt, [...path, nxt], visited);
        visited.delete(nxt);
      }
    }
    for (let i = 0; i < atoms.length; i++) dfs(i, i, [i], new Set([i]));
  }
  // join fill caps for degree==2 to avoid wedge gaps at ~120°
  const widthPx =
    opts.units === "world" ? opts.lineWidthPx * zoom : opts.lineWidthPx;
  const rWorld =
    opts.units === "world"
      ? opts.lineWidthPx * 0.5
      : pxToWorld(widthPx * 0.5, zoom); // restore previous size
  // How a plain bond ends, and how plain bonds meet. Round: a cap of half a
  // line width at every end, so a join and the end of a chain are rounded to
  // the same degree. Sharp: a flat end, and a mitre where two bonds meet.
  const roundJoins = (opts.joinStyle ?? "round") === "round";
  const joins = joinsAtAtoms(atoms, bonds, opts, deg, doubleSides);
  for (const i of roundJoins ? joins.caps : []) {
    fills.push({ c: { x: atoms[i].x, y: atoms[i].y }, r: rWorld });
  }
  if (!roundJoins) {
    for (const [i, dirs] of joins.mitres) {
      polys.push(
        ...mitreJoinPolys({ x: atoms[i].x, y: atoms[i].y }, dirs, rWorld),
      );
    }
  }
  // build lines/polys
  const meets: Meet[] = [];
  const freeEnds: Vec2[] = [];
  const bends: Bend[] = [];
  for (const b of bonds) {
    const u = atoms[b.a1].id,
      v = atoms[b.a2].id;
    const key = u < v ? `${u}-${v}` : `${v}-${u}`;
    const inRing = ringEdges.has(key);
    const beff: Bond = aromaticEdges.has(key) ? { ...b, order: 1 } : b;
    // which side the second line of a double bond takes, worked out for every
    // one of them first so that each knows what its neighbours are doing
    const autoSgn = doubleSides.get(b);
    const r = buildBondPrimitives(
      atoms,
      beff,
      opts,
      zoom,
      deg,
      inRing,
      autoSgn,
      adjBonds,
      labelBoxes,
      doubleSides
    );
    lines.push(...r.lines);
    polys.push(...r.polys);
    meets.push(...(r.meets ?? []));
    freeEnds.push(...(r.ends ?? []));
    bends.push(...(r.bends ?? []));
  }
  // Every end and corner the joins at atoms have not already seen to:
  // rounded all, or squared all. Two lines of neighbouring double bonds run
  // on to the same point, but a point is all they share, so the corner they
  // turn needs finishing as much as a wave's does. A free end needs nothing
  // when ends are square: a line already stops flat.
  if (roundJoins) {
    for (const m of meets) fills.push({ c: m.at, r: rWorld });
    for (const e of freeEnds) fills.push({ c: e, r: rWorld });
    for (const b of bends) fills.push({ c: b.at, r: rWorld });
  } else {
    const byPoint = new Map<string, { at: Vec2; dirs: Vec2[] }>();
    for (const m of meets) {
      const key = `${m.at.x.toFixed(6)},${m.at.y.toFixed(6)}`;
      const g = byPoint.get(key) ?? { at: m.at, dirs: [] };
      g.dirs.push(m.dir);
      byPoint.set(key, g);
    }
    for (const g of [...byPoint.values(), ...bends]) {
      polys.push(...mitreJoinPolys(g.at, g.dirs, rWorld));
    }
  }
  return { lines, polys, circles, fills };
}

export function layoutMolecule(
  atoms: Atom[],
  bonds: Bond[],
  opts: LayoutOptions,
  zoom: number
): Layout {
  const prim = buildAllPrimitives(atoms, bonds, opts, zoom);
  const texts = buildTextLabels(atoms, opts, bonds);
  // A label hangs off its atom, so the drawing is wider than the atoms are:
  // leave it out and a label at the edge is cut off, on the canvas as in an
  // export.
  const bounds = expandBoundsForLabels(
    computeBounds(atoms),
    texts,
    toWorld(opts.fontPx, zoom, opts.units),
  );
  return {
    lines: prim.lines,
    polys: prim.polys,
    texts,
    circles: prim.circles,
    fills: prim.fills,
    bounds,
    zoom,
  };
}

function toSvgPath(poly: Poly): string {
  if (!poly.points.length) return "";
  const p0 = poly.points[0];
  const segs = [`M ${p0.x} ${-p0.y}`];
  for (let i = 1; i < poly.points.length; i++) {
    const p = poly.points[i];
    segs.push(`L ${p.x} ${-p.y}`);
  }
  segs.push("Z");
  return segs.join(" ");
}

function expandBounds(
  bounds: { min: Vec2; max: Vec2 },
  pad: number
): { min: Vec2; max: Vec2 } {
  return {
    min: { x: bounds.min.x - pad, y: bounds.min.y - pad },
    max: { x: bounds.max.x + pad, y: bounds.max.y + pad },
  };
}

function escapeXml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A label as the canvas draws it: runs, subscripts, symbol on the atom. */
function svgLabel(
  t: TextItem,
  fontSize: number,
  fontFamily: string,
  fill: string,
): string {
  const runs = t.runs ?? [{ text: t.text }];
  const anchor = Math.min(t.anchorRun ?? 0, runs.length - 1);
  const sizeOf = (i: number) => fontSize * (runs[i].sub ? SUB_SCALE : 1);
  const dropOf = (i: number) => (runs[i].sub ? fontSize * SUB_DROP : 0);
  // The element symbol sits on the atom; the rest follows on either side.
  let x = t.x - runWidth(runs[anchor].text, fontSize) / 2;
  for (let i = 0; i < anchor; i++) x -= runWidth(runs[i].text, sizeOf(i));
  let out = "";
  for (let i = 0; i < runs.length; i++) {
    const size = sizeOf(i);
    out +=
      `<text x="${x}" y="${-t.y + dropOf(i)}" font-family="${fontFamily}"` +
      ` font-size="${size}" fill="${fill}" stroke="none" text-anchor="start"` +
      ` dominant-baseline="central">${escapeXml(runs[i].text)}</text>`;
    x += runWidth(runs[i].text, size);
  }
  return out;
}

/**
 * The same drawing as the canvas, as SVG. Everything is written in the
 * coordinates the layout is in: a line's width and a label's font size are
 * converted out of pixels with the zoom the layout was built for, so the
 * drawing keeps its proportions at any size it is shown at. The px size the
 * layout was built for is kept as the SVG's own width and height.
 */
export function createSVG(layout: Layout, opts: LayoutOptions): string {
  const zoom = layout.zoom > 0 ? layout.zoom : 1;
  const toCoord = (px: number) => px / zoom;
  const b = expandBounds(layout.bounds, toCoord(opts.paddingPx));
  const width = b.max.x - b.min.x;
  const height = b.max.y - b.min.y;
  const vb = `${b.min.x} ${-b.max.y} ${width} ${height}`;
  const stroke = "black";
  const fontFamily = "Arial, Helvetica, sans-serif";
  const strokeWidth = toWorld(opts.lineWidthPx, zoom, opts.units);
  const fontSize = toWorld(opts.fontPx, zoom, opts.units);
  let s = "";
  s += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"` +
    ` width="${width * zoom}" height="${height * zoom}" fill="none">`;
  // filled join caps
  for (const c of layout.fills || []) {
    s += `<circle cx="${c.c.x}" cy="${-c.c
      .y}" r="${c.r}" fill="${stroke}" stroke="none" />`;
  }
  for (const p of layout.polys) {
    s += `<path d="${toSvgPath(p)}" fill="${stroke}" stroke="none" />`;
  }
  for (const c of layout.circles || []) {
    s += `<circle cx="${c.c.x}" cy="${-c.c
      .y}" r="${c.r}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }
  for (const l of layout.lines) {
    const w = toCoord(l.widthPx > 0 ? l.widthPx : 1);
    s += `<line x1="${l.x1}" y1="${-l.y1}" x2="${l.x2}" y2="${-l.y2}"` +
      ` stroke="${stroke}" stroke-width="${w}" stroke-linecap="butt"` +
      ` stroke-linejoin="miter" stroke-miterlimit="2" />`;
  }
  for (const t of layout.texts) {
    s += svgLabel(t, fontSize, fontFamily, stroke);
  }
  s += `</svg>`;
  return s;
}
