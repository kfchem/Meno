import { isTauri } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { create } from "zustand";
import { DEFAULT_STYLE_CHOICE, type StyleChoice } from "../chem/style";
import { acceptStyleChoice } from "../chem/styleFields";

/**
 * The application's own settings: what applies to every tab unless a tab
 * says otherwise. Kept in `settings.json` in the app's data folder, and in
 * the browser's storage when Meno runs outside the app (the dev server).
 */
export type AppSettings = {
  /** The drawing style a structure is drawn in unless its document has its own. */
  drawingStyle: StyleChoice;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  drawingStyle: DEFAULT_STYLE_CHOICE,
};

/** The file's layout; bumped when it changes in a way old files need reading round. */
const FORMAT = 1;

/** Settings from what the file holds; anything unreadable falls back to its default. */
export function acceptAppSettings(raw: unknown): AppSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_APP_SETTINGS;
  const r = raw as Record<string, unknown>;
  return { drawingStyle: acceptStyleChoice(r.drawingStyle) };
}

export function settingsFileText(settings: AppSettings): string {
  return JSON.stringify({ format: FORMAT, ...settings }, null, 2) + "\n";
}

const FILE = "settings.json";
const STORAGE_KEY = "meno.settings";

async function readSettingsText(): Promise<string | null> {
  if (isTauri()) {
    const there = await exists(FILE, { baseDir: BaseDirectory.AppData });
    return there
      ? readTextFile(FILE, { baseDir: BaseDirectory.AppData })
      : null;
  }
  return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
}

async function writeSettingsText(text: string): Promise<void> {
  if (isTauri()) {
    // The folder is there once the app has run, but not on a first launch.
    await mkdir(await appDataDir(), { recursive: true }).catch(() => undefined);
    await writeTextFile(FILE, text, { baseDir: BaseDirectory.AppData });
    return;
  }
  globalThis.localStorage?.setItem(STORAGE_KEY, text);
}

type SettingsState = AppSettings & {
  /** False until the saved settings have been read. */
  loaded: boolean;
  /** What went wrong reading or writing the file, if anything. */
  error: string | null;
  setDrawingStyle: (choice: StyleChoice) => void;
};

/** How long after the last change the file is written. */
const SAVE_DELAY_MS = 400;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useAppSettings = create<SettingsState>((set, get) => {
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { drawingStyle } = get();
      writeSettingsText(settingsFileText({ drawingStyle })).then(
        () => set({ error: null }),
        (e) => set({ error: `Settings could not be saved: ${String(e)}` }),
      );
    }, SAVE_DELAY_MS);
  };
  return {
    ...DEFAULT_APP_SETTINGS,
    loaded: false,
    error: null,
    setDrawingStyle: (drawingStyle) => {
      set({ drawingStyle });
      scheduleSave();
    },
  };
});

let loading: Promise<void> | undefined;

/** Reads the saved settings into the store, once. */
export function loadAppSettings(): Promise<void> {
  loading ??= readSettingsText()
    .then((text) => {
      const settings = text
        ? acceptAppSettings(JSON.parse(text))
        : DEFAULT_APP_SETTINGS;
      useAppSettings.setState({ ...settings, loaded: true });
    })
    .catch((e) =>
      useAppSettings.setState({
        loaded: true,
        error: `Settings could not be read, so the defaults are in use: ${String(e)}`,
      }),
    );
  return loading;
}
