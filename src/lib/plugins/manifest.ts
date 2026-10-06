/**
 * A plugin's manifest (docs/PLUGINS.md, docs/FILE-IO.md): data in the
 * plugin's folder of its own, beside its worker and its lock, saying what it
 * is, what makes its environment and runs its worker, the kinds of file it
 * brings - their names, the names their files go by, and how a file of one
 * is told - and which kinds it reads, by their ids: its own, or Meno's.
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

/** Text a file's start holds, which tells a kind: anywhere, or at a line's start; runs of spaces counted as one. */
export type Mark = {
  text: string;
  /** Only at a line's start, spaces before it aside. */
  at?: "line-start";
  /** Whatever its letters' case. */
  anyCase?: true;
};

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
};

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
  /** The kinds it brings. */
  kinds: KindDecl[];
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
  return { id, name, ...(program ? { program } : {}), extensions, marks, ...(probe ? { probe: true as const } : {}) };
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
  const reads = Array.isArray(m.reads) ? m.reads.filter((r): r is string => typeof r === "string" && ID.test(r)) : [];
  if (!reads.length) return null;
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
    kinds,
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
