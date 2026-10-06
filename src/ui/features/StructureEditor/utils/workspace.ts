/**
 * The workspace: everything on the canvas, as it is - the drawing, its
 * arrows and pluses, the molecules in 3D with their frames, energies, looks
 * and measurements, how each is turned and which frame it shows, and the
 * document's own drawing style - so that it opens again just as it was
 * saved. JSON, versioned; a reader keeps what it reads and leaves out what
 * it does not. Its file, `.meno`, is a zip (lib/doc/menoFile) holding it
 * and the calculations' outputs its molecules were read from.
 */
import { acceptStyleChoice } from "../../../../lib/chem/styleFields";
import type { StyleChoice } from "../../../../lib/chem/style";
import type { Carried3D, Drawn, EditorState } from "../store/types";
import { readDrawn } from "./copyPaste";
import { calcShowing, outputsToKeep } from "../../../../lib/calc/asks";
import { writeMenoFile } from "../../../../lib/doc/menoFileWriter";
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
};

type Saved = Pick<
  EditorState,
  "model" | "arrows" | "pluses" | "molecules3d" | "turns3d" | "frames3d" | "lists3d" | "docStyle" | "aromaticEnabled" | "aromaticRings"
>;

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
 * SHA-256) is not said to be anywhere else: where it was is left out.
 */
export function workspaceText(state: Saved, kept: ReadonlySet<string> = new Set()): string {
  const molecules3d = carriedOf(state).map((m) => {
    if (!m.calc?.source?.path || !kept.has(m.calc.source.sha256)) return m;
    const { path: _, ...source } = m.calc.source;
    return { ...m, calc: { ...m.calc, source } };
  });
  return (
    JSON.stringify({
      format: WORKSPACE,
      version: WORKSPACE_VERSION,
      atoms: state.model.atoms,
      bonds: state.model.bonds,
      arrows: state.arrows,
      pluses: state.pluses,
      molecules3d,
      ...(state.docStyle ? { style: state.docStyle } : {}),
      ...(state.aromaticEnabled ? { aromaticEnabled: true } : {}),
      ...(Object.keys(state.aromaticRings).length ? { aromaticRings: state.aromaticRings } : {}),
    }) + "\n"
  );
}

/** The canvas as its workspace file: its JSON, and every output its molecules were read from that is held this session. */
export async function workspaceFile(state: Saved): Promise<Uint8Array> {
  const sources = state.molecules3d.flatMap((m): CalcSource[] => (m.calc?.source ? [m.calc.source] : []));
  const kept = await outputsToKeep(sources);
  return writeMenoFile(workspaceText(state, new Set(kept.map((k) => k.sha256))), kept);
}

/** A workspace's JSON read, or null where `text` is not one this version reads. */
export function readWorkspace(text: string): Workspace | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const r = data as { format?: unknown; version?: unknown; style?: unknown; aromaticEnabled?: unknown; aromaticRings?: unknown };
  if (r?.format !== WORKSPACE || r.version !== WORKSPACE_VERSION) return null;
  const drawn = readDrawn(data);
  if (!drawn) return null;
  const rings: Record<string, boolean> = {};
  if (typeof r.aromaticRings === "object" && r.aromaticRings) {
    for (const [k, v] of Object.entries(r.aromaticRings)) if (typeof v === "boolean") rings[k] = v;
  }
  return {
    drawn,
    ...(r.style != null ? { style: acceptStyleChoice(r.style) } : {}),
    aromaticEnabled: r.aromaticEnabled === true,
    aromaticRings: rings,
  };
}

/** Whether a file's name says it is a workspace. */
export const isWorkspaceFile = (name: string) => /\.meno$/i.test(name);
