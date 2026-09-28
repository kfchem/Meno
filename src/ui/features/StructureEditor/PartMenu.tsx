import { useEffect, useRef } from "react";

/**
 * What was right-clicked, where in the canvas the menu opens, and how big
 * the canvas is, so that the menu stays inside it.
 */
export type MenuTarget = {
  /** The atom or bond right-clicked; null, when it was nothing. */
  kind: "atom" | "bond" | null;
  id: number | null;
  /**
   * Whether there is a selection, and whether the menu is its: right-clicked
   * on something selected, or on nothing.
   */
  selection: "none" | "elsewhere" | "here";
  x: number;
  y: number;
  within: { width: number; height: number };
};

const MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The menu's width, and each item's height, for keeping it inside the canvas. */
const WIDTH = 240;
const ITEM = 32;

/**
 * What can be done to the atom or bond under the pointer - or to the
 * selection - at the pointer: the mouse alone reaches everything a key
 * does. Closes on Escape, on a press anywhere else, and on a turn of the
 * wheel.
 */
export default function PartMenu({
  target,
  onDelete,
  onCleanUp,
  onSelectStructure,
  onTurnOver,
  onCharge,
  onRadical,
  radical,
  onClose,
}: {
  target: MenuTarget;
  /** The part deleted, or the selection when the menu is its. */
  onDelete: () => void;
  /** The part's structure cleaned up, or the selection's structures. */
  onCleanUp: () => void;
  onSelectStructure: () => void;
  /** The selection turned over, left to right or top to bottom. */
  onTurnOver: (axis: "vertical" | "horizontal") => void;
  /** An atom's charge one up or one down. */
  onCharge: (step: 1 | -1) => void;
  /** An atom's unpaired electron given or taken away; `radical`, whether it has one. */
  onRadical: () => void;
  radical: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const buttons = [...(ref.current?.querySelectorAll("button") ?? [])];
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === "ArrowDown" ? 1 : -1;
      buttons[(at + step + buttons.length) % buttons.length]?.focus();
    };
    const onPress = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("wheel", onClose, true);
    ref.current?.querySelector("button")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("wheel", onClose, true);
    };
  }, [onClose]);

  const deleteKey = MAC ? "⌫" : "Del";
  const cleanUpKey = MAC ? "⇧⌘K" : "Ctrl+Shift+K";
  // (with a selection elsewhere, the keys are the selection's)
  const keys = target.selection === "none";
  const items =
    target.selection === "here"
      ? [
          { name: "Delete selection", keys: deleteKey, run: onDelete },
          { name: "Turn over left to right", keys: "", run: () => onTurnOver("vertical") },
          { name: "Turn over top to bottom", keys: "", run: () => onTurnOver("horizontal") },
          { name: "Clean up these structures", keys: cleanUpKey, run: onCleanUp },
        ]
      : [
          {
            name: target.kind === "atom" ? "Delete atom" : "Delete bond",
            keys: keys ? deleteKey : "",
            run: onDelete,
          },
          // an atom's charge and radical: the + and - keys do the first
          ...(target.kind === "atom"
            ? [
                { name: "Charge one up", keys: "+", run: () => onCharge(1) },
                { name: "Charge one down", keys: "\u2212", run: () => onCharge(-1) },
                { name: radical ? "No unpaired electron" : "Unpaired electron", keys: "", run: onRadical },
              ]
            : []),
          { name: "Select this structure", keys: "", run: onSelectStructure },
          {
            name: "Clean up this structure",
            keys: keys ? cleanUpKey : "",
            run: onCleanUp,
          },
        ];
  const height = items.length * ITEM + 12;
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={target.selection === "here" ? "Selection" : target.kind === "atom" ? "Atom" : "Bond"}
      className="absolute z-50 rounded-md border border-gh-line bg-white py-1 shadow-lg text-sm text-gh-black"
      style={{
        left: Math.max(0, Math.min(target.x, target.within.width - WIDTH - 8)),
        top: Math.max(0, Math.min(target.y, target.within.height - height - 8)),
        width: WIDTH,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((item) => (
        <button
          key={item.name}
          role="menuitem"
          onClick={() => {
            onClose();
            item.run();
          }}
          className="w-full h-8 px-3 flex items-center justify-between gap-4 text-left hover:bg-gh-base focus:bg-gh-base outline-none"
        >
          <span>{item.name}</span>
          <kbd className="font-sans text-xs text-gh-gray">{item.keys}</kbd>
        </button>
      ))}
    </div>
  );
}
