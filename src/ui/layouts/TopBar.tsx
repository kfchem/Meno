import { AnimatePresence, Reorder, motion } from "motion/react";
import { DURATION, EASE, FADE, LEAVE } from "../theme/motion";
import {
  XMarkIcon,
  PlusIcon,
  MinusIcon,
  StopIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useMemo, MouseEvent, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TabKind } from "../../lib/core";
import { shortcutLabel } from "../../lib/doc/shortcuts";
import OfflineToggle from "../network/OfflineToggle";
import MenoMenu from "./MenoMenu";

type TabMeta = { id: string; label: string; dirty?: boolean };

export type TabsController = {
  tabOrder: string[];
  tabsById: Record<string, TabMeta>;
  activeId: string | null;
  reorder: (order: string[]) => void;
  select: (id: string) => void;
  close: (id: string) => void;
  add: () => void;
  openByKind?: (kind: TabKind, opts?: { label?: string }) => void;
  /** Files picked in the system's dialog, each opened in a tab (Open…). */
  openFiles: () => void;
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

  return (
    <div
      data-tauri-drag-region
      className="w-full flex items-stretch justify-between h-10 min-h-10 bg-gh-base select-none relative"
    >
      <MenoMenu own={[{ title: "File", items: [{ name: "Open…", keys: shortcutLabel("O"), run: ctl.openFiles }] }]} />
      <div className="h-px bg-transparent border-t border-gh-line absolute bottom-0 right-0 left-0" />

      <Reorder.Group
        axis="x"
        values={tabOrder}
        onReorder={reorder}
        className="flex h-full items-end space-x-1 flex-1 px-1.5 overflow-hidden relative"
        data-tauri-drag-region
      >
        {/* A tab comes in rising, and closed goes the same way, the others
            closing up after it. */}
        <AnimatePresence initial={false}>
        {tabOrder.map((id) => {
          const tab = tabsById[id];
          const selected = id === activeId;
          return (
            <Reorder.Item
              key={id}
              value={id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE } }}
              exit={{ opacity: 0, y: 20, transition: LEAVE }}
              // Chosen or not, a tab goes over in the same time and the same
              // way as its curved corners, which are drawn beside it: the
              // two change together, never one ahead of the other.
              className={clsx(
                "relative rounded-t-lg w-48 h-8.5 text-xs flex justify-between items-top0 min-w-8 transition-[background-color,border-color,color] duration-150 ease-meno",
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
              {/* the curved corners of the chosen tab, and the line under one
                  not chosen: both always there, one or the other seen */}
              <div className={clsx("transition-opacity duration-150 ease-meno", selected ? "opacity-100" : "opacity-0")}>
                <div className="absolute -bottom-[1px] -left-2 h-2 w-2 bg-white" />
                <div className="absolute -bottom-[1px] -left-2 h-2 w-2 bg-gh-base rounded-br-xl border-b border-r border-gh-line" />
                <div className="absolute -bottom-[1px] -right-2 h-2 w-2 bg-white" />
                <div className="absolute -bottom-[1px] -right-2 h-2 w-2 bg-gh-base rounded-bl-xl border-b border-l border-gh-line" />
              </div>
              <div
                className={clsx(
                  "h-px bg-transparent border-b border-gh-line absolute -bottom-[0.5px] right-0 left-0 transition-opacity duration-150 ease-meno",
                  selected ? "opacity-0" : "opacity-100",
                )}
              />
              <div
                className={clsx(
                  "flex items-center w-full py-1 justify-between rounded-lg h-7 mx-0.5 px-2 transition-colors duration-150 ease-meno",
                  !selected && "hover:bg-gh-gray/10"
                )}
              >
                <span className="truncate">
                  <AnimatePresence initial={false}>
                    {tab.dirty && (
                      <motion.span
                        key="dirty"
                        {...FADE}
                        className="mr-1 text-gh-gray"
                        aria-label="Unsaved changes"
                        title="Unsaved changes"
                      >
                        ●
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {tab.label}
                </span>
                <button
                  // Closing on the press made a tab easy to lose while
                  // reaching to drag it: a full click closes, and the press
                  // is kept from starting a drag.
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    close(id);
                  }}
                  className="h-4 w-4 rounded-full p-0.5 transition-colors duration-150 ease-meno hover:bg-gh-line shrink-0"
                  aria-label="Close tab"
                  title="Close"
                >
                  <XMarkIcon className="w-full h-full" />
                </button>
              </div>
            </Reorder.Item>
          );
        })}
        </AnimatePresence>
      </Reorder.Group>

      <div className="h-full flex items-center gap-1">
        <button
          aria-label="New workspace"
          title="New workspace"
          onClick={add}
          onMouseDown={stop}
          className="h-7 px-2 rounded-md border border-gh-line bg-white transition-colors duration-150 ease-meno hover:bg-gray-100"
        >
          <PlusIcon className="h-3 w-3" />
        </button>

        <OfflineToggle />
        <button
          aria-label="Settings"
          title="Settings"
          onMouseDown={stop}
          onClick={() => openByKind?.("settings", { label: "Settings" })}
          className="h-7 w-7 ml-1 rounded-md flex items-center justify-center text-gh-gray transition-colors duration-150 ease-meno hover:bg-gray-200 hover:text-gh-black"
        >
          <Cog6ToothIcon className="h-4.5 w-4.5" />
        </button>

        <div className="ml-2 h-full flex">
          <button
            aria-label="Minimize"
            title="Minimize"
            onMouseDown={stop}
            onClick={() => appWindow.minimize()}
            className="h-10 w-11 flex items-center justify-center transition-colors duration-150 ease-meno hover:bg-gray-200"
          >
            <MinusIcon className="h-4 w-4" />
          </button>
          <button
            aria-label="Maximize"
            title="Maximize / Restore"
            onMouseDown={stop}
            onClick={() => appWindow.toggleMaximize()}
            className="h-10 w-11 flex items-center justify-center transition-colors duration-150 ease-meno hover:bg-gray-200"
          >
            <StopIcon className="h-4 w-4" />
          </button>
          <button
            aria-label="Close"
            title="Close"
            onMouseDown={stop}
            onClick={() => appWindow.close()}
            className="h-10 w-11 flex items-center justify-center transition-colors duration-150 ease-meno hover:bg-red-500 hover:text-white"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
