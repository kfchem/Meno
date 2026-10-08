import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { RISE } from "../../theme/motion";

/** What Quick Add puts down where it was opened. */
export type QuickAddChoice = "bond" | "text" | "arrow" | "plus";

/** How far from the point it was opened at the icons stand, up and to the right, and each one's size, in px. */
const OFF = 14;
const SIZE = 36;

const CHOICES: { what: QuickAddChoice; name: string; icon: ReactNode }[] = [
  {
    what: "bond",
    name: "Bond",
    icon: <path d="M3.5 14 L16.5 6.5" />,
  },
  {
    what: "text",
    name: "Text",
    icon: <path d="M5 4.5 H15 M10 4.5 V16" />,
  },
  {
    what: "arrow",
    name: "Reaction arrow",
    icon: (
      <>
        <path d="M2.5 10 H14" />
        <path d="M13 6.2 L18 10 L13 13.8 Z" fill="currentColor" />
      </>
    ),
  },
  {
    what: "plus",
    name: "Plus",
    icon: <path d="M10 4 V16 M4 10 H16" />,
  },
];

/**
 * What a double-click on empty space opens there: a bond, words, a
 * reaction arrow or a "+", each an icon - named as the pointer rests on it
 * - put down where the double-click was. It stands up and to the right of
 * that point, inside the canvas, and closes on a choice, on Escape, on a
 * press anywhere else and on a turn of the wheel.
 */
export default function QuickAdd({
  x,
  y,
  within,
  onChoose,
  onClose,
}: {
  x: number;
  y: number;
  within: { width: number; height: number };
  onChoose: (what: QuickAddChoice) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("wheel", outside, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("wheel", outside, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  const width = CHOICES.length * SIZE + 8;
  const height = SIZE + 8;
  // (up and to the right, clear of the point; inside the canvas, below it or to its left where it must)
  const left = x + OFF + width <= within.width - 4 ? x + OFF : Math.max(4, x - OFF - width);
  const top = y - OFF - height >= 4 ? y - OFF - height : Math.min(within.height - height - 4, y + OFF);
  return (
    <motion.div
      ref={ref}
      {...RISE}
      role="toolbar"
      aria-label="Add"
      className="absolute z-50 flex gap-0.5 rounded-lg border border-gh-line bg-white p-1 shadow-lg"
      style={{ left, top, transformOrigin: "bottom left" }}
    >
      {CHOICES.map((c) => (
        <button
          key={c.what}
          aria-label={c.name}
          title={c.name}
          onClick={() => onChoose(c.what)}
          className="rounded-md flex items-center justify-center text-gh-black hover:bg-gh-base"
          style={{ width: SIZE, height: SIZE }}
        >
          <svg viewBox="0 0 20 20" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {c.icon}
          </svg>
        </button>
      ))}
    </motion.div>
  );
}
