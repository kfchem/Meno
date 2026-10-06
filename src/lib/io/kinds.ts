/**
 * Every kind of file Meno takes in, and the one place that says what a
 * file is (docs/FILE-IO.md). Open, a drop and pasted text all ask here,
 * once; what reads the file then is the kind's - Meno itself, or the
 * calculation readers (lib/calc).
 *
 * A file is told by what it holds, the strongest evidence first:
 * 1. Meno's own records - a workspace, a structure's record;
 * 2. a program's banner (lib/calc/catalog);
 * 3. an RXN file's or a molfile's markers;
 * 4. a cube's layout;
 * 5. an XYZ file's layout.
 * Its name decides only where what it holds does not: a molfile Meno
 * cannot make out is still a molfile, and says why it cannot be read.
 */
import { MARK_REACH, OUTPUT_KINDS, type OutputKind } from "../calc/catalog";

/** A kind of file: what it is called, the names its files go by, and - for a calculation's output - what the readers know of it. */
export type Kind = {
  id: string;
  /** What it is called, in messages: "MOL file". */
  name: string;
  /** The file names it goes by, lower case, with their dot. */
  extensions: readonly string[];
  /** A calculation's output, read by the readers that read it; none for a kind Meno reads itself. */
  output?: OutputKind;
};

/** The kinds Meno reads itself. */
export const MENO_KINDS = {
  workspace: { id: "meno-workspace", name: "Meno workspace", extensions: [".meno"] },
  record: { id: "meno-record", name: "Meno structure", extensions: [] },
  rxn: { id: "rxn", name: "RXN file", extensions: [".rxn"] },
  mol: { id: "mol", name: "MOL file", extensions: [".mol"] },
  sdf: { id: "sdf", name: "SD file", extensions: [".sdf"] },
  xyz: { id: "xyz", name: "XYZ file", extensions: [".xyz"] },
} as const satisfies Record<string, Kind>;

const outputs: Kind[] = OUTPUT_KINDS.map((k) => ({ id: k.id, name: k.name, extensions: k.extensions, output: k }));

/** Every kind Meno takes in. */
export const KINDS: readonly Kind[] = [...Object.values(MENO_KINDS), ...outputs];

/** The kind of that id. */
export function kindById(id: string): Kind | undefined {
  return KINDS.find((k) => k.id === id);
}

/** What a file is, from what it holds and then its name; null where neither says - text, say. */
export function kindOf(name: string, text: string): Kind | null {
  const head = text.slice(0, MARK_REACH).replace(/\r\n?/g, "\n");
  const ext = extensionOf(name);
  // 1. Meno's own records, which are JSON, and say what they are
  if (/^\s*\{/.test(head)) {
    const said = /"format"\s*:\s*"(meno-workspace|meno-structure)"/.exec(head)?.[1];
    if (said === "meno-workspace") return MENO_KINDS.workspace;
    if (said === "meno-structure") return MENO_KINDS.record;
  }
  // 2. a program's banner
  const banner = outputs.find((k) => !k.output!.layout && k.output!.marks.some((m) => m.test(head)));
  if (banner) return banner;
  // 3. an RXN file's or a molfile's markers
  if (/^\s*\$RXN\b/m.test(head)) return MENO_KINDS.rxn;
  if (/\b(V2000|V3000)\b/.test(head) || /^\s*M {2}END\s*$/m.test(head)) return ext === ".sdf" ? MENO_KINDS.sdf : MENO_KINDS.mol;
  // 4. a cube's layout
  const layout = outputs.find((k) => k.output!.layout && k.output!.marks.some((m) => m.test(head)));
  if (layout) return layout;
  // 5. an XYZ file's layout
  if (looksLikeXyz(head)) return MENO_KINDS.xyz;
  // its name, where what it holds says nothing
  return Object.values(MENO_KINDS).find((k) => (k.extensions as readonly string[]).includes(ext)) ?? null;
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
