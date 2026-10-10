import { describe, expect, it } from "vitest";
import { reducer } from "./state";
import {
  canOpenKind,
  canvasCost,
  countCanvases,
  MAX_CANVASES,
} from "./limits";
import type { State, TabInstance, TabKind } from "./types";

const tab = (id: string, kind: TabKind): TabInstance => ({
  meta: { id, label: id },
  content: { kind },
});

function withKinds(...kinds: TabKind[]): State {
  let s: State = { tabOrder: [], mountOrder: [], tabsById: {}, activeId: null };
  kinds.forEach((kind, i) =>
    (s = reducer(s, { type: "ADD_TAB", tab: tab(`t${i}`, kind) })));
  return s;
}

describe("canvas budget", () => {
  it("counts canvases per view kind", () => {
    expect(canvasCost("settings")).toBe(0);
    expect(canvasCost("workspace")).toBe(1);
  });

  it("ignores views without a canvas", () => {
    expect(countCanvases(withKinds("settings"))).toBe(0);
    expect(canOpenKind(withKinds("settings"), "workspace")).toBe(true);
  });

  it("allows filling the budget exactly", () => {
    const s = withKinds(...Array<TabKind>(MAX_CANVASES - 1).fill("workspace"));
    expect(countCanvases(s)).toBe(MAX_CANVASES - 1);
    expect(canOpenKind(s, "workspace")).toBe(true);
    expect(canOpenKind(withKinds(...Array<TabKind>(MAX_CANVASES).fill("workspace")), "workspace")).toBe(false);
  });

  it("refuses to exceed the budget", () => {
    const full = withKinds(...Array<TabKind>(MAX_CANVASES).fill("workspace"));
    expect(canOpenKind(full, "workspace")).toBe(false);
    expect(canOpenKind(full, "settings")).toBe(true);
  });

  it("frees the canvases of a tab being replaced", () => {
    const s = withKinds(
      ...Array<TabKind>(MAX_CANVASES - 1).fill("workspace"),
      "workspace",
    );
    const blankId = s.tabOrder[s.tabOrder.length - 1];
    // a canvas in place of a canvas: its own freed first
    expect(canOpenKind(s, "workspace", blankId)).toBe(true);
    // in place of a tab with none, one too many
    const settings = withKinds(...Array<TabKind>(MAX_CANVASES).fill("workspace"), "settings");
    expect(canOpenKind(settings, "workspace", settings.tabOrder[MAX_CANVASES])).toBe(false);
  });
});
