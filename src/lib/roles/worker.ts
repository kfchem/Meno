import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { resolveResource } from "@tauri-apps/api/path";
import { create } from "zustand";
import { ensurePyEnv, pyEnvReady } from "../pyEnv";
import { pluginsFilling, type PythonPlugin } from "../calc/catalog";
import { ROLES, type RoleId } from "../plugins/roles";
import { useAppSettings } from "../settings/appSettings";
import { ChemClient } from "./client";

/**
 * The worker of the plugin that fills a role (lib/plugins/roles,
 * docs/PLUGINS.md), run as a sidecar: the plugin chosen for the role where
 * it is used - else the first that fills it - set up the first time a role it
 * fills is needed, asking before it downloads, and started once, then kept
 * for the session. One the chemist took away in Settings, Plugins is not
 * set up again of itself: the role says to add it. A worker has no business
 * on the network, and the app keeps it off it.
 */

export type ChemState =
  | { state: "idle" }
  | { state: "setting-up"; plugin: string }
  | { state: "starting"; plugin: string }
  | { state: "ready"; plugin: string; version: string }
  | { state: "failed"; message: string };

export const useChem = create<ChemState>(() => ({ state: "idle" }));

/** How long a worker's first import may take: a cold start is slow. */
const READY_MS = 90_000;

/** The plugin that fills a role: the one chosen, where it fills it; else the first that does. */
export function rolePlugin(role: RoleId): PythonPlugin | undefined {
  const can = pluginsFilling(role);
  const chosen = useAppSettings.getState().plugins.roles[role];
  return can.find((p) => p.id === chosen) ?? can[0];
}

/** A role asked of a plugin the chemist took away: not a failure of it - it says to add it. */
export class TakenAway extends Error {}

/** Whether the chemist took a plugin away, so that it is not set up again of itself. */
const takenAway = (p: PythonPlugin) => useAppSettings.getState().plugins.removed.includes(p.id);

const running = new Map<string, Promise<ChemClient>>();
/** Each running plugin's sidecar, by plugin id. */
const sidecars = new Map<string, string>();

/** The worker of the plugin that fills `role`, started the first time it is asked for. */
export function chemWorker(role: RoleId = "checks"): Promise<ChemClient> {
  const plugin = rolePlugin(role);
  if (!plugin) return Promise.reject(new Error(`No plugin Meno knows of does this: ${ROLES[role].name}.`));
  let worker = running.get(plugin.id);
  if (!worker) {
    worker = start(plugin).catch((e: unknown) => {
      running.delete(plugin.id);
      const message = e instanceof Error ? e.message : String(e);
      useChem.setState(e instanceof TakenAway ? { state: "idle" } : { state: "failed", message });
      throw e;
    });
    running.set(plugin.id, worker);
  }
  return worker;
}

/**
 * Whether what fills `role` can be had without asking anything: running, or
 * set up and only to be started. What runs by itself - the checks on a
 * structure - runs only then; setting a plugin up is always something the
 * user asked for.
 */
export async function chemAtHand(role: RoleId = "checks"): Promise<boolean> {
  const plugin = rolePlugin(role);
  if (!plugin) return false;
  return running.has(plugin.id) || (await pyEnvReady(plugin.profile));
}

/** Stops a plugin's worker, where it runs: as the plugin is taken away. */
export async function stopRoleWorker(pluginId: string): Promise<void> {
  const worker = running.get(pluginId);
  running.delete(pluginId);
  const sidecar = sidecars.get(pluginId);
  sidecars.delete(pluginId);
  if (worker) await worker.then((c) => c.close(), () => undefined);
  if (sidecar) await invoke("ext_kill", { id: sidecar }).catch(() => undefined);
  // (another plugin's worker, running still, is left as it is said to be)
  if (worker || sidecar) useChem.setState({ state: "idle" });
}

type Line = { id: string; line: string };

async function start(plugin: PythonPlugin): Promise<ChemClient> {
  if (takenAway(plugin) && !(await pyEnvReady(plugin.profile))) {
    throw new TakenAway(`${plugin.name} was taken away: add it in Settings, Plugins.`);
  }
  useChem.setState({ state: "setting-up", plugin: plugin.name });
  const python = await ensurePyEnv(plugin.profile);
  useChem.setState({ state: "starting", plugin: plugin.name });
  const script = await resolveResource(plugin.worker);

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
  const client = new ChemClient(
    {
      send: (line) => {
        if (id !== null) void invoke("ext_stdin", { id, data: line + "\n" });
      },
      listen: (f) => {
        onLine.add(f);
        return () => onLine.delete(f);
      },
    },
    undefined,
    plugin.name,
  );
  const stopOut = await listen<string>("ext:stdout", (e) => hear(JSON.parse(e.payload)));
  const stopExit = await listen<string>("ext:exit", (e) => {
    if (JSON.parse(e.payload).id !== id) return;
    client.close(`${plugin.name} stopped`);
    running.delete(plugin.id);
    sidecars.delete(plugin.id);
    useChem.setState({ state: "idle" });
    stopOut();
    stopExit();
  });

  id = await invoke<string>("ext_spawn_sidecar", {
    payload: { entry: python, args: ["-u", script] },
  });
  const worker = id;
  sidecars.set(plugin.id, worker);
  for (const m of early.splice(0)) if (m.id === worker) onLine.forEach((f) => f(m.line));

  let version: string;
  try {
    version = await Promise.race([
      client.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${plugin.name} did not start in time`)), READY_MS)),
    ]);
  } catch (e) {
    void invoke("ext_kill", { id: worker }).catch(() => undefined);
    throw e;
  }
  useChem.setState({ state: "ready", plugin: plugin.name, version });
  return client;
}
