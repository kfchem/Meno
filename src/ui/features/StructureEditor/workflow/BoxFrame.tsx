import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import type { WorkflowBox } from "../store/types";
import type { ListRow } from "./list";
import { BOX_PAD, BOX_TOP, PX, ROW } from "./look";
import { FRAME_GREY, Port, type PortLook } from "./StepCard";

const BLUE = "#1e90ff";
/** How wide the band along a frame's edge is that a press takes to size it, in px. */
const EDGE = 8;

export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type BoxFrameProps = {
  box: WorkflowBox;
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
 * A box (docs/WORKFLOWS.md, *What is on the page*): a thin rounded frame,
 * its name and count on a tab at its top left - its tab drags it, with all
 * it holds; its edges and corners size it - and a port on its right edge
 * that gives. Lit from behind while its tab is under the pointer; its line
 * blue while it is chosen. A list of its entries, where it has one, under
 * its tab.
 */
export default function BoxFrame(p: BoxFrameProps) {
  const w = (p.box.x1 - p.box.x0) / PX;
  const h = (p.box.y1 - p.box.y0) / PX;
  const line = p.chosen ? BLUE : FRAME_GREY;
  const edge = (e: Edge, style: React.CSSProperties) => (
    <div key={e} onPointerDown={(ev) => p.onEdgeDown(e, ev)} className="absolute" style={{ pointerEvents: "auto", cursor: cursorOf[e], ...style }} />
  );
  return (
    <div className="meno-fade-in relative select-none" style={{ width: w, height: h, pointerEvents: "none" }} onContextMenu={p.onContextMenu}>
      <div
        className="absolute inset-0 rounded-[10px] transition-[background-color,border-color] duration-150 ease-meno"
        style={{ border: `1.2px solid ${line}`, background: p.hovered ? "rgba(30, 144, 255, 0.07)" : "transparent" }}
      />
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
        aria-label={`Box: ${p.name}`}
        data-box-tab={p.box.id}
        onPointerDown={p.onTabDown}
        onPointerEnter={() => p.onHover(true)}
        onPointerLeave={() => p.onHover(false)}
        className="absolute flex items-baseline gap-2 whitespace-nowrap rounded-[10px] bg-white px-2.5 transition-[border-color] duration-150 ease-meno"
        style={{ left: 14, top: -11, height: 22, lineHeight: "20px", border: `1.2px solid ${line}`, pointerEvents: "auto", cursor: "default" }}
      >
        <span className="text-[11.5px] font-semibold text-gh-black">{p.name}</span>
        <span className="text-[11.5px] text-gh-gray">{p.count}</span>
      </div>
      {p.rows.length > 0 && (
        <div className="absolute tabular-nums" style={{ left: BOX_PAD / PX, right: BOX_PAD / PX, top: BOX_TOP / PX - 8 }}>
          {p.rows.map((r, i) => (
            <div
              key={i}
              className={`flex gap-2 text-[11px] ${r.aside ? "text-gh-gray line-through" : "text-gh-black"}`}
              style={{ height: ROW / PX, lineHeight: `${ROW / PX}px` }}
            >
              <span className={`flex-1 truncate ${r.more ? "text-gh-gray no-underline" : ""}`}>{r.label}</span>
              <span className="w-14 text-right">{r.energy ?? ""}</span>
              <span className="w-12 text-right">{r.share ?? ""}</span>
            </div>
          ))}
        </div>
      )}
      <Port look={p.give} label={`Out of ${p.name}`} data={{ "data-give-box": String(p.box.id) }} onPointerDown={p.onGiveDown} style={{ left: w, top: h / 2 }} />
      {p.box.made && <Port look="plain" label={`Into ${p.name}`} data={{}} onPointerDown={(e) => e.stopPropagation()} style={{ left: 0, top: h / 2, pointerEvents: "none" }} />}
    </div>
  );
}
