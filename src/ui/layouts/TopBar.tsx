import { Reorder } from "motion/react";
import {
  XMarkIcon,
  PlusIcon,
  MinusIcon,
  StopIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useMemo, MouseEvent, useRef, useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logo from "../../assets/icon.png";
import { TabKind } from "../../lib/core";

type TabMeta = { id: string; label: string };

export type TabsController = {
  tabOrder: string[];
  tabsById: Record<string, TabMeta>;
  activeId: string | null;
  reorder: (order: string[]) => void;
  select: (id: string) => void;
  close: (id: string) => void;
  add: () => void;
  openByKind?: (kind: TabKind, opts?: { label?: string }) => void;
};

export default function TopBar({ ctl }: { ctl: TabsController }) {
  const {
    tabOrder,
    tabsById,
    activeId,
    reorder,
    select,
    close,
    add,
    openByKind,
  } = ctl;
  const draggingRef = useRef(false);
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const stop = (e: MouseEvent) => e.stopPropagation();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc as any);
    return () => document.removeEventListener("mousedown", onDoc as any);
  }, []);

  const onSelectMenu = (
    profile: "texteditor" | "pyconsole" | "node" | "structure"
  ) => {
    setMenuOpen(false);
    if (!openByKind) return;
    if (profile === "texteditor") openByKind("text", { label: "New Text" });
    if (profile === "pyconsole")
      openByKind("pyconsole", { label: "Python Console" });
    if (profile === "node") openByKind("node", { label: "Workflow Builder" });
    if (profile === "structure") openByKind("structure", { label: "Structure Canvas" });
  };

  return (
    <div
      data-tauri-drag-region
      className="w-full flex items-stretch justify-between h-10 min-h-10 bg-gh-base select-none relative"
    >
      <button
        onClick={() => {
          return;
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="h-7.5 w-7.5 flex items-center justify-center hover:bg-gray-200 rounded-lg mt-1.5 ml-1.5"
      >
        <img src={logo} alt="Meno Icon" className="h-6 w-6" />
      </button>
      <div className="h-px bg-transparent border-t border-gh-line absolute bottom-0 right-0 left-0" />

      <Reorder.Group
        axis="x"
        values={tabOrder}
        onReorder={reorder}
        className="flex h-full items-end space-x-1 flex-1 px-1.5 overflow-hidden relative"
        data-tauri-drag-region
      >
        {tabOrder.map((id) => {
          const tab = tabsById[id];
          const selected = id === activeId;
          return (
            <Reorder.Item
              key={id}
              value={id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.15 } }}
              exit={{ opacity: 0, y: 20, transition: { duration: 0.3 } }}
              className={clsx(
                "relative rounded-t-lg w-48 h-8.5 text-xs transition-colors duration-200 flex justify-between items-top0 min-w-8",
                selected
                  ? "bg-white text-gh-black border border-gh-line border-b-transparent"
                  : "bg-gh-base text-gh-gray border border-transparent"
              )}
              onDragStart={() => (draggingRef.current = true)}
              onDragEnd={() => (draggingRef.current = false)}
              onPointerDown={() => {
                if (!draggingRef.current) select(id);
              }}
              title={tab.label}
            >
              {selected ? (
                <>
                  <div className="absolute -bottom-[1px] -left-2 h-2 w-2 bg-white" />
                  <div className="absolute -bottom-[1px] -left-2 h-2 w-2 bg-gh-base rounded-br-xl border-b border-r border-gh-line" />
                  <div className="absolute -bottom-[1px] -right-2 h-2 w-2 bg-white" />
                  <div className="absolute -bottom-[1px] -right-2 h-2 w-2 bg-gh-base rounded-bl-xl border-b border-l border-gh-line" />
                </>
              ) : (
                <div className="h-px bg-transparent border-b border-gh-line absolute -bottom-[0.5px] right-0 left-0" />
              )}
              <div
                className={clsx(
                  "flex items-center w-full py-1 justify-between rounded-lg h-7 mx-0.5 px-2",
                  !selected && "hover:bg-gh-gray/10"
                )}
              >
                <span className="truncate">{tab.label}</span>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    close(id);
                  }}
                  className="h-4 w-4 rounded-full p-0.5 hover:bg-gh-line shrink-0"
                  aria-label="Close tab"
                  title="Close"
                >
                  <XMarkIcon className="w-full h-full" />
                </button>
              </div>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>

      <div className="h-full flex items-center gap-1">
        <div className="relative flex" ref={menuRef}>
          <button
            aria-label="New tab"
            onClick={add}
            onMouseDown={stop}
            className="h-7 px-2 rounded-l-md border border-gh-line bg-white hover:bg-gray-100"
          >
            <div className="flex items-center gap-1">
              <PlusIcon className="h-3 w-3" />
            </div>
          </button>
          <button
            aria-label="New…"
            title="New…"
            onMouseDown={stop}
            onClick={() => setMenuOpen((v) => !v)}
            className="h-7 px-2 rounded-r-md border border-l-0 border-gh-line bg-white hover:bg-gray-100 -ml-px"
          >
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-7 w-56 rounded-md border border-gh-line bg-white shadow-lg z-50 overflow-hidden"
              onMouseDown={stop}
            >
              <div className="py-1">
                <button
                  className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center justify-between text-sm"
                  onClick={() => onSelectMenu("texteditor")}
                >
                  <span>Text Editor</span>
                  <span className="text-xs text-gray-500">new</span>
                </button>
                <button
                  className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center justify-between text-sm"
                  onClick={() => onSelectMenu("pyconsole")}
                >
                  <span>Python Console</span>
                  <span className="text-xs text-gray-500">accel</span>
                </button>
                <button
                  className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center justify-between text-sm"
                  onClick={() => onSelectMenu("node")}
                >
                  <span>Workflow Builder</span>
                  <span className="text-xs text-gray-500">new</span>
                </button>
                <button
                  className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center justify-between text-sm"
                  onClick={() => onSelectMenu("structure")}
                >
                  <span>Structure Canvas</span>
                  <span className="text-xs text-gray-500">test</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="ml-2 h-full flex">
          <button
            aria-label="Minimize"
            title="Minimize"
            onMouseDown={stop}
            onClick={() => appWindow.minimize()}
            className="h-10 w-11 flex items-center justify-center hover:bg-gray-200"
          >
            <MinusIcon className="h-4 w-4" />
          </button>
          <button
            aria-label="Maximize"
            title="Maximize / Restore"
            onMouseDown={stop}
            onClick={() => appWindow.toggleMaximize()}
            className="h-10 w-11 flex items-center justify-center hover:bg-gray-200"
          >
            <StopIcon className="h-4 w-4" />
          </button>
          <button
            aria-label="Close"
            title="Close"
            onMouseDown={stop}
            onClick={() => appWindow.close()}
            className="h-10 w-11 flex items-center justify-center hover:bg-red-500 hover:text-white"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
