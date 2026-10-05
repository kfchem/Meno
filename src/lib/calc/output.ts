/**
 * What a reader plugin hands back from a calculation's output, and what a
 * molecule keeps of it (docs/WORKSPACE.md, stage 3). Plain data, the same
 * whichever reader read it and whatever program wrote it.
 */

/** A reader's answer, as its worker writes it (resources/workers/reader_*.py). */
export type ReaderOutput = {
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
  vibrations?: { frequency: number; displacements: number[] | null }[];
  /** Its atoms' partial charges, by scheme (mulliken, lowdin, hirshfeld, ...). */
  charges?: Record<string, number[]>;
};

/**
 * What a molecule keeps of the calculation it was read from, besides its
 * geometries and energies: what the calculation was, which reader read it,
 * and what it found of its vibrations and its atoms' charges.
 */
export type CalcInfo = {
  /** The reader that read it: its id and version, "cclib 1.9rc1". */
  reader: string;
  program?: string;
  version?: string;
  method?: string;
  basis?: string;
  charge?: number;
  multiplicity?: number;
  optimised?: boolean;
  /** Each vibration's frequency, in cm⁻¹ (an imaginary one negative), and its atoms' displacements, x, y, z of each, where given. */
  vibrations?: { frequency: number; displacements?: number[] }[];
  /** Its atoms' partial charges, by scheme, for the last geometry. */
  charges?: Record<string, number[]>;
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

/** What a molecule keeps of an output, read by `reader`. */
export function calcOf(out: ReaderOutput, reader: string): CalcInfo {
  const n = out.atoms.length;
  const vibrations = (out.vibrations ?? [])
    .filter((v) => isNum(v.frequency))
    .map((v) => ({
      frequency: v.frequency,
      ...(Array.isArray(v.displacements) && v.displacements.length === 3 * n && v.displacements.every(isNum)
        ? { displacements: v.displacements }
        : {}),
    }));
  const charges = Object.fromEntries(
    Object.entries(out.charges ?? {}).filter(([, q]) => Array.isArray(q) && q.length === n && q.every(isNum)),
  );
  const said = (k: "program" | "version" | "method" | "basis") => text(out[k]);
  return {
    reader,
    ...(said("program") ? { program: said("program") } : {}),
    ...(said("version") ? { version: said("version") } : {}),
    ...(said("method") ? { method: said("method") } : {}),
    ...(said("basis") ? { basis: said("basis") } : {}),
    ...(Number.isInteger(out.charge) ? { charge: out.charge! } : {}),
    ...(Number.isInteger(out.multiplicity) && out.multiplicity! > 0 ? { multiplicity: out.multiplicity! } : {}),
    ...(typeof out.optimised === "boolean" ? { optimised: out.optimised } : {}),
    ...(vibrations.length ? { vibrations } : {}),
    ...(Object.keys(charges).length ? { charges } : {}),
  };
}

/** A molecule's calculation as a file carries it, where it reads as one for `atoms` atoms; otherwise nothing. */
export function readCalc(given: unknown, atoms: number): CalcInfo | undefined {
  const c = given as Record<string, unknown> | null | undefined;
  if (!c || typeof c !== "object" || typeof c.reader !== "string") return undefined;
  const vibrations = Array.isArray(c.vibrations)
    ? (c.vibrations as { frequency?: unknown; displacements?: unknown }[]).filter((v) => v && isNum(v.frequency))
    : [];
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
      frames: [],
      vibrations: vibrations.map((v) => ({
        frequency: v.frequency as number,
        displacements: Array.isArray(v.displacements) ? (v.displacements as number[]) : null,
      })),
      charges: c.charges && typeof c.charges === "object" && !Array.isArray(c.charges) ? (c.charges as Record<string, number[]>) : undefined,
    },
    c.reader,
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
