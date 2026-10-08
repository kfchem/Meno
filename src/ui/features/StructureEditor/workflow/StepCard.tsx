import clsx from "clsx";
import { ArrowPathIcon, CheckCircleIcon, ClockIcon, ExclamationCircleIcon, StopCircleIcon } from "@heroicons/react/24/outline";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import OptionsForm from "../../../options/OptionsForm";
import type { Option, OptionValues } from "../../../../lib/options";
import type { WorkflowStep } from "../store/types";
import type { StepState } from "./flow";
import { StepGlyph } from "./icons";
import type { KindInfo, StepKind } from "./kinds";
import { CARD_W, PORT_DOWN, PX } from "./look";
import { clock } from "./programs";

/**
 * A port's look (docs/WORKFLOWS.md, *How it looks*): as it is; or, while a
 * wire is drawn, filled with the accent where the wire may join it.
 */
export type PortLook = "plain" | "lit";

/** A hairline on the screen, whatever the zoom: the page's layer of HTML sets it (Workflow2D). */
export const HAIR = "var(--hair, 1px)";
/** How large a port is on the screen, in hairlines. */
const PORT_HAIRS = 9;

/** A port, centred where it stands in its parent: a small ring, a hair thick. */
export function Port({
  look,
  style,
  onPointerDown,
  data,
  label,
}: {
  look: PortLook;
  style: CSSProperties;
  onPointerDown: (e: ReactPointerEvent) => void;
  data: Record<string, string>;
  label: string;
}) {
  return (
    <div
      {...data}
      role="button"
      aria-label={label}
      onPointerDown={onPointerDown}
      className={clsx(
        "absolute rounded-full transition-colors duration-150 ease-meno",
        look === "lit" ? "bg-accel-base border-accel-base" : "bg-white border-gh-gray hover:bg-accel-lightbase hover:border-accel-base",
      )}
      style={{
        width: `calc(${HAIR} * ${PORT_HAIRS})`,
        height: `calc(${HAIR} * ${PORT_HAIRS})`,
        marginLeft: `calc(${HAIR} * ${-PORT_HAIRS / 2})`,
        marginTop: `calc(${HAIR} * ${-PORT_HAIRS / 2})`,
        borderWidth: HAIR,
        borderStyle: "solid",
        pointerEvents: "auto",
        cursor: "crosshair",
        ...style,
      }}
    />
  );
}

/**
 * How a step's jobs are getting on, as last looked at: where they wait,
 * their place among those waiting; where they run, since when, how many of
 * how many have ended, and what the log says last.
 */
export type RunView = { place?: number; since?: number; ended: number; total: number; line?: string };

/** A place in the queue, as it is said: 1st, 2nd, 3rd, 4th... */
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** What a state says, with its icon and its words' colour (Meno's palette: the accent for done and running, the attention colour for failed). */
function stateLine(state: StepState, said: string | undefined, run: RunView | undefined, now: number): { Icon?: typeof CheckCircleIcon; text: string; tone: string; turning?: true } {
  switch (state) {
    case "no-input":
      return { text: "No input", tone: "text-gh-gray" };
    case "ready":
      return { text: "Ready", tone: "text-gh-gray" };
    case "waiting":
      return { Icon: ClockIcon, text: run?.place ? `Waiting \u00b7 ${ordinal(run.place)}` : "Waiting", tone: "text-gh-gray" };
    case "running":
      return {
        Icon: ArrowPathIcon,
        turning: true,
        text: run && run.total > 1 ? `Running \u00b7 ${run.ended} of ${run.total}` : `Running ${clock(run?.since != null ? now - run.since : 0)}`,
        tone: "text-accel-base",
      };
    case "stopped":
      return { Icon: StopCircleIcon, text: said ?? "Stopped", tone: "text-gh-gray" };
    case "done":
      return { Icon: CheckCircleIcon, text: said ?? "Done", tone: "text-accel-base" };
    case "failed":
      return { Icon: ExclamationCircleIcon, text: `Failed${said ? ` · ${said}` : ""}`, tone: "text-accel-accent" };
    case "changed":
      return { Icon: ArrowPathIcon, text: "Changed · run again", tone: "text-gh-gray" };
  }
}

export type StepCardProps = {
  step: WorkflowStep;
  info: KindInfo;
  /** Who does it - a plugin, or Meno - by name: its title. */
  who: string;
  /** How it does it, in a line: its options' values. */
  how: string;
  state: StepState;
  /** Its words too small to read at this zoom: its icon and its state's icon alone. */
  compact: boolean;
  open: boolean;
  ports: { take: PortLook; give: PortLook };
  /** How its jobs are getting on, where it runs any. */
  run?: RunView;
  /** The options it takes, as who does it declares them; and their values. */
  optionList: readonly Option[];
  options: OptionValues;
  /** The kinds of step who does it fills: another of them can be chosen in it. */
  kinds: readonly { kind: StepKind; name: string }[];
  onOptions: (values: OptionValues) => void;
  onKind: (kind: StepKind) => void;
  onCardDown: (e: ReactPointerEvent) => void;
  onTakeDown: (e: ReactPointerEvent) => void;
  onGiveDown: (e: ReactPointerEvent) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  onHover: (on: boolean) => void;
};

/**
 * A step's card (docs/WORKFLOWS.md, *What is on the page*), drawn as
 * Meno's cards are: who does it - a plugin, or Meno - with the icon of
 * what it does; what it does and how; a rule; and what state it is in, in
 * words and an icon. It takes on its left edge and gives on its right.
 * Clicked, it opens in place to what it does - another of the kinds who
 * does it fills - and its options.
 */
export default function StepCard(p: StepCardProps) {
  const line = stateLine(p.state, p.step.ran?.said, p.run, Date.now());
  const said = p.state === "running" && p.run?.line ? p.run.line : undefined;
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
        aria-label={`Step: ${p.who}, ${p.info.name}`}
        onPointerDown={p.onCardDown}
        className="rounded-xl border-gh-line bg-white shadow-sm"
        style={{ borderWidth: HAIR, borderStyle: "solid", cursor: "default" }}
      >
        {p.compact ? (
          <div className="flex items-center justify-center gap-3 text-gh-black" style={{ height: 56 }}>
            <StepGlyph icon={p.info.icon} size={28} />
            {line.Icon && <line.Icon className={clsx("h-6 w-6 transition-colors duration-200 ease-meno", line.tone, line.turning && "animate-spin motion-reduce:animate-none [animation-duration:2s]")} aria-hidden />}
          </div>
        ) : (
          <div className="px-3 pt-2.5 pb-2">
            <div className="flex items-center gap-2 text-gh-black">
              <span className="text-gh-gray">
                <StepGlyph icon={p.info.icon} />
              </span>
              <span className="text-[13px] font-medium leading-5 truncate">{p.who}</span>
            </div>
            <div className="pl-6 text-[11px] leading-4 text-gh-gray truncate">{[p.info.name, p.how].filter(Boolean).join(" \u00b7 ")}</div>
            <div className="mt-2 mb-1.5 border-gh-line" style={{ borderTopWidth: HAIR, borderTopStyle: "solid" }} />
            <div className={clsx("flex items-center gap-1.5 text-[11px] leading-4 transition-colors duration-200 ease-meno", line.tone)}>
              {line.Icon && <line.Icon className={clsx("h-3.5 w-3.5 shrink-0", line.turning && "animate-spin motion-reduce:animate-none [animation-duration:2s]")} aria-hidden />}
              <span className="truncate" title={line.text}>
                {line.text}
              </span>
            </div>
            {said && (
              <div className="pl-5 text-[10px] leading-4 text-gh-gray truncate font-mono" title={said}>
                {said}
              </div>
            )}
          </div>
        )}
        {p.open && !p.compact && (
          <div className="border-gh-line px-3 py-2.5" style={{ borderTopWidth: HAIR, borderTopStyle: "solid" }} onPointerDown={(e) => e.stopPropagation()}>
            {p.kinds.length > 1 && (
              <div className="mb-3">
                <OptionsForm
                  options={[{ id: "kind", label: "Calculation", type: "choice", choices: p.kinds.map((k) => ({ value: k.kind, label: k.name })), default: p.step.kind }]}
                  values={{ kind: p.step.kind }}
                  onChange={(v) => p.onKind(v.kind as StepKind)}
                />
              </div>
            )}
            {p.optionList.length ? (
              <OptionsForm options={p.optionList} values={p.options} onChange={p.onOptions} />
            ) : (
              <div className="text-xs text-gh-gray">No options</div>
            )}
          </div>
        )}
      </div>
      <Port look={p.ports.take} label={`Into ${p.info.name}`} data={{ "data-take": String(p.step.id) }} onPointerDown={p.onTakeDown} style={{ left: 0, top: PORT_DOWN / PX }} />
      <Port look={p.ports.give} label={`Out of ${p.info.name}`} data={{ "data-give-step": String(p.step.id) }} onPointerDown={p.onGiveDown} style={{ left: w, top: PORT_DOWN / PX }} />
    </div>
  );
}
