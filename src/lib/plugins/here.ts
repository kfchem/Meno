/**
 * The system Meno runs on, as a plugin's manifest names the systems it can
 * be added on (lib/plugins/manifest `systems`): a plugin whose programs are
 * built for some systems alone - CREST, for macOS and Linux - is offered
 * only on those.
 */
import { platform } from "@tauri-apps/plugin-os";
import type { System } from "./manifest";

/** The system Meno runs on; none known - outside the app, in tests - and every plugin is taken to be for it. */
export function systemHere(): System | null {
  try {
    const os = platform();
    return os === "macos" || os === "windows" || os === "linux" ? os : null;
  } catch {
    return null;
  }
}

/** Whether a plugin can be added on this system: it names none, or this one. */
export function forThisSystem(p: { systems: readonly System[] }, here: System | null = systemHere()): boolean {
  return !p.systems.length || here == null || p.systems.includes(here);
}

/** A system by the name people know it by. */
export const SYSTEM_NAMES: Record<System, string> = { macos: "macOS", windows: "Windows", linux: "Linux" };
