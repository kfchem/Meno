import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, JobAsk } from "../../../../lib/jobs";

/** The jobs, as the test has them: each one's record, its log and its files; and what was asked. */
const jobs = new Map<string, Job & { log: string; files: Record<string, string> }>();
const asked = { started: [] as JobAsk[], stopped: [] as string[], removed: [] as string[] };
let next = 1;
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

vi.mock("../../../../lib/jobs", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/jobs")>()),
  startJob: async (ask: JobAsk) => {
    asked.started.push(ask);
    const id = idOf(next++);
    jobs.set(id, { id, plugin: ask.plugin, program: ask.program, state: "waiting", created: Date.now(), log: "", files: {} });
    return id;
  },
  listJobs: async () => [...jobs.values()],
  jobOf: async (id: string) => jobs.get(id)!,
  readJobLog: async (id: string, from: number) => {
    const log = jobs.get(id)?.log ?? "";
    return { text: log.slice(from), next: log.length };
  },
  jobFiles: async (id: string) => Object.keys(jobs.get(id)?.files ?? {}),
  readJobFile: async (id: string, name: string) => jobs.get(id)!.files[name],
  stopJob: async (id: string) => void asked.stopped.push(id),
  removeJob: async (id: string) => void asked.removed.push(id),
}));

/** The xTB plugin's worker, as the test has it: what it prepared and read back, and what it was asked. */
const worker = {
  prepare: vi.fn(async (_step: string, entries: unknown[]) => ({
    jobs: entries.map((_, i) => ({ entries: [i], program: "xtb", args: ["input.xyz", "--opt", "normal"], files: [{ name: "input.xyz", text: "3\n\n" }], reads: ["xtbopt.log"] })),
  })),
  collect: vi.fn(async (_step: string, entries: { atoms: { el: string; x: number; y: number; z: number }[] }[], _o: unknown, files: Record<string, string>, _log: string, ended: string) =>
    ended !== "done"
      ? { why: "Some atoms are very close" }
      : {
          outputs: entries.map((e) => ({
            schema: 1,
            program: "xtb",
            version: "6.7.1",
            method: "GFN2-xTB",
            atoms: e.atoms.map((a) => a.el),
            frames: [e.atoms.flatMap((a) => [a.x, a.y, a.z]), e.atoms.flatMap((a) => [a.x, a.y + 0.01, a.z])],
            energies: [-5.0703, Number(files["xtbopt.log"])],
            optimised: true,
          })),
        },
  ),
};
vi.mock("../../../../lib/calc/workers", async (actual) => ({
  ...(await actual<typeof import("../../../../lib/calc/workers")>()),
  pluginClient: async () => worker,
}));

import { connectStoreToDocument, createEditorStore } from ".";
import { useReaders } from "../../../../lib/calc/workers";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { createStructureDocument, addMolecule3d } from "../document";
import { readWorkflow } from "../workflow/saved";

/** A page with water in a set, wired into a step that optimises it, done by xTB. */
function editor() {
  const doc = createStructureDocument();
  doc.edit("water", (d) =>
    addMolecule3d(d, {
      atoms: [
        { el: "O", x: 0, y: 0, z: 0 },
        { el: "H", x: 0, y: 0.76, z: 0.59 },
        { el: "H", x: 0, y: -0.76, z: 0.59 },
      ],
      bonds: [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ],
      at: { x: 0, y: 0 },
    }),
  );
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const st = () => store.getState();
  const set = st().addSet({ x0: -3, y0: -3, x1: 3, y1: 3 });
  const step = st().addStep("optimise", "xtb", 10, 0);
  st().connect({ set }, step);
  doc.markSaved();
  return { doc, st, step };
}

const settle = () => new Promise((go) => setTimeout(go, 0));

describe("a step that runs a plugin's program", () => {
  beforeEach(() => {
    jobs.clear();
    next = 1;
    asked.started = [];
    asked.stopped = [];
    asked.removed = [];
    worker.prepare.mockClear();
    worker.collect.mockClear();
    useReaders.setState({ state: { xtb: "added" }, problem: {} });
  });

  it("runs a job for its entry, apart from Meno - kept with the page, no step to undo - and brings its results in as one", async () => {
    const { doc, st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    // prepared by the plugin with what came in, its job started - with how many may run at once, and the cores each may use
    expect(worker.prepare).toHaveBeenCalledWith("optimise", [expect.objectContaining({ charge: 0, multiplicity: 1 })], { method: "gfn2", solvent: "none", level: "normal" }, expect.any(Number));
    expect(asked.started).toEqual([expect.objectContaining({ plugin: "xtb", program: "xtb", args: ["input.xyz", "--opt", "normal"], slots: 1 })]);
    const running = st().steps.find((s) => s.id === step)!.running!;
    expect(running.jobs).toEqual([{ id: idOf(1), entries: [0], reads: ["xtbopt.log"] }]);
    // (to be saved - and read back, so that a workspace opened again picks it up - but nothing to undo)
    expect(doc.history()).toMatchObject({ dirty: true, undoLabel: "wire" });
    expect(readWorkflow({ sets: st().sets, steps: st().steps, wires: st().wires })?.steps[0].running).toEqual(running);

    // its job running: the card says so, and what its log says last
    Object.assign(jobs.get(idOf(1))!, { state: "running", started: Date.now(), log: "cycle 1\n   cycle 2  \n" });
    await st().lookAtJobs();
    expect(st().jobsSeen[idOf(1)]).toMatchObject({ state: "running", line: "cycle 2" });

    // done: read back by the plugin, and brought in
    Object.assign(jobs.get(idOf(1))!, { state: "done", ended: Date.now() + 12_000, files: { "xtbopt.log": "-5.0705" } });
    await st().lookAtJobs();
    await ran;
    const after = st().steps.find((s) => s.id === step)!;
    expect(after.running).toBeUndefined();
    expect(after.ran).toMatchObject({ ok: true, jobs: [idOf(1)], said: expect.stringContaining("−5.07050 Eh") });
    const made = st().sets.find((b) => b.made?.step === step)!;
    expect(made.made).toEqual({ step, holds: "molecules" });
    // the molecule optimised: its path as its frames, ending at it, shown at its end; what the calculation was
    const m = st().molecules3d[1];
    expect(m).toMatchObject({ path: true, energies: [-5.0703, -5.0705], calc: { program: "xtb", method: "GFN2-xTB", optimised: true } });
    expect(m.frames).toHaveLength(1);
    expect(st().frames3d[m.id]).toBe(1);
    // its results one step to undo: undone, the run stays over
    expect(doc.history().undoLabel).toBe("results");
    doc.undo();
    expect(st().molecules3d).toHaveLength(1);
    expect(st().steps.find((s) => s.id === step)!.running).toBeUndefined();
  });

  it("says it was stopped, and brings nothing in", async () => {
    const { st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    st().stopStep(step);
    expect(asked.stopped).toEqual([idOf(1)]);
    Object.assign(jobs.get(idOf(1))!, { state: "stopped", started: 1000, ended: 32_000 });
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, stopped: true, said: "Stopped after 0:31" });
    expect(st().molecules3d).toHaveLength(1);
  });

  it("says why it failed, in the plugin's words", async () => {
    const { st, step } = editor();
    const ran = st().runStep(step);
    await settle();
    await settle();
    Object.assign(jobs.get(idOf(1))!, { state: "failed", started: 1000, ended: 2000, code: 1 });
    await st().lookAtJobs();
    await ran;
    expect(st().steps.find((s) => s.id === step)!.ran).toMatchObject({ ok: false, said: "Some atoms are very close" });
  });

  it("is its plugin's: its calculation changed to another the plugin does, with the options it takes for that one, those they share kept - never to one it does not", () => {
    const { st, step } = editor();
    st().updateStep(step, { options: { method: "gfn1", solvent: "water", level: "tight" } });
    // (the step's own: the defaults are Settings', and stay as they were)
    expect(useAppSettings.getState().options["step:xtb:optimise"]).toBeUndefined();
    st().updateStep(step, { kind: "frequencies" });
    const s = st().steps.find((x) => x.id === step)!;
    expect(s.kind).toBe("frequencies");
    expect(s.by).toBe("xtb");
    expect(s.options).toEqual({ method: "gfn1", solvent: "water" });
    st().updateStep(step, { kind: "duplicates" });
    expect(st().steps.find((x) => x.id === step)!.kind).toBe("frequencies");
  });

  it("asks before a running step is deleted - and, deleted, stops its jobs and takes their files away", async () => {
    const { st, step } = editor();
    void st().runStep(step);
    await settle();
    await settle();
    st().removeStep(step);
    expect(st().askDeleteStep).toBe(step);
    expect(st().steps).toHaveLength(1);
    st().removeStep(step, true);
    expect(st().steps).toHaveLength(0);
    expect(st().askDeleteStep).toBeNull();
    await settle();
    expect(asked.stopped).toEqual([idOf(1)]);
  });
});
