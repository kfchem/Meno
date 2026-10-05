/**
 * The reader plugins Meno knows of, and the kinds of output they read
 * (docs/WORKSPACE.md, stage 3). Meno's core knows no program's format: a
 * kind of output is told by what its file starts with, as the list below
 * says, and is read by a reader running in a Python environment of its
 * own - or one that comes with Meno, for a file as plain as a cube. Which
 * readers there are is Meno's own list for now; a list fetched online would
 * need a way to trust it, and comes later.
 *
 * Readers are alike: every one added that reads a kind of output reads it,
 * and what each finds is kept, its own. Where two read the same molecule,
 * the one chosen for that kind gives what Meno keeps one of - the
 * geometries, what the calculation was - and its findings come first; or
 * else the first, in Meno's order.
 */
import { CUBE_MARK } from "./cube";

/** A kind of calculation output: one program's, and how its file is told. */
export type OutputKind = {
  id: string;
  /** What it is called, in Settings and in messages: "ORCA output". */
  name: string;
  /** The program, as a molecule read from it names it. */
  program: string;
  /** The file names it goes by, lower case, with their dot. */
  extensions: readonly string[];
  /** What the start of such a file says, one of them at least. */
  marks: readonly RegExp[];
};

type ReaderBase = {
  id: string;
  name: string;
  /** The version its environment's lock pins; or a reader that comes with Meno, Meno's own. */
  version: string;
  /** One line on what it is. */
  description: string;
  licence: string;
  homepage: string;
  /** The kinds of output it reads, by id, as it reads them best first. */
  reads: readonly string[];
};
/** A reader plugin: what it is, what it reads, and what it runs - a worker in a Python environment of its own. */
export type PythonReader = ReaderBase & {
  builtin?: undefined;
  /** Its Python environment's profile, lock and worker, among Meno's resources. */
  profile: `reader-${string}`;
  lock: string;
  worker: string;
};
/**
 * A reader that comes with Meno: nothing to add or take away, nothing
 * downloaded - but read under the plugins' contract all the same, and as
 * easily taken out (lib/calc/builtin).
 */
export type BuiltinReader = ReaderBase & { builtin: true };
export type ReaderPlugin = PythonReader | BuiltinReader;

/** How much of a file's start is looked at to tell what kind of output it is. */
export const MARK_REACH = 64 * 1024;

export const OUTPUT_KINDS: readonly OutputKind[] = [
  {
    id: "cube",
    name: "Cube file",
    program: "the program",
    extensions: [".cube", ".cub"],
    marks: [CUBE_MARK],
  },
  {
    id: "orca",
    name: "ORCA output",
    program: "ORCA",
    extensions: [".out", ".log"],
    marks: [/\*\s+O\s{3}R\s{3}C\s{3}A\s+\*/],
  },
  {
    id: "gaussian",
    name: "Gaussian output",
    program: "Gaussian",
    extensions: [".log", ".out"],
    marks: [/^\s*Entering Gaussian System/m],
  },
  {
    id: "gaussian-fchk",
    name: "Gaussian formatted checkpoint",
    program: "Gaussian",
    extensions: [".fchk", ".fch"],
    marks: [/^Number of atoms\s+I\s+\d+/m],
  },
  {
    id: "xtb",
    name: "xTB output",
    program: "xTB",
    extensions: [".out", ".log"],
    marks: [/\|\s+x T B\s+\|/, /^\s*\*\s*xtb version\s/m],
  },
];

export const READER_PLUGINS: readonly ReaderPlugin[] = [
  {
    id: "cclib",
    name: "cclib",
    version: "1.9rc1",
    description: "Reads the output of ORCA, Gaussian, xTB and other programs.",
    licence: "BSD-3-Clause",
    homepage: "https://cclib.github.io",
    reads: ["orca", "gaussian", "gaussian-fchk", "xtb"],
    profile: "reader-cclib",
    lock: "resources/py/requirements.reader-cclib.lock",
    worker: "resources/workers/reader_cclib.py",
  },
  {
    id: "cube",
    name: "Cube files",
    builtin: true,
    version: "",
    description: "Reads cube files: a molecule, with its orbitals or densities on a grid.",
    licence: "Comes with Meno",
    homepage: "",
    reads: ["cube"],
  },
];

/**
 * The kind of output a file is, by what its start says - not by its name: a
 * program's output goes by many - or null, none Meno knows.
 */
export function outputKindOf(text: string, kinds: readonly OutputKind[] = OUTPUT_KINDS): OutputKind | null {
  const start = text.slice(0, MARK_REACH);
  return kinds.find((k) => k.marks.some((m) => m.test(start))) ?? null;
}

/** The file names Meno opens as calculation output: every kind's, with their dot. */
export function outputExtensions(kinds: readonly OutputKind[] = OUTPUT_KINDS): string[] {
  return [...new Set(kinds.flatMap((k) => k.extensions))];
}

/** The readers that read a kind of output, in Meno's order. */
export function readersOf(kind: string, plugins: readonly ReaderPlugin[] = READER_PLUGINS): ReaderPlugin[] {
  return plugins.filter((p) => p.reads.includes(kind));
}

/**
 * The readers added that read a kind of output, the one whose finding
 * counts where they find the same thing first: the one chosen for it,
 * where it is added; then the rest, in Meno's order.
 */
export function readersFor(
  kind: string,
  added: ReadonlySet<string>,
  chosen: Readonly<Record<string, string>>,
  plugins: readonly ReaderPlugin[] = READER_PLUGINS,
): ReaderPlugin[] {
  const can = readersOf(kind, plugins).filter((p) => added.has(p.id));
  const first = can.find((p) => p.id === chosen[kind]);
  return first ? [first, ...can.filter((p) => p !== first)] : can;
}

/** The reader whose finding counts first for a kind of output (`readersFor`); none, where no reader added reads it. */
export function readerFor(
  kind: string,
  added: ReadonlySet<string>,
  chosen: Readonly<Record<string, string>>,
  plugins: readonly ReaderPlugin[] = READER_PLUGINS,
): ReaderPlugin | null {
  return readersFor(kind, added, chosen, plugins)[0] ?? null;
}
