/**
 * The readers Meno knows of (docs/PLUGINS.md, docs/FILE-IO.md): the plugins
 * on offer, each from its manifest in its folder (lib/plugins/known) - those
 * Meno carries, for now; a list fetched online needs a way to trust it, and
 * comes later - and Meno itself, which reads some kinds under the same
 * contract (./menoReads). The kinds a plugin brings are registered while it
 * is added (lib/io/kinds, ./workers); those of every plugin on offer are
 * looked at only to say which plugin would read a file nothing added reads.
 *
 * A reader is known by its id. What it gave - results, the readers a
 * molecule was read by - keeps the id; its name is looked up only to show
 * it.
 */
import type { Manifest } from "../plugins/manifest";
import { MANIFESTS, PLUGINS_ROOT } from "../plugins/known";
import { MENO_READS } from "./menoReads";
import { kindById, MENO_KINDS, registered, type Kind } from "../io/kinds";

type ReaderBase = {
  id: string;
  name: string;
  /** The version its environment's lock pins; Meno's own, none. */
  version: string;
  /** One line on what it is. */
  description: string;
  licence: string;
  homepage: string;
  /** The kinds it reads, by id. */
  reads: readonly string[];
};
/** A reader plugin: what it is, what it reads, and what it runs - a worker in a Python environment of its own. */
export type PythonReader = ReaderBase & {
  builtin?: undefined;
  /** Its Python environment's profile, and its lock and worker, in its folder among Meno's resources. */
  profile: `reader-${string}`;
  lock: string;
  worker: string;
  /** What makes its environment: uv from PyPI (unsaid), or pixi - its lock a pixi.lock - where it needs conda-forge. */
  env?: "pixi";
};
/** Meno itself, reading what it reads under the readers' contract: nothing to add or take away, nothing downloaded. */
export type MenoReader = ReaderBase & { builtin: true };
export type ReaderPlugin = PythonReader | MenoReader;

const MENO_IDS: ReadonlySet<string> = new Set(Object.values(MENO_KINDS).map((k) => k.id));

/** A plugin, as a reader, from its manifest. */
export const readerOf = (m: Manifest): PythonReader => ({
  id: m.id,
  name: m.name,
  version: m.version,
  description: m.description,
  licence: m.licence,
  homepage: m.homepage,
  // (its own kinds, and Meno's: never another plugin's, which it does not know)
  reads: m.reads.filter((id) => MENO_IDS.has(id) || m.kinds.some((k) => k.id === id)),
  profile: `reader-${m.id}`,
  lock: `${PLUGINS_ROOT}/${m.id}/${m.environment.lock}`,
  worker: `${PLUGINS_ROOT}/${m.id}/${m.worker}`,
  ...(m.environment.maker === "pixi" ? { env: "pixi" as const } : {}),
});

/** The reader plugins Meno knows of, in Meno's order: each that reads something. */
export const READER_PLUGINS: readonly PythonReader[] = MANIFESTS.map(readerOf).filter((p) => p.reads.length);

/** The manifest of a plugin Meno knows of. */
export const manifestOf = (id: string): Manifest | undefined => MANIFESTS.find((m) => m.id === id);

const offered = registered(MANIFESTS);

/**
 * The kinds the plugins on offer bring, added or not, with Meno's own: what
 * a file nothing added reads would be read as, by which plugin - said, so
 * that the plugin can be added. Also the marks refused as they were
 * registered, each of which would have claimed one of Meno's own files.
 */
export const OFFERED = { kinds: offered.kinds as readonly Kind[], refused: offered.refused };

/** The kind of that id: registered, or else one a plugin on offer brings. */
export const anyKindById = (id: string): Kind | undefined => kindById(id) ?? kindById(id, OFFERED.kinds);

/**
 * Meno's own reading, as a reader: what it reads under the contract, in its
 * worker (./menoReads) - RXN, MOL, SD and XYZ files, and the cube - and,
 * besides, its own workspace, which is no reader's to read but Meno's
 * core's (docs/FILE-IO.md, *The line*).
 */
export const MENO: MenoReader = {
  id: "meno",
  name: "Meno",
  version: "",
  description: "",
  licence: "",
  homepage: "",
  reads: [MENO_KINDS.workspace.id, ...Object.keys(MENO_READS)],
  builtin: true,
};

/** Every reader: Meno's own, then the plugins, in Meno's order. */
export const READERS: readonly ReaderPlugin[] = [MENO, ...READER_PLUGINS];

/** The reader of that id. */
export function readerById(id: string, readers: readonly ReaderPlugin[] = READERS): ReaderPlugin | undefined {
  return readers.find((r) => r.id === id);
}

/** A reader's id, from a reader as a molecule keeps it: its id and version, "cclib 1.9rc1"; Meno's own, "meno". */
export function readerIdOfLine(line: string): string {
  return line.split(" ")[0];
}

/** A reader's name, as the chemist knows it, by its id; one Meno does not know, by its id. */
export function readerNameOf(id: string | undefined, readers: readonly ReaderPlugin[] = READERS): string {
  if (!id) return "";
  return readerById(id, readers)?.name ?? id;
}

/** The readers that read a kind, in Meno's order: Meno first, where it reads it. */
export function readersOf(kind: string, readers: readonly ReaderPlugin[] = READERS): ReaderPlugin[] {
  return readers.filter((p) => p.reads.includes(kind));
}

/** Who reads a kind, as the chemist has it in Settings, Files: its reader, and the readers that add to it. */
export type FileChoices = {
  /** The reader chosen for a kind, by the kind's id. */
  read: Record<string, string>;
  /** The readers that read a kind as well, their results added, by the kind's id. */
  also: Record<string, string[]>;
};

/**
 * The reader of a kind: the one chosen for it, where it is added and reads
 * it; else Meno, where Meno reads it - Meno keeps its kinds; else the first
 * added that reads it, in Meno's order. None, where nothing added reads it.
 */
export function readerFor(
  kind: string,
  added: ReadonlySet<string>,
  choices: FileChoices,
  readers: readonly ReaderPlugin[] = READERS,
): ReaderPlugin | null {
  const can = readersOf(kind, readers).filter((p) => p.builtin || added.has(p.id));
  return can.find((p) => p.id === choices.read[kind]) ?? can.find((p) => p.builtin) ?? can[0] ?? null;
}

/** The readers that read a kind as well as its reader, as chosen: each added, each reading it, the reader itself not again. */
export function alsoReadersFor(
  kind: string,
  added: ReadonlySet<string>,
  choices: FileChoices,
  readers: readonly ReaderPlugin[] = READERS,
): ReaderPlugin[] {
  const reader = readerFor(kind, added, choices, readers);
  const wanted = new Set(choices.also[kind] ?? []);
  return readersOf(kind, readers).filter((p) => p !== reader && wanted.has(p.id) && (p.builtin || added.has(p.id)));
}
