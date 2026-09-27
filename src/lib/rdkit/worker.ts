import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { resolveResource } from "@tauri-apps/api/path";
import { create } from "zustand";
import { ensurePyEnv, pyEnvReady } from "../pyEnv";
import { ChemClient } from "./client";

/**
 * The chemistry worker, run as a sidecar: RDKit's environment set up the
 * first time it is needed - asking before it downloads - and the worker
 * started, once, then kept for the session. It has no business on the
 * network, and the app keeps it off it.
 */

export type ChemState =
  | { state: "idle" }
  | { state: "setting-up" }
  | { state: "starting" }
  | { state: "ready"; rdkit: string }
  | { state: "failed"; message: string };

export const useChem = create<ChemState>(() => ({ state: "idle" }));

/** How long RDKit's first import may take: a cold start is slow. */
const READY_MS = 90_000;

let running: Promise<ChemClient> | undefined;

/** The worker, started the first time it is asked for. */
export function chemWorker(): Promise<ChemClient> {
  running ??= start().catch((e: unknown) => {
    running = undefined;
    const message = e instanceof Error ? e.message : String(e);
    useChem.setState({ state: "failed", message });
    throw e;
  });
  return running;
}

/**
 * Whether RDKit can be had without asking anything: running, or set up and
 * only to be started. What runs by itself - the checks on a structure -
 * runs only then; setting RDKit up is always something the user asked for.
 */
export async function chemAtHand(): Promise<boolean> {
  return running !== undefined || (await pyEnvReady("chem"));
}

type Line = { id: string; line: string };

async function start(): Promise<ChemClient> {
  useChem.setState({ state: "setting-up" });
  const python = await ensurePyEnv("chem");
  useChem.setState({ state: "starting" });
  const script = await resolveResource("resources/workers/chem_worker.py");

  // Heard from before the worker's id is known, so that nothing it says
  // first is missed; kept to its own lines once it is.
  let id: string | null = null;
  const early: Line[] = [];
  const onLine = new Set<(line: string) => void>();
  const hear = (m: Line) => {
    if (id === null) early.push(m);
    else if (m.id === id) onLine.forEach((f) => f(m.line));
  };
  // Nothing asks it anything before it is ready: chemWorker resolves then.
  const client = new ChemClient({
    send: (line) => {
      if (id !== null) void invoke("ext_stdin", { id, data: line + "\n" });
    },
    listen: (f) => {
      onLine.add(f);
      return () => onLine.delete(f);
    },
  });
  const stopOut = await listen<string>("ext:stdout", (e) =>
    hear(JSON.parse(e.payload)),
  );
  const stopExit = await listen<string>("ext:exit", (e) => {
    if (JSON.parse(e.payload).id !== id) return;
    client.close("the chemistry worker stopped");
    running = undefined;
    useChem.setState({ state: "idle" });
    stopOut();
    stopExit();
  });

  id = await invoke<string>("ext_spawn_sidecar", {
    payload: { entry: python, args: ["-u", script] },
  });
  const worker = id;
  for (const m of early.splice(0))
    if (m.id === worker) onLine.forEach((f) => f(m.line));

  let rdkit: string;
  try {
    rdkit = await Promise.race([
      client.ready,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("RDKit did not start in time")),
          READY_MS,
        ),
      ),
    ]);
  } catch (e) {
    void invoke("ext_kill", { id: worker }).catch(() => undefined);
    throw e;
  }
  useChem.setState({ state: "ready", rdkit });
  return client;
}
