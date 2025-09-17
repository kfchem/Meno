export type TabId = string;

export type TabMeta = {
  id: TabId;
  label: string;
  icon?: string;
  dirty?: boolean;
};

export type TabKind =
  | "loader"
  | "3d"
  | "2d"
  | "text"
  | "settings"
  | "pyconsole"
  | "node"
  | "structure";

export type TabContentBase = {
  kind: TabKind;
  data?: unknown;
};

export type TabInstance = {
  meta: TabMeta;
  content: TabContentBase;
};

export type State = {
  tabOrder: TabId[];
  mountOrder: TabId[]; // stable internal rendering order (never changes on reorder)
  tabsById: Record<TabId, TabInstance>;
  activeId: TabId | null;
};

export type Action =
  | { type: "ADD_TAB"; tab: TabInstance }
  | { type: "CLOSE_TAB"; id: TabId }
  | { type: "SELECT_TAB"; id: TabId }
  | { type: "REORDER"; order: TabId[] }
  | { type: "SET_CONTENT"; id: TabId; content: TabContentBase }
  | { type: "PATCH_DATA"; id: TabId; patch: unknown }
  | { type: "RENAME_TAB"; id: TabId; label: string }
  | { type: "SET_DIRTY"; id: TabId; dirty: boolean };
