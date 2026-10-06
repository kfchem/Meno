/**
 * Every kind of file Meno takes in, and the one place that says what a
 * file is (docs/FILE-IO.md). Open, a drop and pasted text all ask here,
 * once; what reads the file then is the kind's - Meno itself, or the
 * readers (lib/calc).
 *
 * Kinds are registered:
 * - Meno registers its own, and the well-known kinds of calculation output,
 *   by id.
 * - A plugin registers the kinds it brings in its manifest
 *   (lib/plugins/manifest), told by marks - text, never a pattern. A mark
 *   that would claim one of Meno's own sample files is refused, so that no
 *   plugin takes a molfile for its own.
 *
 * A file is told by what it holds, the strongest evidence first:
 * 1. Meno's own records - a workspace, a structure's record;
 * 2. a program's banner, Meno's or a plugin's;
 * 3. an RXN file's or a molfile's markers;
 * 4. a cube's layout;
 * 5. an XYZ file's layout.
 * Its name decides only where what it holds does not - a molfile Meno
 * cannot make out is still a molfile, and says why it cannot be read - and
 * a kind its plugin tells, asked (`probe`), is asked about last.
 */
import { CUBE_MARK } from "../calc/cube";
import { folded, holdsMark, type KindDecl, type Manifest, type Mark } from "../plugins/manifest";
import { MANIFESTS } from "../plugins/known";
import sampleSdf from "../../samples/cholesterol.sdf?raw";
import sampleXyz from "../../samples/cholesterol.xyz?raw";
import sampleRxn from "../../samples/diels-alder.rxn?raw";

/** How much of a file's start is looked at to tell what it is. */
export const MARK_REACH = 64 * 1024;

/** A kind of file: what it is called, the names its files go by, how one is told, and - a calculation's output - its program. */
export type Kind = {
  id: string;
  /** What it is called, in Settings and in messages: "MOL file". */
  name: string;
  /** The file names it goes by, lower case, with their dot. */
  extensions: readonly string[];
  /** A calculation's output, read by the readers (lib/calc): the program that writes it, as a molecule read from it names it. Unset for a kind Meno reads on the page. */
  output?: { program: string };
  /** What the start of such a file says - a program's banner - one of them at least. */
  marks?: readonly Mark[];
  /** How such a file is laid out: Meno's own kinds only, a pattern being Meno's to trust. */
  layout?: RegExp;
  /** Told by a plugin that reads it, asked, where nothing else tells it. */
  probe?: true;
};

/** The kinds Meno reads itself, on the page. */
export const MENO_KINDS = {
  workspace: { id: "meno-workspace", name: "Meno workspace", extensions: [".meno"] },
  record: { id: "meno-record", name: "Meno structure", extensions: [] },
  rxn: { id: "rxn", name: "RXN file", extensions: [".rxn"] },
  mol: { id: "mol", name: "MOL file", extensions: [".mol"] },
  sdf: { id: "sdf", name: "SD file", extensions: [".sdf"] },
  xyz: { id: "xyz", name: "XYZ file", extensions: [".xyz"] },
} as const satisfies Record<string, Kind>;

/** The kinds Meno writes itself: the workspace by Save, the rest by Export (StructureEditor/fileActions). */
export const MENO_WRITES: readonly string[] = [MENO_KINDS.workspace.id, MENO_KINDS.mol.id, MENO_KINDS.sdf.id, MENO_KINDS.rxn.id];

/** The well-known kinds of calculation output, which Meno registers for every plugin to read by id; and the cube, which Meno reads itself. */
export const OUTPUT_KINDS: readonly Kind[] = [
  {
    id: "molden",
    name: "Molden file",
    extensions: [".molden", ".mld"],
    output: { program: "the program" },
    marks: [{ text: "[Molden Format]", at: "line-start", anyCase: true }],
  },
  { id: "cube", name: "Cube file", extensions: [".cube", ".cub"], output: { program: "the program" }, layout: CUBE_MARK },
  { id: "orca", name: "ORCA output", extensions: [".out", ".log"], output: { program: "ORCA" }, marks: [{ text: "* O R C A *" }] },
  {
    id: "gaussian",
    name: "Gaussian output",
    extensions: [".log", ".out"],
    output: { program: "Gaussian" },
    marks: [{ text: "Entering Gaussian System", at: "line-start" }],
  },
  {
    id: "gaussian-fchk",
    name: "Gaussian formatted checkpoint",
    extensions: [".fchk", ".fch"],
    output: { program: "Gaussian" },
    marks: [{ text: "Number of atoms I", at: "line-start" }],
  },
  {
    id: "xtb",
    name: "xTB output",
    extensions: [".out", ".log"],
    output: { program: "xTB" },
    marks: [{ text: "| x T B |" }, { text: "* xtb version", at: "line-start" }],
  },
];

/** Files of Meno's own kinds a plugin's marks are tried on: a mark one of them holds is not the plugin's to claim. */
const MENO_SAMPLES: readonly string[] = [
  sampleSdf,
  sampleXyz,
  sampleRxn,
  '{"format":"meno-workspace","version":1,"atoms":[],"bonds":[],"arrows":[],"pluses":[],"molecules3d":[]}',
  '{"format":"meno-structure","version":1,"atoms":[],"bonds":[]}',
];

/** A mark refused, and why: the plugin, the kind, the mark, and the kind of Meno's it would have claimed. */
export type Refused = { plugin: string; kind: string; mark: string };

/**
 * The kinds registered by Meno and by `manifests`: a plugin's kind of an id
 * Meno or another plugin registered too is one kind, its marks and file
 * names put together. Marks that would claim one of Meno's samples are
 * refused, and said; a kind left with no way to be told is left out.
 */
export function registered(manifests: readonly Manifest[]): { kinds: Kind[]; refused: Refused[] } {
  const samples = MENO_SAMPLES.map(headOf);
  const refused: Refused[] = [];
  const outputs = new Map<string, Kind>(OUTPUT_KINDS.map((k) => [k.id, k]));
  const own = new Set(Object.values(MENO_KINDS).map((k) => k.id as string));
  for (const m of manifests) {
    for (const k of m.kinds) {
      if (own.has(k.id)) continue;
      const marks = k.marks.filter((mark) => {
        const claims = samples.some((s) => holdsMark(s, mark));
        if (claims) refused.push({ plugin: m.id, kind: k.id, mark: mark.text });
        return !claims;
      });
      const was = outputs.get(k.id);
      const merged: Kind = was
        ? {
            ...was,
            extensions: [...new Set([...was.extensions, ...k.extensions])],
            marks: [...(was.marks ?? []), ...marks],
            ...(k.probe || was.probe ? { probe: true as const } : {}),
          }
        : kindFrom(k, marks);
      if (merged.marks?.length || merged.layout || merged.probe) outputs.set(k.id, merged);
    }
  }
  return { kinds: [...Object.values(MENO_KINDS), ...outputs.values()], refused };
}

const kindFrom = (k: KindDecl, marks: Mark[]): Kind => ({
  id: k.id,
  name: k.name,
  extensions: k.extensions,
  output: { program: k.program },
  ...(marks.length ? { marks } : {}),
  ...(k.probe ? { probe: true as const } : {}),
});

/** A file's start as marks are tried on it: its first `MARK_REACH` characters, line ends "\n", runs of spaces one. */
export function headOf(text: string): string {
  return folded(text.slice(0, MARK_REACH).replace(/\r\n?/g, "\n"));
}

// (the kinds the plugins Meno knows of bring, registered with Meno's own)
let table: { kinds: Kind[]; refused: Refused[] } = registered(MANIFESTS);

/** Registers the kinds `manifests` bring, in place of those registered before - the plugins Meno knows of, and any it comes to know of. */
export function registerKinds(manifests: readonly Manifest[]): Refused[] {
  table = registered(manifests);
  return table.refused;
}

/** The marks refused as the plugins' kinds were registered: each would have claimed one of Meno's own files. */
export function refusedMarks(): readonly Refused[] {
  return table.refused;
}

/** Every kind registered. */
export function kinds(): readonly Kind[] {
  return table.kinds;
}

/** The kind of that id, where one is registered. */
export function kindById(id: string): Kind | undefined {
  return table.kinds.find((k) => k.id === id);
}

/** What a file is, from what it holds and then its name; null where neither says - text, say, or a kind only its plugin tells (`probeCandidates`). */
export function kindOf(name: string, text: string, among: readonly Kind[] = table.kinds): Kind | null {
  const raw = text.slice(0, MARK_REACH).replace(/\r\n?/g, "\n");
  const head = folded(raw);
  const ext = extensionOf(name);
  // 1. Meno's own records, which are JSON, and say what they are
  if (/^\s*\{/.test(raw)) {
    const said = /"format"\s*:\s*"(meno-workspace|meno-structure)"/.exec(raw)?.[1];
    if (said === "meno-workspace") return MENO_KINDS.workspace;
    if (said === "meno-structure") return MENO_KINDS.record;
  }
  // 2. a program's banner
  const banner = among.find((k) => k.marks?.some((m) => holdsMark(head, m)));
  if (banner) return banner;
  // 3. an RXN file's or a molfile's markers
  if (/^\s*\$RXN\b/m.test(raw)) return MENO_KINDS.rxn;
  if (/\b(V2000|V3000)\b/.test(raw) || /^\s*M {2}END\s*$/m.test(raw)) return ext === ".sdf" ? MENO_KINDS.sdf : MENO_KINDS.mol;
  // 4. a cube's layout
  const layout = among.find((k) => k.layout?.test(raw));
  if (layout) return layout;
  // 5. an XYZ file's layout
  if (looksLikeXyz(raw)) return MENO_KINDS.xyz;
  // its name, where what it holds says nothing - of Meno's own kinds, whose names their files keep
  return Object.values(MENO_KINDS).find((k) => (k.extensions as readonly string[]).includes(ext)) ?? null;
}

/** The kinds a plugin could tell a file to be, asked: those told by asking, whose files go by its name's extension. */
export function probeCandidates(name: string, among: readonly Kind[] = table.kinds): Kind[] {
  const ext = extensionOf(name);
  return ext ? among.filter((k) => k.probe && k.extensions.includes(ext)) : [];
}

/** A file name's extension, lower case, with its dot; "" where it has none. */
export function extensionOf(name: string): string {
  const m = /\.[^./\\]+$/.exec(name);
  return m ? m[0].toLowerCase() : "";
}

const XYZ_NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
// line 3, the first atom: "<symbol or atomic number> <x> <y> <z>"
const XYZ_ATOM_LINE = new RegExp(String.raw`^\s*(?:[A-Za-z]{1,3}|\d{1,3})\s+${XYZ_NUM}\s+${XYZ_NUM}\s+${XYZ_NUM}\b`);

/** Whether text is laid out as an XYZ file: an atom count alone on its first line, and its first atom on its third. */
function looksLikeXyz(text: string): boolean {
  const lines = text.replace(/^\s*\n/, "").split("\n");
  const first = lines[0] ?? "";
  if (!/^\s*\d+\s*$/.test(first)) return false;
  if (Number.parseInt(first, 10) === 0) return true;
  return XYZ_ATOM_LINE.test(lines[2] ?? "");
}
