import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import { rememberable, valuesOf } from "../../../../../lib/options";
import { useAppSettings } from "../../../../../lib/settings/appSettings";
import type { StructureDocument } from "../../document";
import { currentStyle3D } from "../../style3d";
import { lookOf, solidOf } from "../../utils/molecule3d";
import { byOf } from "../../workflow/doers";
import { kindInfo, type StepKind } from "../../workflow/kinds";
import * as wf from "../../workflow/model";
import { runStep } from "../../workflow/run";
import type { EditorState, Molecule3D } from "../types";

type SetState = StoreApi<EditorState>["setState"];

/** The role a kind of step's options are remembered by (lib/settings/appSettings `options`). */
export const stepRole = (kind: StepKind) => `step:${kind}`;

/**
 * A workflow on the page (docs/WORKFLOWS.md): its boxes, steps and wires,
 * edits to the document - so that undo takes each back and Save keeps it;
 * what is under the pointer, chosen, open or being drawn, the view's.
 */
export function createWorkflowSlice(doc: DocumentStore<StructureDocument>, set: SetState) {
  const coalesce = (what: string, id: number, gesture?: string) => (gesture ? { coalesceKey: `${what}:${id}:${gesture}` } : {});
  return {
    setWorkflowView: (patch: Partial<Pick<EditorState, "hoveredBox" | "chosenBox" | "hoveredWire" | "openStep" | "wireDrag">>) => set(patch),
    addBox: (frame: { x0: number; y0: number; x1: number; y1: number }) => {
      const id = doc.getState().nextWorkflowId ?? 1;
      doc.edit("add box", (d) => wf.addBox(d, frame));
      return id;
    },
    setBoxFrame: (id: number, frame: { x0: number; y0: number; x1: number; y1: number }, gesture?: string) =>
      doc.edit("size box", (d) => wf.setBoxFrame(d, id, frame), coalesce("box-size", id, gesture)),
    moveBox: (id: number, dx: number, dy: number, gesture?: string) => doc.edit("move box", (d) => wf.moveBox(d, id, dx, dy), coalesce("box-move", id, gesture)),
    removeBox: (id: number) => {
      if (doc.edit("delete box", (d) => wf.removeBox(d, id)))
        set((prev: EditorState) => ({
          ...prev,
          hoveredBox: prev.hoveredBox === id ? null : prev.hoveredBox,
          chosenBox: prev.chosenBox === id ? null : prev.chosenBox,
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
        set((prev: EditorState) => ({ ...prev, openStep: prev.openStep === id ? null : prev.openStep }));
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
    runStep: (id: number) => {
      const style = currentStyle3D();
      doc.edit("run", (d) =>
        runStep(d, id, {
          reachOf: (m) => solidOf(m as Molecule3D, style).reach[lookOf(m as Molecule3D, style)],
          byOf,
          now: Date.now(),
        }),
      );
    },
  };
}
