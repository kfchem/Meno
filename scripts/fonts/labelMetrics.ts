/**
 * Writes the metrics a label is placed and cleared by - how far each
 * printable ASCII character advances the pen, and the convex outline of its
 * ink - for one font file, as a module in src/lib/chem/fonts/.
 *
 *   npx tsx scripts/fonts/labelMetrics.ts <font.ttf|otf> <ExportName> "<Family>" > src/lib/chem/fonts/<name>.ts
 *
 * Curves are followed in eight steps each; the hull is then eased to fewer
 * sides by dropping any corner that stands less than 15 font units (for a
 * 1000-unit em; scaled for others) off the line between its neighbours,
 * which cuts into the ink by no more than that.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
// the ES build: the package's main entry is a UMD bundle node cannot import by name
import { parse, type PathCommand } from "opentype.js/dist/opentype.mjs";

type P = { x: number; y: number };

const [file, exportName, family] = process.argv.slice(2);
if (!file || !exportName || !family) {
  console.error("usage: labelMetrics.ts <font file> <ExportName> <Family>");
  process.exit(1);
}
const bytes = readFileSync(file);
const font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const upem = font.unitsPerEm;
const tolerance = (15 * upem) / 2048;

/** The outline's points, curves followed in eight steps, y up, in font units. */
function outline(commands: PathCommand[]): P[] {
  const pts: P[] = [];
  let cur: P = { x: 0, y: 0 };
  let start: P = cur;
  // getPath draws y down at a size of one em; turn it back into font units, y up.
  const u = (x: number, y: number): P => ({ x: x * upem, y: -y * upem });
  for (const c of commands) {
    if (c.type === "M") {
      cur = start = u(c.x, c.y);
    } else if (c.type === "L") {
      pts.push(cur);
      cur = u(c.x, c.y);
    } else if (c.type === "Q") {
      const q = u(c.x1, c.y1);
      const r = u(c.x, c.y);
      for (let s = 0; s < 8; s++) {
        const t = s / 8;
        const a = (1 - t) ** 2, b = 2 * (1 - t) * t, d = t * t;
        pts.push({ x: a * cur.x + b * q.x + d * r.x, y: a * cur.y + b * q.y + d * r.y });
      }
      cur = r;
    } else if (c.type === "C") {
      const q1 = u(c.x1, c.y1);
      const q2 = u(c.x2, c.y2);
      const r = u(c.x, c.y);
      for (let s = 0; s < 8; s++) {
        const t = s / 8;
        const a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, d = 3 * (1 - t) * t * t, e = t ** 3;
        pts.push({
          x: a * cur.x + b * q1.x + d * q2.x + e * r.x,
          y: a * cur.y + b * q1.y + d * q2.y + e * r.y,
        });
      }
      cur = r;
    } else {
      pts.push(cur);
      cur = start;
    }
  }
  pts.push(cur);
  return pts;
}

/** The convex hull, anticlockwise, from the lowest point (leftmost of those). */
function hull(points: P[]): P[] {
  const key = (p: P) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  const uniq = [...new Map(points.map((p) => [key(p), p])).values()];
  uniq.sort((a, b) => a.x - b.x || a.y - b.y);
  if (uniq.length < 3) return uniq;
  const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: P[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: P[] = [];
  for (const p of [...uniq].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const h = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  let low = 0;
  h.forEach((p, i) => {
    if (p.y < h[low].y || (p.y === h[low].y && p.x < h[low].x)) low = i;
  });
  return [...h.slice(low), ...h.slice(0, low)];
}

/** Drops the corners that stand least off their neighbours' line, while any stands less than the tolerance. */
function ease(h: P[]): P[] {
  const out = [...h];
  while (out.length > 4) {
    let best = -1;
    let bestD = tolerance;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      const L = Math.hypot(c.x - a.x, c.y - a.y);
      const d = L ? Math.abs((c.x - a.x) * (a.y - b.y) - (a.x - b.x) * (c.y - a.y)) / L : 0;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) break;
    out.splice(best, 1);
  }
  return out;
}

const advances: number[] = [];
const hulls: string[] = [];
for (let code = 0x20; code <= 0x7e; code++) {
  const ch = String.fromCharCode(code);
  const glyph = font.charToGlyph(ch);
  advances.push(Math.round(glyph.advanceWidth ?? 0));
  if (ch === " ") continue;
  const h = ease(hull(outline(glyph.getPath(0, 0, 1).commands)));
  if (h.length === 0) continue;
  const flat = h.flatMap((p) => [Math.round(p.x), Math.round(p.y)]);
  hulls.push(`    ${JSON.stringify(ch)}: [${flat.join(", ")}],`);
}

const capHeight = font.tables.os2?.sCapHeight ?? Math.round(upem * 0.7);
const rows: string[] = [];
for (let i = 0; i < advances.length; i += 12) rows.push(`    ${advances.slice(i, i + 12).join(", ")},`);

process.stdout.write(`import type { LabelFontMetrics } from "../labelFonts";

/**
 * ${family}: how far each printable ASCII character advances the pen, and
 * the convex outline of its ink, in font units of ${upem} to the em.
 *
 * Generated from ${basename(file)} by scripts/fonts/labelMetrics.ts.
 */
export const ${exportName}: LabelFontMetrics = {
  family: ${JSON.stringify(family)},
  unitsPerEm: ${upem},
  capHeight: ${capHeight},
  advances: [
${rows.join("\n")}
  ],
  hulls: {
${hulls.join("\n")}
  },
};
`);
