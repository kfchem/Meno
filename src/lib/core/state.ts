import type { State, Action } from "./types";

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_TAB": {
      const t = action.tab;
      return {
        ...state,
        tabOrder: [...state.tabOrder, t.meta.id],
        mountOrder: [...state.mountOrder, t.meta.id],
        tabsById: { ...state.tabsById, [t.meta.id]: t },
        activeId: t.meta.id,
      };
    }
    case "CLOSE_TAB": {
      const id = action.id;
      const idx = state.tabOrder.indexOf(id);
      if (idx < 0) return state;
      const order = state.tabOrder.filter((x) => x !== id);
      const morder = state.mountOrder.filter((x) => x !== id);
      const { [id]: _, ...rest } = state.tabsById;
      const next =
        state.activeId === id
          ? order[idx] ?? order[idx - 1] ?? null
          : state.activeId;
      return {
        ...state,
        tabOrder: order,
        mountOrder: morder,
        tabsById: rest,
        activeId: next,
      };
    }
    case "SELECT_TAB":
      return { ...state, activeId: action.id };
    case "REORDER":
      return {
        ...state,
        tabOrder: action.order.filter((id) => id in state.tabsById),
      };
    case "SET_CONTENT": {
      if (!state.tabsById[action.id]) return state;
      const t = state.tabsById[action.id];
      if (!t) return state;
      return {
        ...state,
        tabsById: {
          ...state.tabsById,
          [action.id]: { ...t, content: action.content },
        },
      };
    }
    case "PATCH_DATA": {
      if (!state.tabsById[action.id]) return state;
      const t = state.tabsById[action.id];
      if (!t) return state;
      const data = { ...(t.content.data as any), ...(action.patch as any) };
      return {
        ...state,
        tabsById: {
          ...state.tabsById,
          [action.id]: { ...t, content: { ...t.content, data } },
        },
      };
    }
    // removed PATCH_VIEWSTATE: view-specific ephemeral state should live locally in views for now
    case "RENAME_TAB": {
      const t = state.tabsById[action.id];
      if (!t) return state;
      return {
        ...state,
        tabsById: {
          ...state.tabsById,
          [action.id]: { ...t, meta: { ...t.meta, label: action.label } },
        },
      };
    }
    case "SET_DIRTY": {
      if (!state.tabsById[action.id]) return state;
      const t = state.tabsById[action.id];
      if (!t) return state;
      return {
        ...state,
        tabsById: {
          ...state.tabsById,
          [action.id]: { ...t, meta: { ...t.meta, dirty: action.dirty } },
        },
      };
    }
    default:
      return state;
  }
}

export const createInitialState = (): State => {
  const a = crypto.randomUUID();
  return {
    tabOrder: [a],
    mountOrder: [a],
    tabsById: {
      [a]: {
        meta: { id: a, label: "New Tab" },
        content: { kind: "loader" },
      },
    },
    activeId: a,
  };
};
