import { create } from "zustand";

export type SettingsSection = "style" | "style3d" | "pointer" | "chemistry" | "files" | "plugins" | "abbreviations" | "network";

/** Which part of Settings is shown: set from elsewhere to open it at one. */
export const useSettingsSection = create<{ section: SettingsSection }>(() => ({
  section: "style",
}));

export function showSettingsSection(section: SettingsSection): void {
  useSettingsSection.setState({ section });
}
