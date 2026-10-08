import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import OptionsForm from "../../../options/OptionsForm";
import type { OptionValues } from "../../../../lib/options";
import type { WorkflowStep } from "../store/types";
import type { Doer } from "./doers";
import type { StepState } from "./flow";
import { StepGlyph } from "./icons";
import type { KindInfo } from "./kinds";
import { CARD_W, PORT, PORT_DOWN, PX } from "./look";

/** A port's look (docs/WORKFLOWS.md, *How each looks*): white, a line in the frames' grey; lit in the highlight's blue while a wire would join it, faint where it would not. */
export type PortLook = "plain" | "lit" | "dim";

export const FRAME_GREY = "#8c959f";
const BLUE = "#1e90ff";
const DONE = "rgb(49, 118, 137)";
const ATTENTION = "rgb(205, 69, 96)";

/** A port, centred where it stands in its parent. */
export function Port({
  look,
  style,
  onPointerDown,
  data,
  label,
}: {
  look: PortLook;
  style: React.CSSProperties;
  onPointerDown: (e: ReactPointerEvent) => void;
  data: Record<string, string>;
  label: string;
}) {
  const d = PORT / PX;
  return (
    <div
      {...data}
      role="button"
      aria-label={label}
      onPointerDown={onPointerDown}
      className="absolute rounded-full transition-[background-color,opacity,transform] duration-150 ease-meno hover:scale-125"
      style={{
        width: d,
        height: d,
        marginLeft: -d / 2,
        marginTop: -d / 2,
        background: look === "lit" ? BLUE : "white",
        border: `1.6px solid ${look === "lit" ? BLUE : FRAME_GREY}`,
        opacity: look === "dim" ? 0.35 : 1,
        pointerEvents: "auto",
        cursor: "crosshair",
        ...style,
      }}
    />
  );
}

/** What a state says, and in what colour, with its mark. */
function stateLine(state: StepState, said: string | undefined): { mark: string; text: string; color: string } {
  switch (state) {
    case "no-input":
      return { mark: "○", text: "No input", color: "rgb(89, 99, 110)" };
    case "ready":
      return { mark: "○", text: "Ready", color: "rgb(89, 99, 110)" };
    case "done":
      return { mark: "✓", text: said ?? "Done", color: DONE };
    case "failed":
      return { mark: "!", text: `Failed${said ? ` · ${said}` : ""}`, color: ATTENTION };
    case "changed":
      return { mark: "↻", text: "Changed · run again", color: "rgb(89, 99, 110)" };
  }
}

export type StepCardProps = {
  step: WorkflowStep;
  info: KindInfo;
  /** Who does it and how, in a line: "Meno · within 3 kcal/mol". */
  who: string;
  state: StepState;
  /** Its words too small to read at this zoom: its icon and its state's mark alone. */
  compact: boolean;
  open: boolean;
  ports: { take: PortLook; give: PortLook };
  options: OptionValues;
  doers: Doer[];
  by: string;
  onOptions: (values: OptionValues) => void;
  onBy: (id: string) => void;
  onCardDown: (e: ReactPointerEvent) => void;
  onTakeDown: (e: ReactPointerEvent) => void;
  onGiveDown: (e: ReactPointerEvent) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  onHover: (on: boolean) => void;
};

/**
 * A step's card (docs/WORKFLOWS.md, *What is on the page*): its icon and
 * what it does; who does it and how; a rule; and what state it is in. It
 * takes on its left edge and gives on its right. Clicked, it opens in
 * place to its options.
 */
export default function StepCard(p: StepCardProps) {
  const line = stateLine(p.state, p.step.ran?.said);
  const w = CARD_W / PX;
  return (
    <div
      className="meno-fade-in relative select-none"
      style={{ width: w, pointerEvents: "auto" }}
      onPointerEnter={() => p.onHover(true)}
      onPointerLeave={() => p.onHover(false)}
      onContextMenu={p.onContextMenu}
    >
      <div
        role="group"
        aria-label={`Step: ${p.info.name}`}
        onPointerDown={p.onCardDown}
        className="rounded-[12px] border border-gh-line bg-white shadow-[0_1px_3px_rgba(31,35,40,0.12)] transition-opacity duration-200 ease-meno"
        style={{ opacity: p.state === "changed" && !p.open ? 0.6 : 1, cursor: "default" }}
      >
        {p.compact ? (
          <div className="flex items-center justify-center gap-3 text-gh-black" style={{ height: 56 }}>
            <StepGlyph icon={p.info.icon} size={30} />
            <span className="text-[26px] leading-none transition-colors duration-200 ease-meno" style={{ color: line.color }}>
              {line.mark}
            </span>
          </div>
        ) : (
          <div className="px-3 pt-2.5 pb-2">
            <div className="flex items-center gap-2 text-gh-black">
              <StepGlyph icon={p.info.icon} />
              <span className="text-[13.5px] font-semibold leading-5 truncate">{p.info.name}</span>
            </div>
            <div className="pl-7 text-[11.5px] leading-4 text-gh-gray truncate">{p.who}</div>
            <div className="mt-2 mb-1.5 border-t border-gh-line" />
            <div className="flex items-baseline gap-1.5 text-[11.5px] leading-4 transition-colors duration-200 ease-meno" style={{ color: line.color }}>
              <span aria-hidden>{line.mark}</span>
              <span className="truncate" title={line.text}>
                {line.text}
              </span>
            </div>
          </div>
        )}
        {p.open && !p.compact && (
          <div className="border-t border-gh-line px-3 py-2.5" onPointerDown={(e) => e.stopPropagation()}>
            {p.info.options?.length ? (
              <OptionsForm options={p.info.options} values={p.options} onChange={p.onOptions} />
            ) : (
              <div className="text-xs text-gh-gray">No options</div>
            )}
            <div className="mt-3 flex items-center gap-2 text-xs text-gh-gray">
              <span>Done by</span>
              {p.doers.length > 1 ? (
                <select
                  aria-label="Done by"
                  value={p.by}
                  onChange={(e) => p.onBy(e.target.value)}
                  className="h-7 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black"
                >
                  {p.doers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-gh-black">{p.doers[0]?.name ?? "Nothing added"}</span>
              )}
            </div>
          </div>
        )}
      </div>
      <Port look={p.ports.take} label={`Into ${p.info.name}`} data={{ "data-take": String(p.step.id) }} onPointerDown={p.onTakeDown} style={{ left: 0, top: PORT_DOWN / PX }} />
      <Port look={p.ports.give} label={`Out of ${p.info.name}`} data={{ "data-give-step": String(p.step.id) }} onPointerDown={p.onGiveDown} style={{ left: w, top: PORT_DOWN / PX }} />
    </div>
  );
}
