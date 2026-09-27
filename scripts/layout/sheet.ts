/**
 * The layout benchmark as one page: every molecule in molecules.json, its
 * Wikipedia structure beside each layout engine's, all drawn by Meno's own
 * drawing code in ACS 1996, with what layoutMetrics makes of each.
 *
 *   <chem python> scripts/layout/baselines.py   # RDKit's layouts, once
 *   npm run layout-bench                        # writes .layout/index.html
 *   npm run layout-bench -- --open              # and opens it
 *
 * The Wikipedia structures are shown from Wikimedia Commons, with their
 * licence and author; nothing of them is copied here.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  createSVG,
  layoutMolecule,
  wedgeNarrowAtom,
  type Atom,
  type Bond,
} from "../../src/lib/chem/layout2d";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "../../src/lib/chem/acs";
import { layoutMetrics, type LayoutMetrics } from "../../src/lib/layout/metrics";
import type { Molecule } from "./fetch";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const outDir = resolve(root, ".layout");

type Graph = {
  atoms: { el: string; charge: number; hs: number }[];
  bonds: { a: number; b: number; order: number }[];
};
type Laid = {
  /** The molecule as this engine draws it: with the H atoms it adds. */
  graph: Graph;
  x: number[];
  y: number[];
  wedges: { bond: number; narrow: number; stereo: "up" | "down" }[];
  ms: number;
};
type Baseline = {
  name: string;
  graph: Graph;
  layouts: Record<string, Laid>;
};

const ZOOM = 30;

/** A layout drawn by Meno, at Meno's bond length. */
function draw(g: Graph, laid: Laid): string {
  const lengths = g.bonds.map(({ a, b }) =>
    Math.hypot(laid.x[a] - laid.x[b], laid.y[a] - laid.y[b]),
  );
  const sorted = [...lengths].sort((p, q) => p - q);
  const typical = sorted.length ? sorted[sorted.length >> 1] : 1;
  const k = NOMINAL_BOND_LENGTH / (typical || 1);
  const atoms: Atom[] = g.atoms.map((a, i) => ({
    id: i,
    x: laid.x[i] * k,
    y: laid.y[i] * k,
    el: a.el,
  }));
  const degree = new Map<number, number>();
  for (const { a, b } of g.bonds) {
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  const wedge = new Map(laid.wedges.map((w) => [w.bond, w]));
  const bonds: Bond[] = g.bonds.map(({ a, b, order }, i) => {
    const bond: Bond = { a1: a, a2: b, order: order as 1 | 2 | 3, stereo: "none" };
    const w = wedge.get(i);
    if (w) {
      bond.stereo = w.stereo;
      const usual = wedgeNarrowAtom({ ...bond, stereoOrient: "principle" }, degree);
      bond.stereoOrient = usual === w.narrow ? "principle" : "reverse";
    }
    return bond;
  });
  const opts = acsWorldOptions(atoms, bonds, { units: "world", minLinePx: 1.25 });
  return createSVG(layoutMolecule(atoms, bonds, opts, ZOOM), opts);
}

function measure(g: Graph, laid: Laid): LayoutMetrics {
  return layoutMetrics({
    x: laid.x,
    y: laid.y,
    edges: g.bonds.map(({ a, b }) => [a, b] as const),
    orders: g.bonds.map((b) => b.order),
    wedged: laid.wedges.map((w) => w.bond),
    // a label for anything but a neutral carbon
    labelled: g.atoms.map((a) => a.el !== "C" || a.charge !== 0),
  });
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmt = (m: LayoutMetrics) =>
  [
    `score ${m.score.toFixed(1)}`,
    `overlaps ${m.overlaps} · crossings ${m.crossings} · clashes ${m.clashes} · crowded labels ${m.crowdedLabels}`,
    `bonds ±${(m.bondSpread * 100).toFixed(1)}% · angles ${m.angleError.toFixed(1)}° · rings ${m.ringError.toFixed(3)}`,
    `macrocycle angles ${m.macroAngleError.toFixed(1)}° · wedges on rings ${m.ringWedges}`,
  ].join("<br>");

const listed: Molecule[] = JSON.parse(
  readFileSync(resolve(here, "molecules.json"), "utf8"),
).molecules;
const basePath = resolve(outDir, "baselines.json");
if (!existsSync(basePath)) {
  console.error("No baselines: run scripts/layout/baselines.py in the chem environment first.");
  process.exit(1);
}
const baselines = new Map<string, Baseline>(
  (JSON.parse(readFileSync(basePath, "utf8")).molecules as Baseline[]).map((b) => [b.name, b]),
);

const engines = ["CoordGen", "RDKit"];
const totals = new Map<string, { score: number; overlaps: number; crossings: number; n: number }>();
/** Mean score by category, then engine. */
const byCategory = new Map<string, Map<string, { score: number; n: number }>>();
const rows: string[] = [];
let category = "";
for (const m of listed) {
  const base = baselines.get(m.name);
  if (!base) continue;
  if (m.category !== category) {
    category = m.category;
    rows.push(`<h2>${escape(category)}</h2>`);
  }
  const ref = m.reference
    ? `<figure class="ref"><div class="art"><img src="${m.reference.url}" alt="${escape(m.name)} on Wikipedia" loading="lazy"></div>
<figcaption>Wikipedia · <a href="${m.reference.page}">${escape(m.reference.licence)}</a>, ${escape(m.reference.author).slice(0, 60)}</figcaption></figure>`
    : `<figure class="ref"><div class="art empty">no reference</div><figcaption>Wikipedia</figcaption></figure>`;
  const cells = engines.map((e) => {
    const laid = base.layouts[e];
    if (!laid) return "";
    const metrics = measure(laid.graph, laid);
    const cat = byCategory.get(m.category) ?? new Map();
    const c = cat.get(e) ?? { score: 0, n: 0 };
    cat.set(e, { score: c.score + metrics.score, n: c.n + 1 });
    byCategory.set(m.category, cat);
    const t = totals.get(e) ?? { score: 0, overlaps: 0, crossings: 0, n: 0 };
    totals.set(e, {
      score: t.score + metrics.score,
      overlaps: t.overlaps + metrics.overlaps,
      crossings: t.crossings + metrics.crossings,
      n: t.n + 1,
    });
    return `<figure><div class="art">${draw(laid.graph, laid)}</div>
<figcaption><b>${e}</b> · ${laid.ms} ms<br>${fmt(metrics)}</figcaption></figure>`;
  });
  rows.push(`<section><h3>${escape(m.name)} <span class="cid">CID ${m.cid} · ${base.graph.atoms.length} atoms</span></h3>
<div class="row">${ref}${cells.join("")}</div></section>`);
}

const summary = engines
  .map((e) => {
    const t = totals.get(e)!;
    return `<tr><td>${e}</td><td>${(t.score / t.n).toFixed(1)}</td><td>${t.overlaps}</td><td>${t.crossings}</td></tr>`;
  })
  .join("");

const categories = [...byCategory]
  .map(
    ([cat, per]) =>
      `<tr><td>${escape(cat)}</td>${engines
        .map((e) => {
          const c = per.get(e);
          return `<td>${c ? (c.score / c.n).toFixed(1) : ""}</td>`;
        })
        .join("")}</tr>`,
  )
  .join("");

const page = `<!doctype html>
<meta charset="utf-8">
<title>Meno layout benchmark</title>
<style>
  :root { color-scheme: light }
  body { margin: 0 auto; padding: 2rem 1.5rem 4rem; max-width: 1400px; background: #fff; color: #111;
         font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif }
  h1 { font-size: 1.3rem; margin: 0 0 .25rem }
  .lede { color: #555; max-width: 75ch }
  h2 { font-size: 1.1rem; margin: 2.5rem 0 0; padding-top: 1rem; border-top: 2px solid #111 }
  section { border-top: 1px solid #e5e7eb; padding-top: 1rem; margin-top: 1.25rem }
  h3 { font-size: .95rem; margin: 0 0 .5rem }
  .cid { color: #777; font-weight: normal; font-size: 12px }
  .row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem }
  figure { margin: 0; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; background: #fff }
  .art { display: flex; align-items: center; justify-content: center; height: 300px; padding: .5rem }
  .art svg, .art img { max-width: 100%; max-height: 100%; height: auto }
  .art.empty { color: #999 }
  figcaption { border-top: 1px solid #f1f3f5; padding: .35rem .6rem; font-size: 12px; color: #444 }
  table { border-collapse: collapse; margin: 1rem 0 }
  td, th { border: 1px solid #e5e7eb; padding: .25rem .6rem; text-align: right }
  td:first-child, th:first-child { text-align: left }
  @media (max-width: 800px) { .row { grid-template-columns: 1fr } }
</style>
<h1>Meno layout benchmark</h1>
<p class="lede">Each molecule's Wikipedia structure, the reference to draw as well as, beside each layout
engine's, every layout drawn by Meno in ACS 1996. Lower scores are better: overlaps, crossings and atoms
on bonds count most, then uneven bonds, rings off regular and angles off ideal. Written by
<code>npm run layout-bench</code>; nothing here is checked in, and the Wikipedia images are shown from
Wikimedia Commons under the licences given.</p>
<table><tr><th>engine</th><th>mean score</th><th>overlaps</th><th>crossings</th></tr>${summary}</table>
<table><tr><th>mean score by category</th>${engines.map((e) => `<th>${e}</th>`).join("")}</tr>${categories}</table>
${rows.join("\n")}
`;

mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, "index.html");
writeFileSync(out, page);
console.log(`${rows.length} rows -> ${out}`);
for (const e of engines) {
  const t = totals.get(e)!;
  console.log(`${e.padEnd(10)} mean score ${(t.score / t.n).toFixed(1)}, overlaps ${t.overlaps}, crossings ${t.crossings}`);
}
if (process.argv.includes("--open")) {
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", out]]
      : process.platform === "darwin"
        ? ["open", [out]]
        : ["xdg-open", [out]];
  execFileSync(cmd as string, args as string[]);
}
