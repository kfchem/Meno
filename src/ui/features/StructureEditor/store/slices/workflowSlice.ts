import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import { rememberable, valuesOf } from "../../../../../lib/options";
import { useAppSettings } from "../../../../../lib/settings/appSettings";
import type { StructureDocument } from "../../document";
import { currentStyle3D } from "../../style3d";
import { lookOf, poseOf, seenBounds, solidOf } from "../../utils/molecule3d";
import type { Style3D } from "../../../../../lib/chem/style3d";
import { byOf } from "../../workflow/doers";
import { kindInfo, type StepKind } from "../../workflow/kinds";
import * as wf from "../../workflow/model";
import { runStep } from "../../workflow/run";
import type { EditorState, Molecule3D, WorkflowView } from "../types";

type SetState = StoreApi<EditorState>["setState"];

/** How far a molecule in 3D reaches from its middle on the page, across and up, as it stands unturned, in any of its frames. */
function extentOf(m: Molecule3D, style: Style3D): { w: number; h: number } {
  const solid = solidOf(m, style);
  const look = lookOf(m, style);
  let w = 0;
  let h = 0;
  for (let f = 0; f < solid.frames.length; f++) {
    const b = seenBounds(poseOf({ ...m, at: { x: 0, y: 0 } }, solid, look, undefined, f));
    w = Math.max(w, -b.minX, b.maxX);
    h = Math.max(h, -b.minY, b.maxY);
  }
  return { w, h };
}

/** The role a kind of step's options are remembered by (lib/settings/appSettings `options`). */
export const stepRole = (kind: StepKind) => `step:${kind}`;

/**
 * A workflow on the page (docs/WORKFLOWS.md): its sets, steps and wires,
 * edits to the document - so that undo takes each back and Save keeps it;
 * what is under the pointer, chosen, open or being drawn, the view's.
 */
export function createWorkflowSlice(doc: DocumentStore<StructureDocument>, set: SetState) {
  const coalesce = (what: string, id: number, gesture?: string) => (gesture ? { coalesceKey: `${what}:${id}:${gesture}` } : {});
  return {
    setWorkflowView: (patch: Partial<Pick<EditorState, WorkflowView>>) => set(patch),
    addSet: (frame: { x0: number; y0: number; x1: number; y1: number }) => {
      const id = doc.getState().nextWorkflowId ?? 1;
      doc.edit("add set", (d) => wf.addSet(d, frame));
      return id;
    },
    resizeSet: (id: number, frame: { x0: number; y0: number; x1: number; y1: number }, gesture?: string) =>
      doc.edit("size set", (d) => wf.resizeSet(d, id, frame), coalesce("set-size", id, gesture)),
    moveSet: (id: number, dx: number, dy: number, gesture?: string) => doc.edit("move set", (d) => wf.moveSet(d, id, dx, dy), coalesce("set-move", id, gesture)),
    removeSet: (id: number) => {
      if (doc.edit("delete set", (d) => wf.removeSet(d, id)))
        set((prev: EditorState) => ({
          ...prev,
          hoveredSet: prev.hoveredSet === id ? null : prev.hoveredSet,
          chosenSet: prev.chosenSet === id ? null : prev.chosenSet,
        }));
    },
    addStep: (kind: StepKind, x: number, y: number) => {
      const id = doc.getState().nextWorkflowId ?? 1;
      // (with the options last chosen for its kind)
      const options = valuesOf(kindInfo(kind).options ?? [], useAppSettings.getState().options[stepRole(kind)]);
      doc.edit("add step", (d) => wf.addStep(d, kind, x, y, options));
      return id;
    },
    moveStep: (id: number, x: number, y: number, gesture?: string) => doc.edit("move step", (d) => wf.moveStep(d, id, x, y), coalesce("step-move", id, gesture)),
    updateStep: (id: number, patch: { options?: Record<string, string | number | boolean>; by?: string | null }) => {
      const step = doc.getState().steps?.find((s) => s.id === id);
      if (!step) return;
      doc.edit(patch.options ? "change options" : "change who does it", (d) => wf.updateStep(d, id, patch));
      if (patch.options) useAppSettings.getState().rememberOptions(stepRole(step.kind), rememberable(kindInfo(step.kind).options ?? [], patch.options));
    },
    removeStep: (id: number) => {
      if (doc.edit("delete step", (d) => wf.removeStep(d, id)))
        set((prev: EditorState) => ({
          ...prev,
          openStep: prev.openStep === id ? null : prev.openStep,
          hoveredStep: prev.hoveredStep === id ? null : prev.hoveredStep,
        }));
    },
    connect: (from: Parameters<typeof wf.connect>[1], to: number) => {
      const was = doc.getState();
      doc.edit("wire", (d) => wf.connect(d, from, to));
      return doc.getState() !== was;
    },
    removeWire: (id: number) => {
      if (doc.edit("delete wire", (d) => wf.removeWire(d, id)))
        set((prev: EditorState) => ({ ...prev, hoveredWire: prev.hoveredWire === id ? null : prev.hoveredWire }));
    },
    rewire: (id: number, to: number) => {
      doc.edit("wire", (d) => {
        const w = d.wires?.find((x) => x.id === id);
        if (!w || w.to === to) return d;
        const moved = wf.connect(wf.removeWire(d, id), w.from, to);
        // (where it may not go there, it stays where it was)
        return moved.wires?.some((x) => x.to === to && JSON.stringify(x.from) === JSON.stringify(w.from)) ? moved : d;
      });
    },
    runStep: (id: number) => {
      const style = currentStyle3D();
      doc.edit("run", (d) =>
        runStep(d, id, {
          extentOf: (m) => extentOf({ ...m, id: 0 }, style),
          byOf,
          now: Date.now(),
        }),
      );
    },
  };
}
