/**
 * A plugin's manifest (docs/PLUGINS.md, docs/FILE-IO.md): data in the
 * plugin's folder of its own, beside its worker and its lock, saying what it
 * is, what makes its environment and runs its worker, the kinds of file it
 * brings - their names, the names their files go by, and how a file of one
 * is told - which kinds it reads, by their ids: its own, or Meno's - the
 * kinds it writes, with their options (`writes`), how a text of a kind
 * it brings or writes is coloured (`colours`), the roles it fills
 * besides, by the ids Meno gives them (lib/plugins/roles), and the kinds of
 * a workflow's step it fills (`steps`, docs/WORKFLOWS.md).
 *
 * A plugin stands alone: it knows of no other, and Meno of no program. Two
 * plugins that read the same kind each bring it, by the same id; Meno puts
 * them together (lib/io/kinds).
 *
 * It is read as data, and checked here, whoever wrote it. A kind is told by
 * marks - text a file's start holds - never by a pattern or code: a pattern
 * can be written so that matching it never ends, and would hold the page
 * up. A kind told only by how it is laid out is told by its plugin when
 * asked (`probe`).
 *
 * The plugins Meno carries for now (./known) are each read here as one
 * fetched would be.
 */
import { acceptOptions, type Option } from "../options";

/** Text a file's start holds, which tells a kind: anywhere, or at a line's start; runs of spaces counted as one. */
export type Mark = {
  text: string;
  /** Only at a line's start, spaces before it aside. */
  at?: "line-start";
  /** Whatever its letters' case. */
  anyCase?: true;
};

/**
 * How a text of a kind is coloured (docs/PDF.md, *A text*), by marks as a
 * kind is told - text, never a pattern - each tried on a line: a line
 * holding an error's or a warning's mark is that, all of it; one holding a
 * keyword's is keywords; a comment's mark begins a comment, to the line's
 * end. Its numbers Meno finds itself.
 */
export type Colours = { keywords?: Mark[]; comments?: Mark[]; warnings?: Mark[]; errors?: Mark[] };

/** A kind of file a plugin brings: what it is called, the names its files go by, and how one is told. */
export type KindDecl = {
  id: string;
  /** What it is called, in Settings and in messages: "NBO output". */
  name: string;
  /** The program that writes it, as a molecule read from it names it; unsaid for a kind many programs write. */
  program?: string;
  /** The file names it goes by, lower case, with their dot. */
  extensions: string[];
  /** What the start of such a file says, one of them at least. */
  marks: Mark[];
  /** Told by its plugin, asked, where no mark tells it. */
  probe?: true;
  /** How a text of it is coloured. */
  colours?: Colours;
};

/**
 * A kind of file a plugin writes (docs/FILE-IO.md, *The contract for
 * files*): what it is called, the names its files go by - the first the one
 * Export gives - what it is given, and its options, in the general form
 * (lib/options), which Meno draws in Export.
 */
export type WriteDecl = {
  id: string;
  name: string;
  extensions: string[];
  /** What it is given: one molecule - one system of molecules in 3D, which Meno asks for where it must. */
  takes: "molecule";
  options: Option[];
  /** How a text of it is coloured. */
  colours?: Colours;
};

/**
 * A kind of step a plugin fills (docs/WORKFLOWS.md, *What changes in the
 * contract*): the kind, by the id Meno gives it; the programs it runs, by
 * their names, from its environment - none, where it does the step in its
 * worker; and its options, in the general form (lib/options), which Meno
 * draws in the step and in Settings, *Calculations*.
 */
export type StepDecl = { kind: string; programs: string[]; options: Option[] };

/** The systems Meno runs on, as a plugin names those it can be added on. */
export const SYSTEMS = ["macos", "windows", "linux"] as const;
export type System = (typeof SYSTEMS)[number];

/**
 * A program installed separately - ORCA, Gaussian - that a plugin's steps
 * run (docs/WORKFLOWS.md, *Programs installed separately*): never fetched,
 * found where the system finds programs or where the chemist locates it.
 * Its name, as the steps name it; what it is called; and its file's name on
 * each system it is made for. (What it is given as it runs - its folders,
 * its variables - Meno's backend reads from the manifest itself:
 * src-tauri/src/jobs.rs.)
 */
export type InstalledDecl = { name: string; label: string; files: Partial<Record<System, string>> };

/** A plugin's manifest, as Meno reads it. */
export type Manifest = {
  id: string;
  name: string;
  /** The version its environment's lock pins. */
  version: string;
  /** One line on what it is. */
  description: string;
  licence: string;
  homepage: string;
  /** What makes its environment - uv from PyPI, or pixi where it needs conda-forge (its pixi.toml beside it) - and from which lock in its folder. */
  environment: { maker: "uv" | "pixi"; lock: string };
  /** Its worker, in its folder. */
  worker: string;
  /** The kinds it reads, by id: its own (`kinds`), or Meno's. */
  reads: string[];
  /** The roles it fills besides reading files, by the ids Meno gives them: "smiles", "checks"... */
  roles: string[];
  /** The options it takes for a role it fills, by the role's id, in the general form (lib/options): drawn in Settings where the role is chosen. */
  roleOptions: Record<string, Option[]>;
  /** The kinds it brings. */
  kinds: KindDecl[];
  /** The kinds it writes. */
  writes: WriteDecl[];
  /** The kinds of step it fills. */
  steps: StepDecl[];
  /** The systems it can be added on - its programs built for those alone; none said, every one. */
  systems: System[];
  /** The programs installed separately that its steps run. */
  installed: InstalledDecl[];
};

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const EXTENSION = /^\.[a-z0-9]{1,12}$/;
/** A mark shorter than this would claim too much. */
const MARK_LEAST = 6;
const MARK_MOST = 200;

const text = (v: unknown, most: number): string | null => (typeof v === "string" && v.trim() && v.length <= most ? v.trim() : null);

function markOf(v: unknown): Mark | null {
  const m = v as Record<string, unknown> | null;
  const t = text(m?.text, MARK_MOST);
  if (!t || folded(t).length < MARK_LEAST) return null;
  return { text: t, ...(m?.at === "line-start" ? { at: "line-start" as const } : {}), ...(m?.anyCase === true ? { anyCase: true as const } : {}) };
}

/** A mark a line is tried for, in colouring: as short as a letter - it claims no file. */
function lineMarkOf(v: unknown): Mark | null {
  const m = v as Record<string, unknown> | null;
  const t = text(m?.text, MARK_MOST);
  if (!t) return null;
  return { text: t, ...(m?.at === "line-start" ? { at: "line-start" as const } : {}), ...(m?.anyCase === true ? { anyCase: true as const } : {}) };
}

/** How many marks each part of a kind's colours holds at most. */
const COLOUR_MARKS_MOST = 40;

function coloursOf(v: unknown): { colours?: Colours } {
  const c = v as Record<string, unknown> | null;
  if (!c || typeof c !== "object") return {};
  const out: Colours = {};
  for (const part of ["keywords", "comments", "warnings", "errors"] as const) {
    const marks = Array.isArray(c[part]) ? (c[part] as unknown[]).slice(0, COLOUR_MARKS_MOST).map(lineMarkOf).filter((m): m is Mark => m != null) : [];
    if (marks.length) out[part] = marks;
  }
  return Object.keys(out).length ? { colours: out } : {};
}

function kindOf(v: unknown): KindDecl | null {
  const k = v as Record<string, unknown> | null;
  const id = typeof k?.id === "string" && ID.test(k.id) ? k.id : null;
  const name = text(k?.name, 80);
  const program = text(k?.program, 80);
  if (!id || !name) return null;
  const extensions = Array.isArray(k?.extensions) ? k.extensions.filter((e): e is string => typeof e === "string" && EXTENSION.test(e)) : [];
  const marks = Array.isArray(k?.marks) ? k.marks.map(markOf).filter((m): m is Mark => m != null) : [];
  const probe = k?.probe === true;
  // (told somehow: by its marks, or by its plugin - and then by its files' names first)
  if (!marks.length && !(probe && extensions.length)) return null;
  return { id, name, ...(program ? { program } : {}), extensions, marks, ...(probe ? { probe: true as const } : {}), ...coloursOf(k?.colours) };
}

function writeOf(v: unknown): WriteDecl | null {
  const w = v as Record<string, unknown> | null;
  const id = typeof w?.id === "string" && ID.test(w.id) ? w.id : null;
  const name = text(w?.name, 80);
  const extensions = Array.isArray(w?.extensions) ? w.extensions.filter((e): e is string => typeof e === "string" && EXTENSION.test(e)) : [];
  // (given one molecule: the one thing a plugin is given, for now)
  if (!id || !name || !extensions.length || w?.takes !== "molecule") return null;
  return { id, name, extensions, takes: "molecule", options: acceptOptions(w.options), ...coloursOf(w.colours) };
}

/** A program's name, as a job is given it: a name, not a path. */
const PROGRAM = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/;

function stepOf(v: unknown): StepDecl | null {
  const s = v as Record<string, unknown> | null;
  const kind = typeof s?.kind === "string" && ID.test(s.kind) ? s.kind : null;
  if (!kind) return null;
  const programs = Array.isArray(s?.programs) ? s.programs.filter((p): p is string => typeof p === "string" && PROGRAM.test(p)) : [];
  return { kind, programs: [...new Set(programs)], options: acceptOptions(s?.options) };
}

/** A program's file, as a system has it: a name, not a path. */
const FILE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,59}$/;

function installedOf(v: unknown): InstalledDecl | null {
  const d = v as Record<string, unknown> | null;
  const name = typeof d?.name === "string" && PROGRAM.test(d.name) ? d.name : null;
  const label = text(d?.label, 60);
  const given = (d?.files ?? {}) as Record<string, unknown>;
  const files: Partial<Record<System, string>> = {};
  for (const s of SYSTEMS) if (typeof given[s] === "string" && FILE.test(given[s] as string)) files[s] = given[s] as string;
  return name && label && Object.keys(files).length ? { name, label, files } : null;
}

/** A manifest as Meno reads it, or null where it does not read as one: what reads wrong in it is left out, what it cannot do without makes it none. */
export function acceptManifest(raw: unknown): Manifest | null {
  const m = raw as Record<string, unknown> | null;
  if (!m || typeof m !== "object") return null;
  const id = typeof m.id === "string" && ID.test(m.id) ? m.id : null;
  const name = text(m.name, 60);
  const version = text(m.version, 40);
  const env = m.environment as Record<string, unknown> | null;
  const maker = env?.maker === "uv" || env?.maker === "pixi" ? env.maker : null;
  const lock = text(env?.lock, 200);
  const worker = text(m.worker, 200);
  // (its lock and worker files in its folder, where Meno's backend allows them: src-tauri/src/lib.rs)
  const lockFits = lock != null && (maker === "uv" ? /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.lock$/.test(lock) : lock === "pixi.lock");
  const workerFits = worker != null && /^[A-Za-z0-9_]+\.py$/.test(worker);
  if (!id || !name || !version || !maker || !lockFits || !workerFits) return null;
  const kinds = Array.isArray(m.kinds) ? m.kinds.map(kindOf).filter((k): k is KindDecl => k != null) : [];
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((r): r is string => typeof r === "string" && ID.test(r)) : []);
  const reads = ids(m.reads);
  const roles = ids(m.roles);
  const writes = Array.isArray(m.writes) ? m.writes.map(writeOf).filter((w): w is WriteDecl => w != null) : [];
  // (each kind of step once)
  const steps = (Array.isArray(m.steps) ? m.steps.map(stepOf).filter((d): d is StepDecl => d != null) : []).filter(
    (d, i, all) => all.findIndex((e) => e.kind === d.kind) === i,
  );
  // (options for the roles it says it fills, read as data; for no other)
  const roleOptions: Record<string, Option[]> = {};
  if (m.roleOptions && typeof m.roleOptions === "object" && !Array.isArray(m.roleOptions)) {
    for (const [role, raw] of Object.entries(m.roleOptions as Record<string, unknown>)) {
      const options = acceptOptions(raw);
      if (roles.includes(role) && options.length) roleOptions[role] = options;
    }
  }
  // (a plugin that does nothing is none)
  if (!reads.length && !roles.length && !writes.length && !steps.length) return null;
  const systems = Array.isArray(m.systems) ? SYSTEMS.filter((s) => (m.systems as unknown[]).includes(s)) : [];
  // (each program installed separately once, and only one a step runs)
  const installed = (Array.isArray(m.installed) ? m.installed.map(installedOf).filter((d): d is InstalledDecl => d != null) : []).filter(
    (d, i, all) => all.findIndex((e) => e.name === d.name) === i && steps.some((s) => s.programs.includes(d.name)),
  );
  return {
    id,
    name,
    version,
    description: text(m.description, 300) ?? "",
    licence: text(m.licence, 60) ?? "",
    homepage: text(m.homepage, 200) ?? "",
    environment: { maker, lock: lock! },
    worker: worker!,
    reads,
    roles,
    roleOptions,
    kinds,
    writes,
    steps,
    systems,
    installed,
  };
}

/** Text with each run of spaces and tabs one space: how marks, and what a file's start holds, are compared. */
export function folded(text: string): string {
  return text.replace(/[ \t]+/g, " ");
}

/** Where a file's start - folded, its line ends "\n" - first holds a mark; -1 where it does not. */
export function markAt(head: string, mark: Mark): number {
  const said = folded(mark.text.trim());
  const where = mark.anyCase ? head.toLowerCase() : head;
  const what = mark.anyCase ? said.toLowerCase() : said;
  if (mark.at !== "line-start") return where.indexOf(what);
  let at = 0;
  for (const line of where.split("\n")) {
    if (line.trimStart().startsWith(what)) return at;
    at += line.length + 1;
  }
  return -1;
}

/** Whether a file's start - folded, its line ends "\n" - holds a mark. */
export const holdsMark = (head: string, mark: Mark): boolean => markAt(head, mark) >= 0;
