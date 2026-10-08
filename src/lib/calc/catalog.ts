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
import type { InstalledDecl, Manifest, StepDecl, System, WriteDecl } from "../plugins/manifest";
import type { Option } from "../options";
import { MANIFESTS, PLUGINS_ROOT } from "../plugins/known";
import { isRole, type RoleId } from "../plugins/roles";
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
/** A plugin: what it is, what it reads and writes, the roles it fills besides, and what it runs - a worker in a Python environment of its own. */
export type PythonPlugin = ReaderBase & {
  builtin?: undefined;
  /** The roles it fills besides reading files (lib/plugins/roles). */
  roles: readonly RoleId[];
  /** The kinds it writes (lib/io/writers): none of Meno's, which Meno writes itself. */
  writes: readonly WriteDecl[];
  /** The options it takes for the roles it fills, by role (Settings, where each role is chosen). */
  roleOptions: Partial<Record<RoleId, readonly Option[]>>;
  /** The kinds of a workflow's step it fills (docs/WORKFLOWS.md). */
  steps: readonly StepDecl[];
  /** The systems it can be added on; none, every one. */
  systems: readonly System[];
  /** The programs installed separately that its steps run: found or located, never fetched (lib/plugins/installed). */
  installed: readonly InstalledDecl[];
  /** Its Python environment's profile, and its lock and worker, in its folder among Meno's resources. */
  profile: `plugin-${string}`;
  lock: string;
  worker: string;
  /** What makes its environment: uv from PyPI (unsaid), or pixi - its lock a pixi.lock - where it needs conda-forge. */
  env?: "pixi";
};
/** Meno itself, reading what it reads under the readers' contract: nothing to add or take away, nothing downloaded. */
export type MenoReader = ReaderBase & { builtin: true };
export type ReaderPlugin = PythonPlugin | MenoReader;

const MENO_IDS: ReadonlySet<string> = new Set(Object.values(MENO_KINDS).map((k) => k.id));

/** A plugin, from its manifest. */
export const pluginOf = (m: Manifest): PythonPlugin => ({
  id: m.id,
  name: m.name,
  version: m.version,
  description: m.description,
  licence: m.licence,
  homepage: m.homepage,
  // (its own kinds, and Meno's: never another plugin's, which it does not know)
  reads: m.reads.filter((id) => MENO_IDS.has(id) || m.kinds.some((k) => k.id === id)),
  // (the roles Meno defines, of those it says it fills)
  roles: m.roles.filter(isRole),
  writes: m.writes.filter((w) => !MENO_IDS.has(w.id)),
  steps: m.steps,
  systems: m.systems,
  installed: m.installed,
  roleOptions: Object.fromEntries(Object.entries(m.roleOptions).filter(([role]) => isRole(role))),
  profile: `plugin-${m.id}`,
  lock: `${PLUGINS_ROOT}/${m.id}/${m.environment.lock}`,
  worker: `${PLUGINS_ROOT}/${m.id}/${m.worker}`,
  ...(m.environment.maker === "pixi" ? { env: "pixi" as const } : {}),
});

/** The plugins Meno knows of, in Meno's order: each that reads or writes something, or fills a role or a kind of step. */
export const PLUGINS: readonly PythonPlugin[] = MANIFESTS.map(pluginOf).filter((p) => p.reads.length || p.roles.length || p.writes.length || p.steps.length);

/** The plugins that read files. */
export const READER_PLUGINS: readonly PythonPlugin[] = PLUGINS.filter((p) => p.reads.length);

/** The plugins that write files. */
export const WRITER_PLUGINS: readonly PythonPlugin[] = PLUGINS.filter((p) => p.writes.length);

/** The plugin of that id. */
export const pluginById = (id: string): PythonPlugin | undefined => PLUGINS.find((p) => p.id === id);

/** The plugins that fill a role, in Meno's order. */
export const pluginsFilling = (role: RoleId): PythonPlugin[] => PLUGINS.filter((p) => p.roles.includes(role));

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
