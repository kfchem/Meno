import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RISE } from "../../theme/motion";
import { CalculationsGlyph, ProcedureGlyph, StepGlyph } from "./workflow/icons";
import type { StepKind } from "./workflow/kinds";
import type { QuickGroup } from "./workflow/offered";

/** What Quick Add puts down where it was opened. */
export type QuickAddChoice = "bond" | "text" | "arrow" | "plus";

/** How far from the point it was opened at the icons stand, up and to the right, and each one's size, in px. */
const OFF = 14;
const SIZE = 36;
/** How wide the name of who does a row of steps stands, beside its kinds: "Gaussian 16" and "Procedures" whole. */
const LABEL_W = 84;

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
 * - put down where the double-click was; and, after a thin rule, one
 * button for calculations, which opens below them to who does them - each
 * plugin added that fills a kind of step, then Meno - each a row of the
 * kinds it fills (docs/WORKFLOWS.md, *A step: from Quick Add*) - and after
 * them the procedures saved, an icon each, named as the pointer rests on
 * it. A wire let go on empty space opens it at its calculations alone,
 * those that take what the wire carries.
 * It stands up and to the right of that point, inside the canvas, and
 * closes on a choice, on Escape, on a press anywhere else and on a turn of
 * the wheel.
 */
export default function QuickAdd({
  x,
  y,
  within,
  steps,
  wired = false,
  procedures = [],
  onChoose,
  onStep,
  onProcedure,
  onClose,
}: {
  x: number;
  y: number;
  within: { width: number; height: number };
  /** Who does steps, each with the kinds it fills - for a wire, those that take what it carries. */
  steps: readonly QuickGroup[];
  /** Opened by a wire let go: its calculations alone. */
  wired?: boolean;
  /** The procedures saved: each by its id and name, and what it needs that is not added - offered, but not to be put down, where it needs anything. */
  procedures?: readonly { id: string; name: string; needs: readonly string[] }[];
  onChoose: (what: QuickAddChoice) => void;
  onStep: (kind: StepKind, by: string) => void;
  onProcedure?: (id: string) => void;
  onClose: () => void;
}) {
  const [calcOpen, setCalcOpen] = useState(wired);
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
  // (a row for each who does steps: its name, then its kinds - and one for the procedures, after them)
  const offered = wired ? [] : procedures;
  const most = Math.max(1, ...steps.map((g) => g.steps.length), offered.length);
  const calcWidth = LABEL_W + most * SIZE + 8;
  const rowWidth = (CHOICES.length + 1) * SIZE + 8 + 9;
  // (a wire's: as wide as its rows, or the words saying there are none)
  const width = wired ? (steps.length ? calcWidth : 200) : calcOpen ? Math.max(rowWidth, calcWidth) : rowWidth;
  const rows = Math.max(1, steps.length) + (offered.length ? 1 : 0);
  const height = SIZE + 8 + (calcOpen && !wired ? rows * SIZE + 9 : 0);
  // (up and to the right, clear of the point; inside the canvas, below it or to its left where it must)
  const left = x + OFF + width <= within.width - 4 ? x + OFF : Math.max(4, x - OFF - width);
  const top = y - OFF - height >= 4 ? y - OFF - height : Math.min(within.height - height - 4, y + OFF);
  return (
    <motion.div
      ref={ref}
      {...RISE}
      role="toolbar"
      aria-label="Add"
      className="absolute z-50 rounded-lg border border-gh-line bg-white p-1 shadow-lg"
      style={{ left, top, transformOrigin: "bottom left" }}
    >
      {!wired && (
        <div className="flex items-center gap-0.5">
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
          <div className="mx-1 h-6 border-l border-gh-line" role="separator" />
          <button
            aria-label="Calculations"
            aria-expanded={calcOpen}
            title="Calculations"
            onClick={() => setCalcOpen((o) => !o)}
            className={`rounded-md flex items-center justify-center text-gh-black transition-colors duration-150 ease-meno ${calcOpen ? "bg-gh-base" : "hover:bg-gh-base"}`}
            style={{ width: SIZE, height: SIZE }}
          >
            {/* (as heavy as the glyphs beside it, drawn on a 20-unit square) */}
            <CalculationsGlyph stroke={2.1} />
          </button>
        </div>
      )}
      {/* (opening below the row in a short ease, not at once) */}
      <div className="grid transition-[grid-template-rows,opacity] duration-200 ease-meno" style={{ gridTemplateRows: calcOpen ? "1fr" : "0fr", opacity: calcOpen ? 1 : 0 }}>
        <div className="overflow-hidden">
          <div role="group" aria-label="Calculations" className={wired ? "" : "mt-1 pt-1 border-t border-gh-line"} style={{ width: wired ? undefined : width - 8 }}>
            {steps.length ? (
              steps.map((g) => (
                <div key={g.by} role="group" aria-label={g.name} className="flex items-center">
                  <span className="shrink-0 truncate px-1.5 text-xs text-gh-gray" style={{ width: LABEL_W }}>
                    {g.name}
                  </span>
                  {g.steps.map((k) => (
                    <button
                      key={k.kind}
                      aria-label={`${k.name} \u00b7 ${g.name}`}
                      title={k.name}
                      onClick={() => onStep(k.kind, g.by)}
                      className="rounded-md flex items-center justify-center text-gh-black hover:bg-gh-base"
                      style={{ width: SIZE, height: SIZE }}
                    >
                      <StepGlyph icon={k.icon} size={20} stroke={2.1} />
                    </button>
                  ))}
                </div>
              ))
            ) : (
              <div className="px-2 text-xs leading-9 text-gh-gray whitespace-nowrap">No step added takes this</div>
            )}
            {offered.length > 0 && (
              <div role="group" aria-label="Procedures" className="flex items-center">
                <span className="shrink-0 truncate px-1.5 text-xs text-gh-gray" style={{ width: LABEL_W }}>
                  Procedures
                </span>
                {offered.map((p) => (
                  <button
                    key={p.id}
                    aria-label={`Procedure: ${p.name}`}
                    title={p.needs.length ? `${p.name} - needs ${p.needs.join(" and ")}` : p.name}
                    disabled={p.needs.length > 0}
                    onClick={() => onProcedure?.(p.id)}
                    className="rounded-md flex items-center justify-center text-gh-black hover:bg-gh-base disabled:opacity-35 disabled:hover:bg-transparent"
                    style={{ width: SIZE, height: SIZE }}
                  >
                    <ProcedureGlyph size={20} stroke={2.1} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
