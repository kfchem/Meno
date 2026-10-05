/**
 * What a reader plugin hands back from a calculation's output, and what a
 * molecule keeps of it (docs/WORKSPACE.md, stage 3). Plain data, the same
 * whichever reader read it and whatever program wrote it: what Meno does
 * something with in forms of its own - the atoms, their geometries, each
 * one's energy, what the calculation was - and everything else as results,
 * in the one general form (results.ts).
 */
import { readResults, type Result } from "./results";

/** The form of a plugin's answer this Meno reads. */
export const OUTPUT_SCHEMA = 1;

/** A reader's answer, as its worker writes it (resources/workers/reader_*.py). */
export type ReaderOutput = {
  /** The form it is in: `OUTPUT_SCHEMA`, or unsaid. */
  schema?: number;
  program?: string | null;
  version?: string | null;
  method?: string | null;
  basis?: string | null;
  charge?: number | null;
  multiplicity?: number | null;
  /** Its atoms' elements, in the file's order. */
  atoms: string[];
  /** Each geometry it went through - an optimisation's steps - in ångströms: x, y, z of every atom. */
  frames: number[][];
  /** Each geometry's energy, in hartrees, where every one has one. */
  energies?: number[] | null;
  /** Whether an optimisation came to an end, where it was one. */
  optimised?: boolean | null;
  /** Everything else it found, in the general form (results.ts) - read, and those that do not read as results left out. */
  results?: unknown[];
};

/**
 * What a molecule keeps of the calculation it was read from, besides its
 * geometries and energies: what the calculation was, the readers that read
 * it, and its results - every reader's, each kept with the one it came from.
 */
export type CalcInfo = {
  /** The readers that read it, each its name and version: "cclib 1.9rc1". */
  readers: string[];
  program?: string;
  version?: string;
  method?: string;
  basis?: string;
  charge?: number;
  multiplicity?: number;
  optimised?: boolean;
  results?: Result[];
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * The output's geometries as an XYZ file's text, frame by frame: the form
 * Meno reads any molecule in 3D in, so that a calculation's comes in as
 * every other does, its bonds found the same way.
 */
export function xyzOf(out: ReaderOutput): string {
  const n = out.atoms.length;
  return out.frames
    .filter((f) => f.length === 3 * n)
    .map((f, k) => {
      const lines = out.atoms.map((el, i) => `${el} ${f[3 * i]} ${f[3 * i + 1]} ${f[3 * i + 2]}`);
      return [String(n), `frame ${k + 1}`, ...lines].join("\n");
    })
    .join("\n");
}

/** The geometries an output gives for its atoms: those an XYZ file of it has (`xyzOf`). */
export function framesOf(out: ReaderOutput): number {
  return out.frames.filter((f) => f.length === 3 * out.atoms.length).length;
}

/**
 * What a molecule keeps of an output, read by `readers` (each its name and
 * version): its results each kept with the reader it came from - the first,
 * unless it says another.
 */
export function calcOf(out: ReaderOutput, readers: readonly string[]): CalcInfo {
  const results = readResults(out.results, out.atoms.length, framesOf(out), readers[0]);
  const said = (k: "program" | "version" | "method" | "basis") => text(out[k]);
  return {
    readers: [...readers],
    ...(said("program") ? { program: said("program") } : {}),
    ...(said("version") ? { version: said("version") } : {}),
    ...(said("method") ? { method: said("method") } : {}),
    ...(said("basis") ? { basis: said("basis") } : {}),
    ...(Number.isInteger(out.charge) ? { charge: out.charge! } : {}),
    ...(Number.isInteger(out.multiplicity) && out.multiplicity! > 0 ? { multiplicity: out.multiplicity! } : {}),
    ...(typeof out.optimised === "boolean" ? { optimised: out.optimised } : {}),
    ...(results.length ? { results } : {}),
  };
}

/**
 * A molecule's calculation as a file carries it, where it reads as one for
 * `atoms` atoms in `frames` frames; otherwise nothing. Its results are read
 * as a plugin's are, and those that are no longer this molecule's left out.
 */
export function readCalc(given: unknown, atoms: number, frames: number): CalcInfo | undefined {
  const c = given as Record<string, unknown> | null | undefined;
  const readers = Array.isArray(c?.readers) ? c.readers.filter((r): r is string => typeof r === "string" && !!r.trim()) : [];
  if (!c || typeof c !== "object" || !readers.length) return undefined;
  return calcOf(
    {
      program: text(c.program),
      version: text(c.version),
      method: text(c.method),
      basis: text(c.basis),
      charge: isNum(c.charge) ? c.charge : null,
      multiplicity: isNum(c.multiplicity) ? c.multiplicity : null,
      optimised: typeof c.optimised === "boolean" ? c.optimised : null,
      atoms: new Array(atoms).fill(""),
      frames: new Array(frames).fill(new Array(3 * atoms).fill(0)),
      results: Array.isArray(c.results) ? c.results : [],
    },
    readers,
  );
}

/**
 * What the calculation was, in a line: "ORCA 6.0.1 · B3LYP/def2-SVP ·
 * charge 0, singlet". What the output does not say is left out.
 */
export function calcLine(c: CalcInfo): string {
  const program = [c.program, c.version].filter(Boolean).join(" ");
  const method = [c.method, c.basis].filter(Boolean).join("/");
  const state = [
    c.charge != null ? `charge ${c.charge > 0 ? "+" : ""}${c.charge}` : null,
    c.multiplicity != null ? multiplicityName(c.multiplicity) : null,
  ]
    .filter(Boolean)
    .join(", ");
  return [program, method, state].filter(Boolean).join(" · ");
}

/** A multiplicity by name, as a chemist says it: singlet, doublet, ...; past a sextet, by number. */
export function multiplicityName(m: number): string {
  const names = ["singlet", "doublet", "triplet", "quartet", "quintet", "sextet"];
  return names[m - 1] ?? `multiplicity ${m}`;
}
