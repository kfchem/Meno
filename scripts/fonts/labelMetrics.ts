/**
 * Writes the metrics a label is placed and cleared by - how far each
 * printable ASCII character advances the pen, and the convex outline of its
 * ink - for one font file, as a module in src/lib/chem/fonts/.
 *
 *   npx tsx scripts/fonts/labelMetrics.ts <font.ttf|otf> <ExportName> "<Family>" > src/lib/chem/fonts/<name>.ts
 *
 * The outline is the one the app itself works out for a font it reads
 * (src/lib/chem/glyphHull.ts): curves followed in eight steps, the hull
 * eased by dropping corners that stand less than 15 units of a 2048-unit
 * em off their neighbours' line.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
// the ES build: the package's main entry is a UMD bundle node cannot import by name
import { parse } from "opentype.js/dist/opentype.mjs";
import {
  convexHull,
  easeHull,
  HULL_TOLERANCE_EM,
  pathPoints,
} from "../../src/lib/chem/glyphHull";

const [file, exportName, family] = process.argv.slice(2);
if (!file || !exportName || !family) {
  console.error("usage: labelMetrics.ts <font file> <ExportName> <Family>");
  process.exit(1);
}
const bytes = readFileSync(file);
const font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const upem = font.unitsPerEm;

const advances: number[] = [];
const hulls: string[] = [];
for (let code = 0x20; code <= 0x7e; code++) {
  const ch = String.fromCharCode(code);
  const glyph = font.charToGlyph(ch);
  advances.push(Math.round(glyph.advanceWidth ?? 0));
  if (ch === " ") continue;
  // getPath draws at one em, y down; the hull is wanted in font units, y up
  const points = pathPoints(glyph.getPath(0, 0, 1).commands, upem);
  const h = easeHull(convexHull(points), HULL_TOLERANCE_EM * upem);
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
