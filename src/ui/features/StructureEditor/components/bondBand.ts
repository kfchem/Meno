/**
 * The bands that light a bond from behind, as outlines - the highlight under
 * the pointer (HoverOverlay2D) and the selection's shading (Selection2D).
 * Drawn behind the bond, each has to reach past whatever the bond draws.
 */
import type { BondReach } from "../../../../lib/chem/layout2d";

type P = { x: number; y: number };

/** The convex hull of `pts`, anticlockwise (monotone chain). */
export function hull(pts: P[]): P[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: P[]) => {
    const out: P[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(s), ...half([...s].reverse())];
}

/**
 * The highlight round a bond from `p` to `q`: a band whose ends are rounded,
 * each end as wide as the drawing reaches there (`reach`) and `margin` more,
 * all of it `scale` of that - so a wedge's band widens with the wedge, and a
 * double bond's takes in its second line. Each end's round sits where a plain
 * bond's does, `ext` past the atom at its far side, so a plain bond's band is
 * as it always was. Points in the drawing's coordinates.
 */
export function bandAround(p: P, q: P, reach: BondReach, margin: number, plainHalf: number, ext: number, scale: number): P[] {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const u = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
  const n = { x: -u.y, y: u.x };
  const ends = [
    { at: p, out: { x: -u.x, y: -u.y }, left: reach.left1, right: reach.right1 },
    { at: q, out: u, left: reach.left2, right: reach.right2 },
  ];
  const pts: P[] = [];
  for (const e of ends) {
    const r = scale * ((e.left + e.right) / 2 + margin);
    const across = (scale * (e.left - e.right)) / 2;
    const back = ext - plainHalf;
    const c = {
      x: e.at.x + e.out.x * back + n.x * across,
      y: e.at.y + e.out.y * back + n.y * across,
    };
    for (let i = 0; i < 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      pts.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) });
    }
  }
  return hull(pts);
}

/**
 * The selection's shading along a bond from `p` to `q`: a band that ends
 * square at either atom, where the atom's own shading rounds it off, each end
 * as wide as the drawing reaches there (`reach`) and `margin` more - so a
 * plain bond's band is as it always was, a wedge's widens to its broad end
 * and a double bond's takes in its second line. Four corners, anticlockwise,
 * in the drawing's coordinates.
 */
export function squareBand(p: P, q: P, reach: BondReach, margin: number): P[] {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const n = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
  const at = (c: P, s: number) => ({ x: c.x + n.x * s, y: c.y + n.y * s });
  return [
    at(p, -(reach.right1 + margin)),
    at(q, -(reach.right2 + margin)),
    at(q, reach.left2 + margin),
    at(p, reach.left1 + margin),
  ];
}
