import type { State, TabKind } from "./types";

/**
 * Every live WebGL canvas is one browser graphics context. Browsers keep only
 * about 16 and silently drop the oldest, which blanks whichever view owned it,
 * so views are budgeted by the number of canvases they mount.
 */
export const CANVASES_PER_KIND: Partial<Record<TabKind, number>> = {
  "2d": 1,
  "3d": 1,
  structure: 1,
  // A workflow node graph embeds a 2D sketch canvas and a 3D viewer.
  node: 2,
};

export const MAX_CANVASES = 16;

export function canvasCost(kind: TabKind | string): number {
  return CANVASES_PER_KIND[kind as TabKind] ?? 0;
}

export function countCanvases(state: State): number {
  return state.tabOrder.reduce(
    (n, id) => n + canvasCost(state.tabsById[id]?.content.kind ?? "loader"),
    0,
  );
}

/**
 * Whether a tab of `kind` fits in the budget. `replacingTabId` is the tab that
 * would be converted (its current canvases are freed by the change).
 */
export function canOpenKind(
  state: State,
  kind: TabKind | string,
  replacingTabId?: string,
): boolean {
  const freed = replacingTabId
    ? canvasCost(state.tabsById[replacingTabId]?.content.kind ?? "loader")
    : 0;
  return countCanvases(state) - freed + canvasCost(kind) <= MAX_CANVASES;
}

export const TOO_MANY_CANVASES = `Too many graphics views are open (limit ${MAX_CANVASES} canvases). Close a 2D, 3D or Workflow tab first.`;
