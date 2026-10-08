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
    expect(canvasCost("2d")).toBe(1);
    expect(canvasCost("structure")).toBe(1);
  });

  it("ignores views without a canvas", () => {
    expect(countCanvases(withKinds("settings", "pyconsole"))).toBe(0);
    expect(canOpenKind(withKinds("settings", "pyconsole"), "structure")).toBe(true);
  });

  it("allows filling the budget exactly", () => {
    const s = withKinds(...Array<TabKind>(MAX_CANVASES - 1).fill("2d"));
    expect(countCanvases(s)).toBe(MAX_CANVASES - 1);
    expect(canOpenKind(s, "structure")).toBe(true);
    expect(canOpenKind(withKinds(...Array<TabKind>(MAX_CANVASES).fill("2d")), "structure")).toBe(false);
  });

  it("refuses to exceed the budget", () => {
    const full = withKinds(...Array<TabKind>(MAX_CANVASES).fill("2d"));
    expect(canOpenKind(full, "2d")).toBe(false);
    expect(canOpenKind(full, "settings")).toBe(true);
  });

  it("frees the canvases of a tab being replaced", () => {
    const s = withKinds(
      ...Array<TabKind>(MAX_CANVASES - 1).fill("2d"),
      "structure",
    );
    const blankId = s.tabOrder[s.tabOrder.length - 1];
    // a canvas in place of a canvas: its own freed first
    expect(canOpenKind(s, "structure", blankId)).toBe(true);
    // in place of a tab with none, one too many
    const settings = withKinds(...Array<TabKind>(MAX_CANVASES).fill("2d"), "settings");
    expect(canOpenKind(settings, "structure", settings.tabOrder[MAX_CANVASES])).toBe(false);
    // a 2D tab in place of another frees its own canvas first
    expect(canOpenKind(s, "2d", s.tabOrder[0])).toBe(true);
  });
});
