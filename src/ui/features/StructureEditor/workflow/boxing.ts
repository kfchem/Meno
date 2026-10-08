/**
 * The selection as an input (docs/WORKFLOWS.md, *An input: boxing
 * molecules*): where it holds whole structures or molecules in 3D - a few
 * atoms of a structure make no input - the frame a box round it takes:
 * clear of what it holds, with room under its tab.
 */
import type { Style3D } from "../../../../lib/chem/style3d";
import type { Model, Molecule3D, Turn3D } from "../store/types";
import { lookOf, poseOf, seenBounds, solidOf } from "../utils/molecule3d";
import { structuresOf, type Frame } from "./entries";
import { BOX_PAD, BOX_TOP, CHIP } from "./look";

export function selectionFrame(
  model: Model,
  atoms: ReadonlySet<number>,
  molecules: readonly Molecule3D[],
  sel3d: ReadonlySet<number>,
  style: Style3D,
  turns: Record<number, Turn3D>,
  frames: Record<number, number>,
): Frame | null {
  if (!atoms.size && !sel3d.size) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  if (atoms.size) {
    const byId = new Map(model.atoms.map((a) => [a.id, a]));
    for (const part of structuresOf(model)) {
      const n = part.filter((id) => atoms.has(id)).length;
      if (n === 0) continue;
      if (n < part.length) return null;
      for (const id of part) {
        const a = byId.get(id)!;
        xs.push(a.x - BOX_PAD, a.x + BOX_PAD);
        ys.push(a.y - BOX_PAD, a.y + BOX_PAD);
      }
    }
  }
  for (const m of molecules) {
    if (!sel3d.has(m.id)) continue;
    const b = seenBounds(poseOf(m, solidOf(m, style), lookOf(m, style), turns[m.id], frames[m.id]));
    // (and its frames chip below it, where it has one)
    const chip = m.frames?.length || m.calc ? CHIP : 0;
    xs.push(b.minX - BOX_PAD, b.maxX + BOX_PAD);
    ys.push(b.minY - BOX_PAD - chip, b.maxY + BOX_PAD);
  }
  if (!xs.length) return null;
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) + BOX_TOP - BOX_PAD };
}
