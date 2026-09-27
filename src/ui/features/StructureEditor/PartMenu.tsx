import { useEffect, useRef } from "react";

/**
 * What was right-clicked, where in the canvas the menu opens, and how big
 * the canvas is, so that the menu stays inside it.
 */
export type MenuTarget = {
  kind: "atom" | "bond";
  id: number;
  x: number;
  y: number;
  within: { width: number; height: number };
};

const MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The menu's size, for keeping it inside the canvas. */
const SIZE = { width: 240, height: 84 };

/**
 * What can be done to the atom or bond under the pointer, at the pointer:
 * the mouse alone reaches everything a key does. Closes on Escape, on a
 * press anywhere else, and on a turn of the wheel.
 */
export default function PartMenu({
  target,
  onDelete,
  onCleanUp,
  onClose,
}: {
  target: MenuTarget;
  onDelete: () => void;
  onCleanUp: () => void;
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

  const items = [
    {
      name: target.kind === "atom" ? "Delete atom" : "Delete bond",
      keys: MAC ? "⌫" : "Del",
      run: onDelete,
    },
    {
      name: "Clean up this structure",
      keys: MAC ? "⇧⌘K" : "Ctrl+Shift+K",
      run: onCleanUp,
    },
  ];
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={target.kind === "atom" ? "Atom" : "Bond"}
      className="absolute z-50 rounded-md border border-gh-line bg-white py-1 shadow-lg text-sm text-gh-black"
      style={{
        left: Math.max(0, Math.min(target.x, target.within.width - SIZE.width - 8)),
        top: Math.max(0, Math.min(target.y, target.within.height - SIZE.height - 8)),
        width: SIZE.width,
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
