/**
 * The measurement (./cases), run in the app as it is built: each case on
 * the page and in a web worker, five times after a first run that is not
 * counted. For each run it records two things:
 * - how long until the result is in hand;
 * - the longest the page went without a frame meanwhile.
 * Started when the app's data folder holds `bench-request`. It writes
 * `bench.json` there, and takes the request away.
 */
import { BaseDirectory, exists, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { runCase, type CaseId } from "./cases";
import sampleSdf from "../samples/cholesterol.sdf?raw";
import sampleXyz from "../samples/cholesterol.xyz?raw";

const RUNS = 5;

/** Each case's file: a small molfile as from a paste, an SDF of 1000 records, an XYZ file of 2000 frames, a cube of 80³ points. */
function inputs(): Record<CaseId, string> {
  const record = sampleSdf.replace(/\$\$\$\$[\s\S]*$/, "").trimEnd() + "\n$$$$\n";
  const frame = sampleXyz.trimEnd() + "\n";
  return {
    mol: record,
    sdf: record.repeat(1000),
    xyz: frame.repeat(2000),
    cube: cubeText(80),
  };
}

function cubeText(n: number): string {
  const lines = ["bench", "a grid of n^3 points", "    1    0.000000    0.000000    0.000000", `  ${n}    0.200000    0.000000    0.000000`, `  ${n}    0.000000    0.200000    0.000000`, `  ${n}    0.000000    0.000000    0.200000`, "    8    8.000000    8.000000    8.000000    8.000000"];
  let row: string[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        row.push(Math.exp(-((i - n / 2) ** 2 + (j - n / 2) ** 2 + (k - n / 2) ** 2) / 50).toExponential(5).padStart(13));
        if (row.length === 6) {
          lines.push(row.join(""));
          row = [];
        }
      }
      if (row.length) {
        lines.push(row.join(""));
        row = [];
      }
    }
  return lines.join("\n") + "\n";
}

/** The longest gap between frames while `work` runs - two frames either side, so that a gap it makes is seen. */
async function longestGap(work: () => Promise<void>): Promise<number> {
  let last = performance.now();
  let most = 0;
  let on = true;
  const tick = (t: number) => {
    most = Math.max(most, t - last);
    last = t;
    if (on) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const frames = (n: number) => new Promise<void>((r) => {
    let k = 0;
    const f = () => (++k >= n ? r() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  });
  await frames(2);
  most = 0;
  await work();
  await frames(2);
  on = false;
  return most;
}

let worker: Worker | null = null;
let next = 0;
type Where = "page" | "worker" | "worker-json" | "worker-buffer";

function inWorker(id: CaseId, text: string, where: Where): Promise<{ work: number }> {
  worker ??= new Worker(new URL("./benchWorker.ts", import.meta.url), { type: "module" });
  const w = worker;
  const ask = ++next;
  return new Promise((resolve) => {
    const on = (e: MessageEvent<{ id: number; work: number; json?: string }>) => {
      if (e.data.id !== ask) return;
      w.removeEventListener("message", on);
      // (JSON text is read on the page: that is the page's to pay for)
      if (e.data.json != null) JSON.parse(e.data.json);
      resolve({ work: e.data.work });
    };
    w.addEventListener("message", on);
    const form = where === "worker-json" ? "json" : where === "worker-buffer" ? "buffer" : "objects";
    w.postMessage({ id: ask, case: id, text, form });
  });
}

type Run = { ms: number; gap: number; work?: number };
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function measure(id: CaseId, text: string, where: Where): Promise<Run[]> {
  const runs: Run[] = [];
  for (let i = 0; i <= RUNS; i++) {
    let ms = 0;
    let work: number | undefined;
    const gap = await longestGap(async () => {
      const t0 = performance.now();
      if (where === "page") runCase(id, text);
      else work = (await inWorker(id, text, where)).work;
      ms = performance.now() - t0;
    });
    if (i > 0) runs.push({ ms, gap, ...(work != null ? { work } : {}) });
  }
  return runs;
}

/** Runs the measurement if it was asked for. */
export async function benchIfAsked(): Promise<void> {
  if (!(await exists("bench-request", { baseDir: BaseDirectory.AppData }).catch(() => false))) return;
  await remove("bench-request", { baseDir: BaseDirectory.AppData }).catch(() => {});
  const files = inputs();
  const out: Record<string, unknown> = { userAgent: navigator.userAgent, at: new Date().toISOString(), sizes: {} };
  for (const id of Object.keys(files) as CaseId[]) {
    (out.sizes as Record<string, number>)[id] = files[id].length;
    const ways: Where[] = ["page", "worker", "worker-json", ...(id === "xyz" ? (["worker-buffer"] as const) : [])];
    for (const where of ways) {
      const runs = await measure(id, files[id], where);
      out[`${id}:${where}`] = {
        ms: median(runs.map((r) => r.ms)),
        gap: median(runs.map((r) => r.gap)),
        ...(where !== "page" ? { work: median(runs.map((r) => r.work ?? 0)) } : {}),
        runs,
      };
    }
  }
  await writeTextFile("bench.json", JSON.stringify(out, null, 2), { baseDir: BaseDirectory.AppData });
}
