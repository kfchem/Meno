/**
 * What a change to the engine did to the sheet: Meno's scores in two runs
 * of the benchmark, molecule by molecule, and the measures that moved.
 * Keep a copy of .layout/scores.json from before the change, then:
 *
 *   npm run layout-compare -- before.json                 # against .layout/scores.json
 *   npm run layout-compare -- before.json after.json
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreParts, type LayoutMetrics } from "../../src/lib/layout/metrics";

const here = dirname(fileURLToPath(import.meta.url));
const [beforePath, afterPath = resolve(here, "../../.layout/scores.json")] = process.argv.slice(2);
if (!beforePath) {
  console.error("Usage: npm run layout-compare -- before.json [after.json]");
  process.exit(1);
}
type Scores = Record<string, Record<string, LayoutMetrics | undefined>>;
const before: Scores = JSON.parse(readFileSync(beforePath, "utf8"));
const after: Scores = JSON.parse(readFileSync(afterPath, "utf8"));

let better = 0;
let worse = 0;
for (const [name, engines] of Object.entries(after)) {
  const a = before[name]?.Meno;
  const b = engines.Meno;
  if (!a || !b || Math.abs(a.score - b.score) < 0.01) continue;
  if (b.score < a.score) better++;
  else worse++;
  const pa = scoreParts(a);
  const pb = scoreParts(b);
  const moved = (Object.keys(pb) as (keyof typeof pb)[])
    .map((k) => [k, pb[k] - (pa[k] ?? 0)] as const)
    .filter(([, d]) => Math.abs(d) >= 0.05)
    .sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))
    .map(([k, d]) => `${k} ${d > 0 ? "+" : ""}${d.toFixed(2)}`);
  console.log(`${name.padEnd(24)} ${a.score.toFixed(2).padStart(6)} -> ${b.score.toFixed(2).padStart(6)}   ${moved.join(", ")}`);
}
const mean = (s: Scores) => {
  const v = Object.values(s)
    .map((e) => e.Meno?.score)
    .filter((x): x is number => x != null);
  return v.reduce((p, q) => p + q, 0) / Math.max(v.length, 1);
};
console.log(`${better} better, ${worse} worse; mean ${mean(before).toFixed(2)} -> ${mean(after).toFixed(2)}`);
