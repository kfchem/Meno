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
import { acceptStyle3dChoice, DEFAULT_STYLE_3D_CHOICE, type Style3DChoice } from "../chem/style3d";
import { setCustomAbbreviations, structureProblem, type CustomAbbreviation } from "../chem/abbreviations";
import type { OptionValues } from "../options";

/**
 * The application's own settings: what applies to every tab unless a tab
 * says otherwise. Kept in `settings.json` in the app's data folder, and in
 * the browser's storage when Meno runs outside the app (the dev server).
 */
export type AppSettings = {
  /** The drawing style a structure is drawn in unless its document has its own. */
  drawingStyle: StyleChoice;
  /** How molecules in 3D look, and how they turn. */
  style3d: Style3DChoice;
  network: NetworkSettings;
  chemistry: ChemistrySettings;
  updates: UpdateSettings;
  /** The options last chosen for each role, by the role ("write:sdf"): what is drawn first next time (lib/options). */
  options: Record<string, OptionValues>;
  /** The user's own abbreviations, known as Meno's own are (lib/chem/abbreviations). */
  abbreviations: CustomAbbreviation[];
  /** Who reads each kind of file (Settings, Files): its reader, and those that read it as well (lib/calc/catalog `readerFor`). */
  files: FileSettings;
  /** The plugins and the roles they fill (docs/PLUGINS.md). */
  plugins: PluginSettings;
  /** The pictures a copy puts beside a structure, for other programs (StructureEditor/picture). */
  pictures: PictureSettings;
};

/** The resolutions a copied picture may be made at, in pixels to the inch. */
export const PICTURE_DPIS = [300, 600, 1200] as const;

/**
 * The pictures a copy puts beside a structure: how many pixels to the inch
 * where they are made of pixels - the picture for programs that take no
 * drawing in vectors, and molecules in 3D in any picture.
 */
export type PictureSettings = { dpi: (typeof PICTURE_DPIS)[number] };

/**
 * The plugins: those the chemist took away in Settings, Plugins - by id -
 * which are not set up again of themselves when a role they fill is
 * needed; and who fills each role, where the chemist chose (lib/plugins/roles).
 */
export type PluginSettings = {
  removed: string[];
  roles: Record<string, string>;
};

/** Who reads each kind of file, by the kind's id: its reader - unset, Meno where Meno reads it, or else the first added that reads it - and the readers that read it as well. */
export type FileSettings = {
  read: Record<string, string>;
  also: Record<string, string[]>;
};

/** Meno keeping itself up to date (lib/update). */
export type UpdateSettings = {
  /**
   * Whether Meno has asked, of its own accord, to keep itself up to date:
   * it asks once, and after that only when the user turns it on.
   */
  asked: boolean;
};

/** What the plugin that does the checks points out on a structure as it is drawn. */
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
  style3d: DEFAULT_STYLE_3D_CHOICE,
  network: { offline: false, granted: [] },
  chemistry: { valenceWarnings: true, stereoLabels: false },
  updates: { asked: false },
  options: {},
  abbreviations: [],
  files: { read: {}, also: {} },
  plugins: { removed: [], roles: {} },
  pictures: { dpi: 600 },
};

/** The file's layout; bumped when it changes in a way old files need reading round. */
const FORMAT = 1;

/** Settings from what the file holds; anything unreadable falls back to its default. */
export function acceptAppSettings(raw: unknown): AppSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_APP_SETTINGS;
  const r = raw as Record<string, unknown>;
  return {
    drawingStyle: acceptStyleChoice(r.drawingStyle),
    style3d: acceptStyle3dChoice(r.style3d),
    network: acceptNetwork(r.network),
    chemistry: acceptChemistry(r.chemistry),
    updates: acceptUpdates(r.updates),
    options: acceptOptions(r.options),
    abbreviations: acceptAbbreviations(r.abbreviations),
    files: acceptFiles(r.files, r.calcReaders),
    plugins: acceptPlugins(r.plugins),
    pictures: acceptPictures(r.pictures),
  };
}

function acceptPictures(raw: unknown): PictureSettings {
  const dpi = (raw as { dpi?: unknown } | null)?.dpi;
  return PICTURE_DPIS.includes(dpi as PictureSettings["dpi"]) ? { dpi: dpi as PictureSettings["dpi"] } : DEFAULT_APP_SETTINGS.pictures;
}

const ID = /^[a-z0-9-]{1,40}$/;

/**
 * Who reads each kind, as the file holds it: a kind's id to a reader's, and
 * to the readers that read it as well. A file from before (`calcReaders`,
 * a kind's id to the reader chosen for it) is read as the readers chosen.
 */
function acceptFiles(raw: unknown, before: unknown): FileSettings {
  const read: Record<string, string> = {};
  const also: Record<string, string[]> = {};
  const entries = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.entries(v) : []);
  for (const [kind, reader] of entries((before as { chosen?: unknown } | null)?.chosen)) {
    if (ID.test(kind) && typeof reader === "string" && ID.test(reader)) read[kind] = reader;
  }
  const f = raw as { read?: unknown; also?: unknown } | null;
  for (const [kind, reader] of entries(f?.read)) {
    if (ID.test(kind) && typeof reader === "string" && ID.test(reader)) read[kind] = reader;
  }
  for (const [kind, readers] of entries(f?.also)) {
    const ids = Array.isArray(readers) ? [...new Set(readers.filter((r): r is string => typeof r === "string" && ID.test(r)))] : [];
    if (ID.test(kind) && ids.length) also[kind] = ids;
  }
  return { read, also };
}

/** The plugins taken away, and the roles' choices, that read: ids only. */
function acceptPlugins(raw: unknown): PluginSettings {
  const r = (raw ?? {}) as { removed?: unknown; roles?: unknown };
  const id = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(v);
  const removed = Array.isArray(r.removed) ? [...new Set(r.removed.filter(id))] : [];
  const roles: Record<string, string> = {};
  if (r.roles && typeof r.roles === "object" && !Array.isArray(r.roles)) {
    for (const [role, plugin] of Object.entries(r.roles)) if (id(role) && id(plugin)) roles[role] = plugin;
  }
  return { removed, roles };
}

/** The options remembered that read: by a role's name, each a value that is a string, a number or a switch. Whether each still fits its option is asked when it is drawn (lib/options `valuesOf`). */
function acceptOptions(raw: unknown): Record<string, OptionValues> {
  const out: Record<string, OptionValues> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [role, given] of Object.entries(raw)) {
    if (!/^[a-z0-9:-]{1,60}$/.test(role) || !given || typeof given !== "object" || Array.isArray(given)) continue;
    const values: OptionValues = {};
    for (const [id, v] of Object.entries(given)) {
      const fits = typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 500);
      if (/^[a-zA-Z0-9_-]{1,40}$/.test(id) && fits) values[id] = v;
    }
    out[role] = values;
  }
  return out;
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
  setStyle3d: (choice: Style3DChoice) => void;
  setNetwork: (network: NetworkSettings) => void;
  setChemistry: (chemistry: ChemistrySettings) => void;
  setUpdates: (updates: UpdateSettings) => void;
  /** Remembers the options chosen for a role. */
  rememberOptions: (role: string, values: OptionValues) => void;
  setAbbreviations: (abbreviations: CustomAbbreviation[]) => void;
  setFiles: (files: FileSettings) => void;
  setPlugins: (plugins: PluginSettings) => void;
  setPictures: (pictures: PictureSettings) => void;
};

/** How long after the last change the file is written. */
const SAVE_DELAY_MS = 400;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useAppSettings = create<SettingsState>((set, get) => {
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { drawingStyle, style3d, network, chemistry, updates, options, abbreviations, files, plugins, pictures } = get();
      writeSettingsText(
        settingsFileText({ drawingStyle, style3d, network, chemistry, updates, options, abbreviations, files, plugins, pictures }),
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
    setStyle3d: (style3d) => {
      set({ style3d });
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
    setFiles: (files) => {
      set({ files });
      scheduleSave();
    },
    setPlugins: (plugins) => {
      set({ plugins });
      scheduleSave();
    },
    setPictures: (pictures) => {
      set({ pictures });
      scheduleSave();
    },
    setUpdates: (updates) => {
      set({ updates });
      scheduleSave();
    },
    rememberOptions: (role, values) => {
      set({ options: { ...get().options, [role]: values } });
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
