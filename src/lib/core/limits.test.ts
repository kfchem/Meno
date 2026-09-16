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
    expect(canvasCost("loader")).toBe(0);
    expect(canvasCost("text")).toBe(0);
    expect(canvasCost("2d")).toBe(1);
    expect(canvasCost("3d")).toBe(1);
    expect(canvasCost("structure")).toBe(1);
    // a workflow tab embeds a 2D sketch and a 3D viewer
    expect(canvasCost("node")).toBe(2);
  });

  it("ignores views without a canvas", () => {
    expect(countCanvases(withKinds("loader", "text", "pyconsole"))).toBe(0);
    expect(canOpenKind(withKinds("loader", "text"), "node")).toBe(true);
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

  it("frees the canvases of a tab being converted", () => {
    const s = withKinds(
      ...Array<TabKind>(MAX_CANVASES - 1).fill("2d"),
      "loader",
    );
    const loaderId = s.tabOrder[s.tabOrder.length - 1];
    // converting the loader into a workflow tab needs 2 canvases: one too many
    expect(canOpenKind(s, "node", loaderId)).toBe(false);
    expect(canOpenKind(s, "3d", loaderId)).toBe(true);
    // converting a 2D tab frees its own canvas first
    expect(canOpenKind(s, "2d", s.tabOrder[0])).toBe(true);
  });
});
