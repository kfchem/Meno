import { describe, expect, it } from "vitest";
import {
  acceptAppSettings,
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  settingsFileText,
  useAppSettings,
} from "./appSettings";

describe("the settings file", () => {
  it("reads back what it wrote", () => {
    const settings = {
      drawingStyle: { preset: "rsc", changes: { ends: "round" as const } },
      style3d: { preset: "glossy", changes: { bondRadius: 0.15 } },
      network: { offline: true, granted: ["python-env:console"] },
      chemistry: { valenceWarnings: false, stereoLabels: true },
      updates: { asked: true },
      options: { "write:sdf": { version: "V3000", frames: "all" }, export: { kind: "sdf" } },
      abbreviations: [{ label: "Mmt", name: "4-methoxytrityl", smiles: "*C(c1ccccc1)(c1ccccc1)c1ccc(OC)cc1", also: ["MMTr"] }],
      calcReaders: { chosen: { orca: "cclib" } },
    };
    const text = settingsFileText(settings);
    expect(JSON.parse(text).format).toBe(1);
    expect(acceptAppSettings(JSON.parse(text))).toEqual(settings);
  });

  it("falls back to the defaults for what it cannot read", () => {
    expect(acceptAppSettings(null)).toBe(DEFAULT_APP_SETTINGS);
    expect(acceptAppSettings({ drawingStyle: 5 })).toEqual(DEFAULT_APP_SETTINGS);
    // offline only when it says so; a purpose only when it is one
    expect(
      acceptAppSettings({
        network: { offline: "yes", granted: ["python-env:console", "x y", 3, "python-env:console"] },
      }).network,
    ).toEqual({ offline: false, granted: ["python-env:console"] });
    // a file from before there were chemistry settings, or a setting mangled
    expect(
      acceptAppSettings({ chemistry: { stereoLabels: "on" } }).chemistry,
    ).toEqual({ valenceWarnings: true, stereoLabels: false });
    // a file from before calculation readers: none chosen; a choice that is not a name, left out
    expect(acceptAppSettings({}).calcReaders).toEqual({ chosen: {} });
    expect(acceptAppSettings({ calcReaders: { chosen: { orca: "cclib", gaussian: 3, "x y": "cclib" } } }).calcReaders).toEqual({ chosen: { orca: "cclib" } });
    // a file from before molecules in 3D had a look of their own: Meno's
    expect(acceptAppSettings({ drawingStyle: { preset: "rsc", changes: {} } }).style3d).toEqual(DEFAULT_APP_SETTINGS.style3d);
    // the options remembered: by a role, each value a string, a number or a switch; whether it fits is asked when drawn
    expect(acceptAppSettings({}).options).toEqual({});
    expect(
      acceptAppSettings({ options: { "write:mol": { version: "V3000", scale: 2, x: null, "a b": 1 }, "Bad Role": { a: 1 }, export: "sdf" } }).options,
    ).toEqual({ "write:mol": { version: "V3000", scale: 2 } });
    // a file from before Meno updated itself: not asked yet
    expect(acceptAppSettings({ updates: { asked: "yes" } }).updates).toEqual({ asked: false });
    // the user's abbreviations: those with a label and a structure that reads
    expect(
      acceptAppSettings({
        abbreviations: [
          { label: "Mmt", smiles: "*C" },
          { label: "two words", smiles: "*C" },
          { label: "Xx", smiles: "C" },
          { label: "Yy", smiles: "*C?" },
          "Zz",
        ],
      }).abbreviations,
    ).toEqual([{ label: "Mmt", smiles: "*C", name: "" }]);
  });

  it("loads the defaults where there is no file, and says it has loaded", async () => {
    await loadAppSettings();
    expect(useAppSettings.getState()).toMatchObject({
      ...DEFAULT_APP_SETTINGS,
      loaded: true,
      error: null,
    });
  });
});
