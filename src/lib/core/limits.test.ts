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
    expect(canvasCost("text")).toBe(0);
    expect(canvasCost("2d")).toBe(1);
    expect(canvasCost("3d")).toBe(1);
    expect(canvasCost("structure")).toBe(1);
    // a workflow tab embeds a 2D sketch and a 3D viewer
    expect(canvasCost("node")).toBe(2);
  });

  it("ignores views without a canvas", () => {
    expect(countCanvases(withKinds("settings", "text", "pyconsole"))).toBe(0);
    expect(canOpenKind(withKinds("settings", "text"), "node")).toBe(true);
  });

  it("allows filling the budget exactly", () => {
    const s = withKinds(...Array<TabKind>(MAX_CANVASES - 1).fill("2d"));
    expect(countCanvases(s)).toBe(MAX_CANVASES - 1);
    expect(canOpenKind(s, "3d")).toBe(true);
    expect(canOpenKind(s, "node")).toBe(false);
  });

  it("refuses to exceed the budget", () => {
    const full = withKinds(...Array<TabKind>(MAX_CANVASES).fill("2d"));
    expect(canOpenKind(full, "2d")).toBe(false);
    expect(canOpenKind(full, "text")).toBe(true);
  });

  it("frees the canvases of a tab being replaced", () => {
    const s = withKinds(
      ...Array<TabKind>(MAX_CANVASES - 1).fill("2d"),
      "structure",
    );
    const blankId = s.tabOrder[s.tabOrder.length - 1];
    // a workflow tab in place of a canvas needs 2 canvases: one too many
    expect(canOpenKind(s, "node", blankId)).toBe(false);
    expect(canOpenKind(s, "3d", blankId)).toBe(true);
    // a 2D tab in place of another frees its own canvas first
    expect(canOpenKind(s, "2d", s.tabOrder[0])).toBe(true);
  });
});
