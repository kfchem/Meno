import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import type { CalcInfo } from "../../../../lib/calc/output";
import { frequencyText } from "../utils/vibration3d";

/** The list's height at most, in pixels; and at least, near the window's edge - three rows. */
const TALLEST = 176;
const LEAST = 72;
/** The card kept clear of the canvas's lower edge, in pixels. */
const MARGIN = 8;

/**
 * A molecule's vibrations, as its calculation gave them, under it: each by
 * its frequency, an imaginary one marked. One chosen, the molecule moves in
 * it; chosen again, or the list closed, it comes to rest. A vibration whose
 * output gave no displacements is listed, but cannot be chosen.
 *
 * It keeps within the canvas (`area`): with its molecule low on the page -
 * as one opened from its file is, filling the window - it is shorter, and
 * as tall again as the molecule is moved up.
 */
export default function Vibrations3D({
  vibrations,
  chosen,
  onChoose,
  onClose,
  area,
}: {
  vibrations: NonNullable<CalcInfo["vibrations"]>;
  chosen: number | null;
  onChoose: (mode: number | null) => void;
  onClose: () => void;
  /** What it keeps within: the canvas. */
  area: Element;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(TALLEST);
  // (measured as the page moves, every frame it is up: the page is moved
  // by the canvas's camera, and the chip above it opens and shuts, neither
  // of which tells it)
  useEffect(() => {
    let id = 0;
    const fit = () => {
      const el = list.current;
      const box = el?.parentElement;
      if (el && box) {
        // (the card clear of the edge, its own padding under the list too)
        const l = el.getBoundingClientRect();
        const under = box.getBoundingClientRect().bottom - l.bottom;
        setRoom(Math.round(Math.min(TALLEST, Math.max(LEAST, area.getBoundingClientRect().bottom - l.top - under - MARGIN))));
      }
      id = requestAnimationFrame(fit);
    };
    fit();
    return () => cancelAnimationFrame(id);
  }, [area]);
  return (
    <div className="mt-1.5 w-52 rounded-2xl border border-gh-line bg-white/90 backdrop-blur shadow-sm py-1 meno-fade-in">
      <div className="flex items-center justify-between pl-3 pr-1.5 h-6 text-[11px] text-gh-gray">
        <span>Vibrations</span>
        <button
          aria-label="Close the vibrations"
          onClick={onClose}
          className="h-5 w-5 rounded-full flex items-center justify-center hover:bg-gh-base hover:text-gh-black"
        >
          ×
        </button>
      </div>
      <div ref={list} role="listbox" aria-label="Vibrations" className="overflow-y-auto" style={{ maxHeight: room }}>
        {vibrations.map((v, i) => {
          const can = !!v.displacements;
          const on = chosen === i;
          return (
            <button
              key={i}
              role="option"
              aria-selected={on}
              disabled={!can}
              onClick={() => onChoose(on ? null : i)}
              className={clsx(
                "w-full h-6 px-3 flex items-center justify-between text-[11px] tabular-nums transition-colors duration-150 ease-meno",
                on ? "bg-gh-base" : "hover:bg-gh-base",
                !can && "opacity-40",
              )}
            >
              <span className="text-gh-gray">{i + 1}</span>
              <span className={v.frequency < 0 ? "text-accel-accent" : "text-gh-black"}>{frequencyText(v.frequency)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
