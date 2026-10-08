/**
 * The workspace: everything on the canvas, as it is - the drawing, its
 * arrows and pluses, the molecules in 3D with their frames, energies, looks
 * and measurements, how each is turned and which frame it shows, and the
 * document's own drawing style - so that it opens again just as it was
 * saved - and the texts it holds, and which its column showed. JSON,
 * versioned; a reader keeps what it reads and leaves out what it does not.
 * Its file, `.meno`, is a zip (lib/doc/menoFile) holding it, the
 * calculations' outputs its molecules were read from, and its texts.
 */
import { acceptStyleChoice } from "../../../../lib/chem/styleFields";
import type { StyleChoice } from "../../../../lib/chem/style";
import type { Carried3D, Drawn, EditorState, WorkspaceText } from "../store/types";
import { readDrawn } from "./copyPaste";
import { calcShowing, heldOutput, outputsToKeep, sha256Of } from "../../../../lib/calc/asks";
import { writeMenoFile } from "../../../../lib/doc/menoFileWriter";
import type { KeptData } from "../../../../lib/doc/menoFile";
import type { CalcSource } from "../../../../lib/calc/output";

export const WORKSPACE = "meno-workspace";
export const WORKSPACE_VERSION = 1;

/** What a workspace file holds, read. */
export type Workspace = {
  drawn: Drawn;
  /** The document's own drawing style; unset, the application's. */
  style?: StyleChoice;
  aromaticEnabled: boolean;
  aromaticRings: Record<string, boolean>;
  /** The texts it holds, as its file keeps them: each by its SHA-256 - and its words, once read (`readTexts`). */
  texts: SavedText[];
  /** Which of them its column showed, by its place among them; none, it was closed. */
  textShown?: number;
};

/** A text as a workspace's file keeps it: its name, and the file kept with its words, by SHA-256. */
export type SavedText = { name: string; sha256: string; text?: string };

type Saved = Pick<
  EditorState,
  "model" | "arrows" | "pluses" | "captions" | "molecules3d" | "turns3d" | "frames3d" | "lists3d" | "docStyle" | "aromaticEnabled" | "aromaticRings"
> &
  Partial<Pick<EditorState, "texts" | "textShown" | "textsOpen">>;

/**
 * The canvas's molecules in 3D as a file carries them: each turned, and
 * showing the frame, as it is - and a calculation's promise it is showing
 * (a surface, a motion), given, as what it came to (lib/calc/asks).
 */
export function carriedOf(state: Pick<Saved, "molecules3d" | "turns3d" | "frames3d"> & Partial<Pick<Saved, "lists3d">>): Carried3D[] {
  return state.molecules3d.map(({ id, ...m }) => {
    const open = state.lists3d?.[id];
    return {
      ...m,
      ...(m.calc && open ? { calc: calcShowing(m.calc, open.list, open.row) } : {}),
      ...(state.turns3d[id] ? { turn: state.turns3d[id] } : {}),
      ...(state.frames3d[id] ? { frame: state.frames3d[id] } : {}),
      ...(open ? { list: { id: open.list, row: open.row, ...(open.iso != null ? { iso: open.iso } : {}) } } : {}),
    };
  });
}

/**
 * The canvas as a workspace's JSON. An output its file keeps (`kept`, by
 * SHA-256) is not said to be anywhere else: where it was is left out - nor
 * is a text's, which it always keeps (`texts`, each text's SHA-256, in
 * order).
 */
export function workspaceText(state: Saved, kept: ReadonlySet<string> = new Set(), texts: readonly string[] = []): string {
  const molecules3d = carriedOf(state).map((m) => {
    if (!m.calc?.source?.path || !kept.has(m.calc.source.sha256)) return m;
    const { path: _, ...source } = m.calc.source;
    return { ...m, calc: { ...m.calc, source } };
  });
  const shown = state.textsOpen ? (state.texts?.findIndex((t) => t.id === state.textShown) ?? -1) : -1;
  return (
    JSON.stringify({
      format: WORKSPACE,
      version: WORKSPACE_VERSION,
      atoms: state.model.atoms,
      bonds: state.model.bonds,
      arrows: state.arrows,
      pluses: state.pluses,
      ...(state.captions.length ? { captions: state.captions } : {}),
      molecules3d,
      ...(state.docStyle ? { style: state.docStyle } : {}),
      ...(state.aromaticEnabled ? { aromaticEnabled: true } : {}),
      ...(Object.keys(state.aromaticRings).length ? { aromaticRings: state.aromaticRings } : {}),
      ...(state.texts?.length ? { texts: state.texts.map((t, i) => ({ name: t.name, sha256: texts[i] })) } : {}),
      ...(shown >= 0 ? { textShown: shown } : {}),
    }) + "\n"
  );
}

/** The canvas as its workspace file: its JSON, every output its molecules were read from that is held this session, and its texts. */
export async function workspaceFile(state: Saved): Promise<Uint8Array> {
  const sources = state.molecules3d.flatMap((m): CalcSource[] => (m.calc?.source ? [m.calc.source] : []));
  const kept = await outputsToKeep(sources);
  const texts = await textsToKeep(state.texts ?? []);
  return writeMenoFile(
    workspaceText(state, new Set(kept.map((k) => k.sha256)), texts.map((t) => t.sha256)),
    [...kept, ...texts],
  );
}

/** The texts as a workspace's file keeps them, in order: each as UTF-8, by its SHA-256 - one an output's too kept once. */
async function textsToKeep(texts: readonly WorkspaceText[]): Promise<KeptData[]> {
  const encoder = new TextEncoder();
  return Promise.all(
    texts.map(async (t) => ({ sha256: await sha256Of(t.text), name: t.name, media: "text/plain", data: encoder.encode(t.text) })),
  );
}

/**
 * A workspace's texts read from its file, held as it was opened (lib/calc/
 * asks): each with its words, and which its column showed - those not to
 * be had left out, and named (`missing`).
 */
export async function readTexts(ws: Workspace): Promise<{ ws: Workspace; missing: string[] }> {
  const read = await Promise.all(ws.texts.map(async (t) => ({ ...t, text: t.text ?? (await heldOutput(t.sha256))?.text })));
  const texts = read.filter((t) => t.text != null);
  const shown = ws.textShown != null ? texts.indexOf(read[ws.textShown]) : -1;
  return {
    ws: { ...ws, texts, ...(shown >= 0 ? { textShown: shown } : { textShown: undefined }) },
    missing: read.filter((t) => t.text == null).map((t) => t.name),
  };
}

/** A workspace's JSON read, or null where `text` is not one this version reads. */
export function readWorkspace(text: string): Workspace | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const r = data as {
    format?: unknown;
    version?: unknown;
    style?: unknown;
    aromaticEnabled?: unknown;
    aromaticRings?: unknown;
    texts?: unknown;
    textShown?: unknown;
  };
  if (r?.format !== WORKSPACE || r.version !== WORKSPACE_VERSION) return null;
  const drawn = readDrawn(data);
  if (!drawn) return null;
  const rings: Record<string, boolean> = {};
  if (typeof r.aromaticRings === "object" && r.aromaticRings) {
    for (const [k, v] of Object.entries(r.aromaticRings)) if (typeof v === "boolean") rings[k] = v;
  }
  const texts: SavedText[] = [];
  for (const t of Array.isArray(r.texts) ? (r.texts as Partial<SavedText>[]) : []) {
    if (typeof t?.name === "string" && typeof t.sha256 === "string" && SHA.test(t.sha256)) texts.push({ name: t.name.slice(0, 260), sha256: t.sha256 });
  }
  const shown = typeof r.textShown === "number" && Number.isInteger(r.textShown) && r.textShown >= 0 && r.textShown < texts.length;
  return {
    drawn,
    ...(r.style != null ? { style: acceptStyleChoice(r.style) } : {}),
    aromaticEnabled: r.aromaticEnabled === true,
    aromaticRings: rings,
    texts,
    ...(shown ? { textShown: r.textShown as number } : {}),
  };
}

const SHA = /^[0-9a-f]{64}$/;

/** Whether a file's name says it is a workspace. */
export const isWorkspaceFile = (name: string) => /\.meno$/i.test(name);
