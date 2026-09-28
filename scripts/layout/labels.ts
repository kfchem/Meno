/**
 * Every molecule as Meno lays it out, drawn by the drawing code, checked
 * for a label's H that runs into something: another label (side by side
 * with less than a space between them - OH O reads as one word - or one
 * over the other touching), or a bond. The metric only estimates where an
 * H is set; this measures the letters themselves.
 *
 *   npm run layout-labels                          # every molecule
 *   npm run layout-labels -- --only=Paclitaxel     # just those (names as they start)
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTextLabels, labelHulls, labelSetOf, type Atom, type Bond } from "../../src/lib/chem/layout2d";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "../../src/lib/chem/acs";
import { layout2D, type LayoutInput } from "../../src/lib/layout/engine";

const here = dirname(fileURLToPath(import.meta.url));
const basePath = resolve(here, "../../.layout/baselines.json");
if (!existsSync(basePath)) {
  console.error("No baselines: run scripts/layout/baselines.py in the chem environment first.");
  process.exit(1);
}
const molecules: { name: string; graph: LayoutInput }[] = JSON.parse(readFileSync(basePath, "utf8")).molecules;
const only = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice(7)
  .split(",")
  .map((s) => s.trim().toLowerCase());

type Box = { l: number; r: number; b: number; t: number };
const boxOf = (pts: readonly { x: number; y: number }[]): Box => ({
  l: Math.min(...pts.map((p) => p.x)),
  r: Math.max(...pts.map((p) => p.x)),
  b: Math.min(...pts.map((p) => p.y)),
  t: Math.max(...pts.map((p) => p.y)),
});

let total = 0;
for (const m of molecules) {
  if (only && !only.some((o) => m.name.toLowerCase().startsWith(o))) continue;
  const g = m.graph;
  const out = layout2D(g);
  // the molecule as drawn: with the H's the layout adds to show stereo
  const els = g.atoms.map((a) => a.el);
  const x = [...out.x];
  const y = [...out.y];
  const pairs = g.bonds.map((b) => [b.a, b.b, b.order] as [number, number, number]);
  for (const h of out.hydrogens) {
    els.push("H");
    x.push(h.at.x);
    y.push(h.at.y);
    pairs.push([h.on, els.length - 1, 1]);
  }
  const lengths = pairs.map(([a, b]) => Math.hypot(x[a] - x[b], y[a] - y[b])).sort((p, q) => p - q);
  const k = NOMINAL_BOND_LENGTH / (lengths[lengths.length >> 1] || 1);
  const atoms: Atom[] = els.map((el, i) => ({ id: i, x: x[i] * k, y: y[i] * k, el }));
  const bonds: Bond[] = pairs.map(([a, b, order]) => ({ a1: a, a2: b, order: order as 1 | 2 | 3, stereo: "none" }));
  const opts = acsWorldOptions(atoms, bonds, { units: "world" });
  const font = opts.fontPx;
  const set = labelSetOf(opts);
  const labels = buildTextLabels(atoms, opts, bonds).map((t) => {
    const hulls = labelHulls(t, font, set).map((hull) => hull.map((p) => ({ x: p.x + t.x, y: p.y + t.y })));
    // the letters, and which are the hydrogens' (the runs off the symbol)
    const letters: { box: Box; h: boolean }[] = [];
    let i = 0;
    (t.runs ?? []).forEach((run, ri) => {
      for (const _ of run.text) {
        if (i < hulls.length) letters.push({ box: boxOf(hulls[i++]), h: ri !== (t.anchorRun ?? 0) });
      }
    });
    return { t, letters };
  });
  const found: string[] = [];
  const space = 0.3 * font;
  const sliver = 0.08 * font;
  const meet = (p: Box, q: Box) => p.l < q.r + space && q.l < p.r + space && p.b < q.t + sliver && q.b < p.t + sliver;
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const [p, q] = [labels[i], labels[j]];
      if (!p.letters.some((l) => l.h) && !q.letters.some((l) => l.h)) continue;
      const hit = p.letters.some((a) => q.letters.some((b) => (a.h || b.h) && meet(a.box, b.box)));
      if (hit) found.push(`${p.t.text}@${p.t.atom} ~ ${q.t.text}@${q.t.atom}`);
    }
  }
  // an H on a bond not its own
  for (const { t, letters } of labels) {
    for (const { box, h } of letters) {
      if (!h) continue;
      for (const b of bonds) {
        if (b.a1 === t.atom || b.a2 === t.atom) continue;
        const [p, q] = [atoms[b.a1], atoms[b.a2]];
        for (let s = 0; s <= 20; s++) {
          const px = p.x + ((q.x - p.x) * s) / 20;
          const py = p.y + ((q.y - p.y) * s) / 20;
          if (px > box.l && px < box.r && py > box.b && py < box.t) {
            found.push(`${t.text}@${t.atom} on bond ${b.a1}-${b.a2}`);
            break;
          }
        }
      }
    }
  }
  if (found.length) {
    total += found.length;
    console.log(`${m.name}: ${[...new Set(found)].join("; ")}`);
  }
}
console.log(`${total} place${total === 1 ? "" : "s"} where a label's H runs into something`);
