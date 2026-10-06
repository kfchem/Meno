/**
 * The readers Meno knows of (docs/PLUGINS.md, docs/FILE-IO.md): the plugins,
 * each from its manifest (lib/plugins/manifest) - the plugins come with
 * Meno's own list for now (lib/plugins/manifests); a list fetched online
 * needs a way to trust it, and comes later - and Meno itself, which reads
 * some kinds under the same contract (./menoReads). The kinds the plugins
 * bring are registered with Meno's own (lib/io/kinds).
 *
 * A reader is known by its id. What it gave - results, the readers a
 * molecule was read by - keeps the id; its name is looked up only to show
 * it. A workspace saved before kept names ("cclib 1.9rc1", "Cube files"),
 * and they are read as ids.
 */
import type { Manifest } from "../plugins/manifest";
import { MANIFESTS } from "../plugins/known";
import { MENO_READS } from "./menoReads";

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
  /** Its Python environment's profile, lock and worker, among Meno's resources. */
  profile: `reader-${string}`;
  lock: string;
  worker: string;
  /** What makes its environment: uv from PyPI (unsaid), or pixi - its lock a pixi.lock - where it needs conda-forge. */
  env?: "pixi";
};
/** Meno itself, reading what it reads under the readers' contract: nothing to add or take away, nothing downloaded. */
export type MenoReader = ReaderBase & { builtin: true };
export type ReaderPlugin = PythonReader | MenoReader;

const readerOf = (m: Manifest): PythonReader => ({
  id: m.id,
  name: m.name,
  version: m.version,
  description: m.description,
  licence: m.licence,
  homepage: m.homepage,
  reads: m.reads,
  profile: `reader-${m.id}`,
  lock: m.environment.lock,
  worker: m.worker,
  ...(m.environment.maker === "pixi" ? { env: "pixi" as const } : {}),
});

/** The reader plugins Meno knows of, in Meno's order. */
export const READER_PLUGINS: readonly PythonReader[] = MANIFESTS.map(readerOf);

/** Meno's own reading, as a reader. */
export const MENO: MenoReader = {
  id: "meno",
  name: "Meno",
  version: "",
  description: "",
  licence: "",
  homepage: "",
  reads: Object.keys(MENO_READS),
  builtin: true,
};

/** Every reader: Meno's own, then the plugins, in Meno's order. */
export const READERS: readonly ReaderPlugin[] = [MENO, ...READER_PLUGINS];

/** The reader of that id. */
export function readerById(id: string, readers: readonly ReaderPlugin[] = READERS): ReaderPlugin | undefined {
  return readers.find((r) => r.id === id);
}

/** Names a reader went by in workspaces saved before readers were known by id. */
const FORMER_NAMES: Record<string, string> = { "Cube files": "meno" };

/**
 * A reader's id from what a result or a molecule kept of it: its id - or, as
 * kept before, its name and version ("cclib 1.9rc1"), or a name it went by.
 * One Meno does not know, as kept.
 */
export function readerIdOf(from: string, readers: readonly ReaderPlugin[] = READERS): string {
  if (readers.some((r) => r.id === from)) return from;
  // (a reader as a molecule keeps it now: its id and version)
  const own = readers.find((r) => from.startsWith(`${r.id} `));
  if (own) return own.id;
  if (FORMER_NAMES[from]) return FORMER_NAMES[from];
  const named = readers.find((r) => from === r.name || from.startsWith(`${r.name} `));
  return named?.id ?? from;
}

/** A reader as a molecule keeps it - its id and version, "cclib 1.9rc1" - from what was kept of it, as before ("PySCF 2.14.0", "Cube files") or now. */
export function readerLineOf(kept: string, readers: readonly ReaderPlugin[] = READERS): string {
  const id = readerIdOf(kept, readers);
  if (id === kept || kept.startsWith(`${id} `)) return kept;
  const named = readerById(id, readers);
  const version = named && kept.startsWith(named.name) ? kept.slice(named.name.length).trim() : "";
  return version ? `${id} ${version}` : id;
}

/** A reader's name, as the chemist knows it, from what was kept of it; one Meno does not know, as kept. */
export function readerNameOf(from: string | undefined, readers: readonly ReaderPlugin[] = READERS): string {
  if (!from) return "";
  return readerById(readerIdOf(from, readers), readers)?.name ?? from;
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
