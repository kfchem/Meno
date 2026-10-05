import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isMarked, valueText, type ListResult } from "../../../../lib/calc/results";

/** The list's height at most, in pixels; and at least, near the window's edge - three rows. */
const TALLEST = 176;
const LEAST = 72;
/** The card kept clear of the canvas's lower edge, in pixels. */
const MARGIN = 8;
/** How many frames after it opens it has been placed under its molecule, to ask for room. */
const PLACED_FRAMES = 3;

/**
 * One of a molecule's calculation's lists, under it (lib/calc/results): its
 * vibrations, its orbitals, whatever a reader gave as a list - each row its
 * values, column by column, written as Meno writes them, an imaginary
 * frequency marked. A row pointed at marks the atoms it is of; one that
 * moves the molecule, or shows a frame, is chosen with a click, and chosen
 * again let go: the molecule comes to rest. Where some rows can be chosen,
 * one that cannot is shown faint. It opens on the row its reader put
 * first in view.
 *
 * It keeps within the canvas (`area`). Opened with too little room below
 * it, it asks for room (`onRoom`, where it would end at its full height) -
 * the view gliding to make it; and with its molecule moved low on the page
 * it is shorter, three rows at least, and as tall again as it is moved up.
 */
export default function CalcList3D({
  list: result,
  chosen,
  onChoose,
  onPoint,
  onClose,
  onRoom,
  area,
}: {
  list: ListResult;
  chosen: number | null;
  onChoose: (row: number | null) => void;
  onPoint: (row: number | null) => void;
  onClose: () => void;
  /** Asks for room below it, opened: where its card would end at its full height, in the window's pixels. */
  onRoom?: (bottom: number) => void;
  /** What it keeps within: the canvas. */
  area: Element;
}) {
  const card = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(TALLEST);
  // what its rows reach past it, where its scroll bar takes room it was not
  // given - so a Windows WebView does, the scroll bar come after the columns
  // were laid out - given back as a column of its own at the right, under
  // the scroll bar
  const [spare, setSpare] = useState(0);
  const askRoom = useRef(onRoom);
  askRoom.current = onRoom;
  // (measured as the page moves, every frame it is up: the page is moved
  // by the canvas's camera, and the chip above it opens and shuts, neither
  // of which tells it; and once it has been placed under its molecule, a
  // few frames after it opens, it asks for the room it would take at its
  // full height)
  useEffect(() => {
    let id = 0;
    let frames = 0;
    const fit = () => {
      const el = list.current;
      const box = card.current;
      if (el && box) {
        const l = el.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        if (++frames === PLACED_FRAMES) askRoom.current?.(b.top + box.offsetHeight - el.clientHeight + Math.min(TALLEST, el.scrollHeight));
        // (the card clear of the edge, its own padding under the list too)
        setRoom(Math.round(Math.min(TALLEST, Math.max(LEAST, area.getBoundingClientRect().bottom - l.top - (b.bottom - l.bottom) - MARGIN))));
        // (never more than the scroll bar's own width: what reaches past it
        // for any other reason - a card as wide as it may be - stays hidden)
        setSpare(Math.min(el.offsetWidth - el.clientWidth, Math.max(0, el.scrollWidth - el.clientWidth)));
      }
      id = requestAnimationFrame(fit);
    };
    fit();
    return () => cancelAnimationFrame(id);
  }, [area, result.id]);
  // (opened on the row its reader put first in view, in the middle of it)
  useLayoutEffect(() => {
    const el = list.current;
    const row = result.focus != null ? el?.querySelector<HTMLElement>(`[data-row="${result.focus}"]`) : null;
    if (el && row) el.scrollTop = row.offsetTop - (el.clientHeight - row.offsetHeight) / 2;
  }, [result.id, result.focus]);

  const can = (i: number) => !!(result.rows[i].move || result.rows[i].frame != null);
  const some = result.rows.some((_, i) => can(i));
  const headed = result.columns.some((c) => c.label);
  // (a column of numbers, or of values with a unit, to the right; of texts, to the left)
  const right = result.columns.map((c, k) => !!(c.quantity || c.unit) || result.rows.every((r) => typeof r.cells[k] !== "string"));
  const columns = {
    display: "grid",
    gridTemplateColumns: "subgrid",
    gridColumn: "1 / -1",
  } as const;
  return (
    <div
      ref={card}
      className="mt-1.5 w-max min-w-52 max-w-[24rem] rounded-2xl border border-gh-line bg-white/90 backdrop-blur shadow-sm py-1 meno-fade-in"
    >
      <div className="flex items-center justify-between gap-3 pl-3 pr-1.5 h-6 text-[11px] text-gh-gray">
        <span className="truncate">{result.label}</span>
        <button
          aria-label={`Close ${result.label}`}
          onClick={onClose}
          className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center hover:bg-gh-base hover:text-gh-black"
        >
          ×
        </button>
      </div>
      <div
        className="grid gap-x-3"
        style={{
          gridTemplateColumns: `repeat(${result.columns.length}, auto)${spare ? ` ${spare}px` : ""}`,
        }}
      >
        {headed && (
          <div className="px-3 h-5 items-center text-[10px] text-gh-gray" style={columns} aria-hidden>
            {result.columns.map((c, k) => (
              <span key={k} className={clsx("whitespace-nowrap", right[k] && "text-right")}>
                {c.label}
              </span>
            ))}
          </div>
        )}
        <div
          ref={list}
          role="listbox"
          aria-label={result.label}
          className="relative overflow-y-auto overflow-x-hidden"
          style={{ ...columns, gridAutoRows: "min-content", maxHeight: room }}
          onPointerLeave={() => onPoint(null)}
        >
          {result.rows.map((r, i) => {
            const on = chosen === i;
            return (
              <div
                key={i}
                data-row={i}
                role="option"
                aria-selected={on}
                aria-disabled={!can(i)}
                onPointerEnter={() => onPoint(r.atoms ? i : null)}
                onClick={() => can(i) && onChoose(on ? null : i)}
                className={clsx(
                  "px-3 h-6 items-center text-[11px] tabular-nums transition-colors duration-150 ease-meno",
                  on ? "bg-gh-base" : (can(i) || r.atoms) && "hover:bg-gh-base",
                  can(i) && "cursor-pointer",
                  some && !can(i) && "opacity-40",
                )}
                style={columns}
              >
                {r.cells.map((v, k) => (
                  <span
                    key={k}
                    className={clsx(
                      "whitespace-nowrap",
                      right[k] && "text-right",
                      isMarked(v, result.columns[k])
                        ? "text-accel-accent"
                        : k === 0 && result.columns.length > 1
                          ? "text-gh-gray"
                          : "text-gh-black",
                    )}
                  >
                    {valueText(v, result.columns[k])}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
