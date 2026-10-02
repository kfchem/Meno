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
import { setCustomAbbreviations, structureProblem, type CustomAbbreviation } from "../chem/abbreviations";

/**
 * The application's own settings: what applies to every tab unless a tab
 * says otherwise. Kept in `settings.json` in the app's data folder, and in
 * the browser's storage when Meno runs outside the app (the dev server).
 */
export type AppSettings = {
  /** The drawing style a structure is drawn in unless its document has its own. */
  drawingStyle: StyleChoice;
  network: NetworkSettings;
  chemistry: ChemistrySettings;
  updates: UpdateSettings;
  /** The user's own abbreviations, known as Meno's own are (lib/chem/abbreviations). */
  abbreviations: CustomAbbreviation[];
};

/** Meno keeping itself up to date (lib/update). */
export type UpdateSettings = {
  /**
   * Whether Meno has asked, of its own accord, to keep itself up to date:
   * it asks once, and after that only when the user turns it on.
   */
  asked: boolean;
};

/** What RDKit points out on a structure as it is drawn. */
export type ChemistrySettings = {
  /** Atoms with more bonds than they can have. */
  valenceWarnings: boolean;
  /** R and S at stereocentres, E and Z at double bonds. */
  stereoLabels: boolean;
};

export type NetworkSettings = {
  /** Nothing leaves the computer. */
  offline: boolean;
  /** The purposes the user has allowed to use the network. */
  granted: string[];
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  drawingStyle: DEFAULT_STYLE_CHOICE,
  network: { offline: false, granted: [] },
  chemistry: { valenceWarnings: true, stereoLabels: false },
  updates: { asked: false },
  abbreviations: [],
};

/** The file's layout; bumped when it changes in a way old files need reading round. */
const FORMAT = 1;

/** Settings from what the file holds; anything unreadable falls back to its default. */
export function acceptAppSettings(raw: unknown): AppSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_APP_SETTINGS;
  const r = raw as Record<string, unknown>;
  return {
    drawingStyle: acceptStyleChoice(r.drawingStyle),
    network: acceptNetwork(r.network),
    chemistry: acceptChemistry(r.chemistry),
    updates: acceptUpdates(r.updates),
    abbreviations: acceptAbbreviations(r.abbreviations),
  };
}

/** The user's abbreviations the file holds that read: a label, a name, other names and a structure Meno reads. */
function acceptAbbreviations(raw: unknown): CustomAbbreviation[] {
  if (!Array.isArray(raw)) return [];
  const text = (v: unknown, most: number) => (typeof v === "string" && v.trim() && v.length <= most ? v.trim() : null);
  const out: CustomAbbreviation[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const label = text(r.label, 24);
    const smiles = text(r.smiles, 500);
    if (!label || /\s/.test(label) || !smiles || structureProblem(smiles)) continue;
    const also = Array.isArray(r.also) ? r.also.map((a) => text(a, 24)).filter((a): a is string => !!a && !/\s/.test(a)) : [];
    out.push({ label, smiles, name: text(r.name, 200) ?? "", ...(also.length ? { also } : {}) });
  }
  return out;
}

function acceptUpdates(raw: unknown): UpdateSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_APP_SETTINGS.updates;
  return { asked: (raw as Record<string, unknown>).asked === true };
}

function acceptChemistry(raw: unknown): ChemistrySettings {
  const d = DEFAULT_APP_SETTINGS.chemistry;
  if (typeof raw !== "object" || raw === null) return d;
  const { valenceWarnings, stereoLabels } = raw as Record<string, unknown>;
  return {
    valenceWarnings:
      typeof valenceWarnings === "boolean" ? valenceWarnings : d.valenceWarnings,
    stereoLabels:
      typeof stereoLabels === "boolean" ? stereoLabels : d.stereoLabels,
  };
}

function acceptNetwork(raw: unknown): NetworkSettings {
  if (typeof raw !== "object" || raw === null)
    return DEFAULT_APP_SETTINGS.network;
  const { offline, granted } = raw as Record<string, unknown>;
  return {
    offline: offline === true,
    granted: Array.isArray(granted)
      ? [
          ...new Set(
            granted.filter(
              (p): p is string =>
                typeof p === "string" && /^[a-z0-9:-]{1,64}$/.test(p),
            ),
          ),
        ]
      : [],
  };
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
  setNetwork: (network: NetworkSettings) => void;
  setChemistry: (chemistry: ChemistrySettings) => void;
  setUpdates: (updates: UpdateSettings) => void;
  setAbbreviations: (abbreviations: CustomAbbreviation[]) => void;
};

/** How long after the last change the file is written. */
const SAVE_DELAY_MS = 400;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useAppSettings = create<SettingsState>((set, get) => {
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { drawingStyle, network, chemistry, updates, abbreviations } = get();
      writeSettingsText(
        settingsFileText({ drawingStyle, network, chemistry, updates, abbreviations }),
      ).then(
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
    setNetwork: (network) => {
      set({ network });
      scheduleSave();
    },
    setChemistry: (chemistry) => {
      set({ chemistry });
      scheduleSave();
    },
    setUpdates: (updates) => {
      set({ updates });
      scheduleSave();
    },
    setAbbreviations: (abbreviations) => {
      setCustomAbbreviations(abbreviations);
      set({ abbreviations });
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
      setCustomAbbreviations(settings.abbreviations);
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
