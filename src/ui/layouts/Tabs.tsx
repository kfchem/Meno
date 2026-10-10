import { AnimatePresence, Reorder, motion } from "motion/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useRef, type RefObject } from "react";
import { DURATION, EASE, FADE, LEAVE } from "../theme/motion";

export type TabMeta = { id: string; label: string; dirty?: boolean };

/**
 * The tabs in the title bar, in their order: dragged sideways to reorder,
 * pressed to choose, and closed by their ×.
 */
export function TabStrip({
  tabOrder,
  tabsById,
  activeId,
  reorder,
  select,
  close,
}: {
  tabOrder: string[];
  tabsById: Record<string, TabMeta>;
  activeId: string | null;
  reorder: (order: string[]) => void;
  select: (id: string) => void;
  close: (id: string) => void;
}) {
  const draggingRef = useRef(false);
  return (
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
        {tabOrder.map((id) => (
          <Tab
            key={id}
            tab={tabsById[id]}
            selected={id === activeId}
            draggingRef={draggingRef}
            onSelect={() => select(id)}
            onClose={() => close(id)}
          />
        ))}
      </AnimatePresence>
    </Reorder.Group>
  );
}

function Tab({
  tab,
  selected,
  draggingRef,
  onSelect,
  onClose,
}: {
  tab: TabMeta;
  selected: boolean;
  draggingRef: RefObject<boolean>;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <Reorder.Item
      value={tab.id}
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
        if (!draggingRef.current) onSelect();
      }}
      title={tab.label}
    >
      <Shoulders shown={selected} />
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
            onClose();
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
}

/**
 * The curved corners at the foot of the chosen tab, where its sides turn
 * out into the line under the tabs: always there, seen on the chosen tab
 * alone.
 */
function Shoulders({ shown }: { shown: boolean }) {
  return (
    <div className={clsx("transition-opacity duration-150 ease-meno", shown ? "opacity-100" : "opacity-0")}>
      <div className="absolute -bottom-[1px] -left-2 h-2 w-2 bg-white" />
      <div className="absolute -bottom-[1px] -left-2 h-2 w-2 bg-gh-base rounded-br-xl border-b border-r border-gh-line" />
      <div className="absolute -bottom-[1px] -right-2 h-2 w-2 bg-white" />
      <div className="absolute -bottom-[1px] -right-2 h-2 w-2 bg-gh-base rounded-bl-xl border-b border-l border-gh-line" />
    </div>
  );
}
