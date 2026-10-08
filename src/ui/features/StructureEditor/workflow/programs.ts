/**
 * Steps a plugin's program does (docs/WORKFLOWS.md, *What changes in the
 * contract*): what the plugin is given of each entry, its jobs as it
 * prepares them, what a job gave as it reads it back, and what the step
 * says it did. Plain data, checked on the way in, whoever sent it; the
 * runs themselves are the store's (store/slices/workflowSlice).
 */
import { knownOf, type WrittenMolecule } from "../../../../lib/io/writers";
import { calcOf, OUTPUT_SCHEMA, type CalcSource, type ReaderOutput } from "../../../../lib/calc/output";
import type { JobFile } from "../../../../lib/jobs";
import type { SetEntry } from "./entries";
import type { Worked } from "./run";
import type { StepKind } from "./kinds";

/**
 * An entry as a plugin is given it: Meno's plain data - its atoms, each its
 * element, place in ångströms, charge and radical; its bonds by index with
 * their orders; its name - and its charge and spin multiplicity, as Export
 * reads them (lib/io/writers `knownOf`).
 */
export type PluginEntry = WrittenMolecule & { charge: number; multiplicity: number };

export function pluginEntry(e: SetEntry): PluginEntry {
  const molecule: WrittenMolecule = {
    ...(e.name ? { name: e.name } : {}),
    atoms: e.atoms.map((a, i) => ({
      el: a.el,
      x: e.xyz[3 * i],
      y: e.xyz[3 * i + 1],
      z: e.xyz[3 * i + 2],
      ...(a.charge ? { charge: a.charge } : {}),
      ...(a.radical ? { radical: a.radical } : {}),
      ...(a.isotope ? { isotope: a.isotope } : {}),
    })),
    bonds: e.bonds.map((b) => ({ a1: b.a1, a2: b.a2, order: b.order })),
  };
  const known = knownOf(molecule);
  return { ...molecule, charge: Number(known.charge), multiplicity: Number(known.multiplicity) };
}

/** A job as a plugin prepares it: the entries it is for, by their place; its program, by name; its arguments; its input files; and the files it reads back. */
export type Prepared = { entries: number[]; program: string; args: string[]; files: JobFile[]; reads: string[] };

/** A file's name in a job's folder: inside it, never above it. */
const inside = (name: string) => !!name && name.length <= 200 && !name.startsWith("/") && !/^[A-Za-z]:/.test(name) && name.split(/[\\/]/).every((p) => p && p !== "." && p !== "..");
const texts = (v: unknown, most: number) => (Array.isArray(v) && v.length <= most && v.every((t) => typeof t === "string") ? (v as string[]) : null);

/**
 * The jobs a plugin prepared for `count` entries, checked: each its entries
 * among those, every entry in one; its program a name; its files inside its
 * folder. Why not, where they are not.
 */
export function readPrepared(raw: unknown, count: number): Prepared[] | string {
  const jobs = (raw as { jobs?: unknown } | null)?.jobs;
  if (!Array.isArray(jobs) || !jobs.length) return "It prepared no job";
  const out: Prepared[] = [];
  const covered = new Set<number>();
  for (const j of jobs) {
    const r = j as Record<string, unknown> | null;
    const entries = Array.isArray(r?.entries) && r.entries.every((i) => Number.isInteger(i) && i >= 0 && i < count) ? (r.entries as number[]) : null;
    const program = typeof r?.program === "string" && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/.test(r.program) ? r.program : null;
    const args = texts(r?.args, 200);
    const reads = texts(r?.reads ?? [], 50);
    const files = Array.isArray(r?.files)
      ? r.files.flatMap((f: unknown) => {
          const g = f as { name?: unknown; text?: unknown } | null;
          return typeof g?.name === "string" && inside(g.name) && typeof g.text === "string" ? [{ name: g.name, text: g.text }] : [];
        })
      : [];
    if (!entries?.length || !program || !args || !reads || reads.some((n) => !inside(n)) || files.length !== (r?.files as unknown[]).length) return "It prepared a job Meno cannot run";
    entries.forEach((i) => covered.add(i));
    out.push({ entries: [...entries], program, args: [...args], files, reads: [...reads] });
  }
  if (covered.size !== count) return "It prepared no job for some of what came in";
  return out;
}

/** What a plugin read back of a job: an output for each of its entries, in Meno's own form; or why the job did not give one. */
export function readCollected(raw: unknown, count: number): ReaderOutput[] | { why: string } {
  const r = raw as { outputs?: unknown; why?: unknown } | null;
  if (typeof r?.why === "string") return { why: r.why.trim().slice(0, 300) || "It did not say why" };
  if (!Array.isArray(r?.outputs) || r.outputs.length !== count) return { why: "It read back nothing for it" };
  const outs = r.outputs as ReaderOutput[];
  for (const o of outs) {
    if (o?.schema != null && o.schema !== OUTPUT_SCHEMA) return { why: "It read it back in a form this Meno does not read" };
    if (!Array.isArray(o?.atoms) || !Array.isArray(o.frames) || !o.frames.some((f) => Array.isArray(f) && f.length === 3 * o.atoms.length)) return { why: "It read back no geometry" };
  }
  return outs;
}

/**
 * An entry as a job worked it out (lib/calc/output): its last geometry and
 * energy - an optimisation's path before it, kept where the step is
 * *Optimise* - and what the calculation says of it, read by `readers` from
 * the output kept as `source`. Why not, where what came back is not the
 * molecule that went.
 */
export function workedOf(kind: StepKind, entry: SetEntry, out: ReaderOutput, readers: readonly string[], source?: CalcSource): Worked | string {
  const n = entry.atoms.length;
  if (out.atoms.length !== n || out.atoms.some((el, i) => el !== entry.atoms[i].el)) return "What came back is not the molecule that went";
  const frames = out.frames.filter((f) => f.length === 3 * n && f.every(Number.isFinite));
  if (!frames.length) return "It read back no geometry";
  const energies = out.energies?.length === frames.length && out.energies.every(Number.isFinite) ? out.energies : undefined;
  const last = frames[frames.length - 1];
  const path = kind === "optimise" && frames.length > 1 ? frames.slice(0, -1) : undefined;
  const calc = calcOf(out, readers, source);
  return {
    ...entry,
    xyz: [...last],
    ...(energies ? { energy: energies[energies.length - 1] } : {}),
    ...(path ? { path, ...(energies ? { pathEnergies: energies.slice(0, -1) } : {}) } : {}),
    calc,
  };
}

/** How long, as a clock says it: 0:42, 12:03, 1:02:03. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** An energy in hartrees as a card says it: −42.10871 Eh. */
export const hartrees = (e: number) => `${e < 0 ? "−" : ""}${Math.abs(e).toFixed(5)} Eh`;

/** What a step that ran jobs says it did: how long, and the number it is for - its entry's energy, or how many came out of how many. */
export function doneSaid(worked: readonly Worked[], total: number, took: number): string {
  if (total === 1 && worked.length === 1 && worked[0].energy != null) return `${clock(took)} · ${hartrees(worked[0].energy)}`;
  return `${clock(took)} · ${worked.length} of ${total}`;
}
