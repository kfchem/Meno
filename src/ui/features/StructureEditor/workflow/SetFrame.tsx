import clsx from "clsx";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { WorkflowSet } from "../store/types";
import type { ListRow } from "./list";
import { SET_PAD, SET_TOP, PX, ROW } from "./look";
import { HAIR, Port, type PortLook } from "./StepCard";

/** How wide the band along a frame's edge is that a press takes to size it, in px. */
const EDGE = 8;

export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type SetFrameProps = {
  set: WorkflowSet;
  /** Its tab's name and count: "Input", "1 structure". */
  name: string;
  count: string;
  rows: ListRow[];
  hovered: boolean;
  chosen: boolean;
  /** Its port that gives; and, made by a step, the one that takes from it. */
  give: PortLook;
  onTabDown: (e: ReactPointerEvent) => void;
  onEdgeDown: (edge: Edge, e: ReactPointerEvent) => void;
  onGiveDown: (e: ReactPointerEvent) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  onHover: (on: boolean) => void;
};

const cursorOf: Record<Edge, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

/**
 * A set (docs/WORKFLOWS.md, *What is on the page*), drawn as Meno's cards
 * are: a rounded frame a hair thick, its name and count on a tab at its top
 * left - its tab drags it, with all it holds; its edges and corners size
 * it - and a port on its right edge that gives. Its frame darker while its
 * tab is under the pointer, in the accent while it is chosen. A list of its
 * entries, where it has one, under its tab.
 */
export default function SetFrame(p: SetFrameProps) {
  const w = (p.set.x1 - p.set.x0) / PX;
  const h = (p.set.y1 - p.set.y0) / PX;
  const line = p.chosen ? "border-accel-base" : p.hovered ? "border-gh-gray" : "border-gh-line";
  const hair: CSSProperties = { borderWidth: HAIR, borderStyle: "solid" };
  const edge = (e: Edge, style: CSSProperties) => (
    <div key={e} onPointerDown={(ev) => p.onEdgeDown(e, ev)} className="absolute" style={{ pointerEvents: "auto", cursor: cursorOf[e], ...style }} />
  );
  return (
    <div className="meno-fade-in relative select-none" style={{ width: w, height: h, pointerEvents: "none" }} onContextMenu={p.onContextMenu}>
      <div className={clsx("absolute inset-0 rounded-xl transition-colors duration-150 ease-meno", line)} style={hair} />
      {edge("n", { left: EDGE, right: EDGE, top: -EDGE / 2, height: EDGE })}
      {edge("s", { left: EDGE, right: EDGE, bottom: -EDGE / 2, height: EDGE })}
      {edge("w", { top: EDGE, bottom: EDGE, left: -EDGE / 2, width: EDGE })}
      {edge("e", { top: EDGE, bottom: EDGE, right: -EDGE / 2, width: EDGE })}
      {edge("nw", { left: -EDGE / 2, top: -EDGE / 2, width: EDGE * 1.5, height: EDGE * 1.5 })}
      {edge("ne", { right: -EDGE / 2, top: -EDGE / 2, width: EDGE * 1.5, height: EDGE * 1.5 })}
      {edge("sw", { left: -EDGE / 2, bottom: -EDGE / 2, width: EDGE * 1.5, height: EDGE * 1.5 })}
      {edge("se", { right: -EDGE / 2, bottom: -EDGE / 2, width: EDGE * 1.5, height: EDGE * 1.5 })}
      <div
        role="button"
        aria-label={`Set: ${p.name}`}
        data-set-tab={p.set.id}
        onPointerDown={p.onTabDown}
        onPointerEnter={() => p.onHover(true)}
        onPointerLeave={() => p.onHover(false)}
        className={clsx(
          "absolute flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[11px] transition-colors duration-150 ease-meno",
          line,
          p.hovered ? "bg-gh-base" : "bg-white",
        )}
        style={{ ...hair, left: 12, top: -10, height: 20, pointerEvents: "auto", cursor: "default" }}
      >
        <span className="font-medium text-gh-black">{p.name}</span>
        <span className="text-gh-gray">{p.count}</span>
      </div>
      {p.rows.length > 0 && (
        <div className="absolute tabular-nums" style={{ left: SET_PAD / PX, right: SET_PAD / PX, top: SET_TOP / PX - 8 }}>
          {p.rows.map((r, i) => (
            <div
              key={i}
              className={clsx("flex gap-2 text-[11px]", r.aside ? "text-gh-gray line-through" : "text-gh-black")}
              style={{ height: ROW / PX, lineHeight: `${ROW / PX}px` }}
            >
              <span className={clsx("flex-1 truncate", r.more && "text-gh-gray no-underline")}>{r.label}</span>
              <span className="w-14 text-right">{r.energy ?? ""}</span>
              <span className="w-12 text-right">{r.share ?? ""}</span>
            </div>
          ))}
        </div>
      )}
      <Port look={p.give} label={`Out of ${p.name}`} data={{ "data-give-set": String(p.set.id) }} onPointerDown={p.onGiveDown} style={{ left: w, top: h / 2 }} />
      {p.set.made && <Port look="plain" label={`Into ${p.name}`} data={{}} onPointerDown={(e) => e.stopPropagation()} style={{ left: 0, top: h / 2, pointerEvents: "none" }} />}
    </div>
  );
}
