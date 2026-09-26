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
      network: { offline: true, granted: ["python-env:console"] },
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
