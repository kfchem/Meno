import { describe, expect, it } from "vitest";
import { STYLE_3D } from "../../../lib/chem/style3d";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { currentStyle3D } from "./style3d";

describe("the 3D style molecules are drawn in", () => {
  it("is the app's, from Settings, and follows it as it changes", () => {
    const was = useAppSettings.getState().style3d;
    expect(currentStyle3D()).toEqual(STYLE_3D);
    useAppSettings.setState({ style3d: { preset: "glossy", changes: { ballScale: 0.3 } } });
    expect(currentStyle3D().ballScale).toBe(0.3);
    expect(currentStyle3D().bondColor).toBe("#6b7280");
    // (one look for one choice)
    expect(currentStyle3D()).toBe(currentStyle3D());
    useAppSettings.setState({ style3d: was });
    expect(currentStyle3D()).toEqual(STYLE_3D);
  });
});
