import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { resolveResource } from "@tauri-apps/api/path";
import { create } from "zustand";
import { ensurePyEnv, pyEnvReady, removePyEnv } from "../pyEnv";
import { READER_PLUGINS, type PythonReader, type ReaderPlugin } from "./catalog";
import { ReaderClient, type Reader } from "./client";
import { builtinReader } from "./builtin";

/**
 * The reader plugins on this computer, and their workers: a reader is
 * added - its environment set up, asking first for the network - only in
 * Settings, *Calculation readers*, and taken away there; its worker is
 * started the first time it is asked to read, then kept for the session.
 * A worker reads what it is sent and has no business on the network; the
 * app keeps it off it. A reader that comes with Meno is always added, and
 * runs in the app (./builtin).
 */
export type ReaderState = "absent" | "adding" | "added" | "removing";

export const useReaders = create<{
  /** Each reader's, by id; unknown until looked at. */
  state: Record<string, ReaderState>;
  /** What went wrong last, for a reader, in words. */
  problem: Record<string, string>;
}>(() => ({ state: {}, problem: {} }));

const setState = (id: string, state: ReaderState, problem?: string) =>
  useReaders.setState((s) => ({
    state: { ...s.state, [id]: state },
    problem: problem ? { ...s.problem, [id]: problem } : Object.fromEntries(Object.entries(s.problem).filter(([k]) => k !== id)),
  }));

/** How long a reader's first import may take. */
const READY_MS = 60_000;

const running = new Map<string, Promise<{ client: ReaderClient; id: string }>>();
const builtins = new Map<string, Reader>();

/** The readers added on this computer, looked at afresh. */
export async function addedReaders(plugins: readonly ReaderPlugin[] = READER_PLUGINS): Promise<Set<string>> {
  const added = new Set<string>();
  for (const p of plugins) {
    if (p.builtin) {
      setState(p.id, "added");
      added.add(p.id);
      continue;
    }
    const here = useReaders.getState().state[p.id];
    if (here === "adding" || here === "removing") continue;
    const ready = await pyEnvReady(p.profile);
    setState(p.id, ready ? "added" : "absent");
    if (ready) added.add(p.id);
  }
  return added;
}

/** Adds a reader: sets its environment up, asking first whether it may download. */
export async function addReader(p: PythonReader): Promise<void> {
  setState(p.id, "adding");
  try {
    await ensurePyEnv(p.profile);
    setState(p.id, "added");
  } catch (e) {
    setState(p.id, "absent", e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** Takes a reader away: its worker stopped, its environment removed. */
export async function removeReader(p: PythonReader): Promise<void> {
  setState(p.id, "removing");
  try {
    const worker = running.get(p.id);
    running.delete(p.id);
    if (worker) {
      const { client, id } = await worker.catch(() => ({ client: null, id: null }));
      client?.close();
      if (id) await invoke("ext_kill", { id }).catch(() => {});
    }
    await removePyEnv(p.profile);
    setState(p.id, "absent");
  } catch (e) {
    setState(p.id, "added", e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** A reader's worker, started the first time it is asked for; the reader must be added. */
export function readerClient(p: ReaderPlugin): Promise<Reader> {
  if (p.builtin) {
    if (!builtins.has(p.id)) builtins.set(p.id, builtinReader(p.id));
    return Promise.resolve(builtins.get(p.id)!);
  }
  let worker = running.get(p.id);
  if (!worker) {
    worker = start(p);
    running.set(p.id, worker);
    worker.catch(() => running.delete(p.id));
  }
  return worker.then((w) => w.client);
}

type Line = { id: string; line: string };

async function start(p: PythonReader): Promise<{ client: ReaderClient; id: string }> {
  if (!(await pyEnvReady(p.profile))) throw new Error(`${p.name} is not added: add it in Settings, Calculation readers.`);
  const python = await ensurePyEnv(p.profile);
  const script = await resolveResource(p.worker);
  // (heard from before the worker's id is known, so that nothing it says
  // first is missed; kept to its own lines once it is)
  let id: string | null = null;
  const early: Line[] = [];
  const onLine = new Set<(line: string) => void>();
  const hear = (m: Line) => {
    if (id === null) early.push(m);
    else if (m.id === id) onLine.forEach((f) => f(m.line));
  };
  const client = new ReaderClient(p.name, {
    send: (line) => {
      if (id !== null) void invoke("ext_stdin", { id, data: line + "\n" });
    },
    listen: (f) => {
      onLine.add(f);
      return () => onLine.delete(f);
    },
  });
  const stopOut = await listen<string>("ext:stdout", (e) => hear(JSON.parse(e.payload)));
  const stopExit = await listen<string>("ext:exit", (e) => {
    if (JSON.parse(e.payload).id !== id) return;
    client.close(`the ${p.name} reader stopped`);
    running.delete(p.id);
    stopOut();
    stopExit();
  });
  id = await invoke<string>("ext_spawn_sidecar", { payload: { entry: python, args: ["-u", script] } });
  const worker = id;
  for (const m of early.splice(0)) if (m.id === worker) onLine.forEach((f) => f(m.line));
  try {
    await Promise.race([
      client.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${p.name} did not start in time`)), READY_MS)),
    ]);
  } catch (e) {
    void invoke("ext_kill", { id: worker }).catch(() => {});
    throw e;
  }
  return { client, id: worker };
}
