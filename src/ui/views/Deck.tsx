import type { TabId, TabInstance } from "../../lib/core";
import type { ViewEntry } from "../views/registry";

type Props = {
  order: TabId[];
  tabs: Record<TabId, TabInstance>;
  activeId: TabId | null;
  resolveView: (kind: string) => Promise<ViewEntry> | ViewEntry;
  patchData: (id: TabId, patch: unknown) => void;
  replaceData: (id: TabId, next: unknown) => void;
};

export default function Deck({
  order,
  tabs,
  activeId,
  resolveView,
  patchData,
  replaceData,
}: Props) {
  return (
    <div className="flex-1 w-full h-full relative">
      {order.map((id) => {
        const t = tabs[id];
        const active = activeId === id;
        const entry = resolveView(t.content.kind) as ViewEntry;
        return (
          <div
            key={id}
            className={active ? "absolute inset-0 flex" : "absolute inset-0 hidden"}
          >
            {entry ? (
              <entry.Component
                tabId={id}
                content={t.content}
                active={active}
                dispatchPatchData={(patch) => patchData(id, patch)}
                replaceContent={(next) => replaceData(id, next)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
