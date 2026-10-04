import type { TabId, TabInstance } from "../../lib/core";
import type { DocumentStore } from "../../lib/doc";
import type { ViewEntry } from "../views/registry";
import { useEffect, useRef, useState } from "react";
import { DURATION } from "../theme/motion";

type Props = {
  order: TabId[];
  tabs: Record<TabId, TabInstance>;
  activeId: TabId | null;
  resolveView: (kind: string) => Promise<ViewEntry> | ViewEntry;
  patchData: (id: TabId, patch: unknown) => void;
  /** Document for a tab, when its view kind uses one. */
  getDocument: (tab: TabInstance) => DocumentStore<any> | undefined;
  /** Names a tab anew: after the file its view was saved as. */
  renameTab: (id: TabId, label: string) => void;
};

export default function Deck({
  order,
  tabs,
  activeId,
  resolveView,
  patchData,
  getDocument,
  renameTab,
}: Props) {
  // the tab just left, kept in view beneath the chosen one while it fades in
  const [beneath, setBeneath] = useState<TabId | null>(null);
  const was = useRef(activeId);
  useEffect(() => {
    if (was.current === activeId) return;
    const left = was.current;
    was.current = activeId;
    setBeneath(left);
    const t = window.setTimeout(() => setBeneath(null), DURATION.quick * 1000 + 40);
    return () => window.clearTimeout(t);
  }, [activeId]);
  return (
    <div className="flex-1 w-full h-full relative">
      {order.map((id) => {
        const t = tabs[id];
        const active = activeId === id;
        const entry = resolveView(t.content.kind) as ViewEntry;
        return (
          <div
            key={id}
            className={
              active
                ? "absolute inset-0 flex z-10 meno-fade-in"
                : id === beneath
                  ? "absolute inset-0 flex z-0"
                  : "absolute inset-0 hidden"
            }
          >
            {entry ? (
              // (keyed by what the tab shows: a view taking its place fades in)
              <div key={t.content.kind} className="w-full h-full flex meno-fade-in">
                <entry.Component
                  tabId={id}
                  content={t.content}
                  active={active}
                  document={getDocument(t)}
                  dispatchPatchData={(patch) => patchData(id, patch)}
                  renameTab={(label) => renameTab(id, label)}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
