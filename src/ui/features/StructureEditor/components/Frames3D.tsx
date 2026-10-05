import PageHtml from "./PageHtml";
import { useCallback, useRef, useState, type ReactNode } from "react";

/** Kilocalories per mole in a hartree. */
const KCAL_PER_HARTREE = 627.509474;
/** The bars' and the slider's width, the bars' height, and the room either side, in pixels. */
const WIDTH = 196;
const BARS = 30;
const SIDE = 10;
/** Past this many frames the energies have more room; narrower than this, a bar gives way to a profile. */
const MANY = 60;
const WIDE = 300;
const LEAST_BAR = 3;

/** A conformer's share of its set, as it is written: "62%", "<1%". */
function share(p: number): string {
  return p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`;
}

/** An energy above the lowest, as it is written: "1.23 kcal/mol". */
function relative(e: number): string {
  return `${e < 10 ? e.toFixed(2) : e.toFixed(1)} kcal/mol`;
}

/** An energy as a calculation gives it, as it is written: "−382.055117 Eh". */
function absolute(e: number): string {
  return `${e.toFixed(6).replace(/^-/, "\u2212")} Eh`;
}

/**
 * A molecule's frames, just below it on the page: which one it shows, of
 * how many, and - hovered or selected - a slider through them. Where its
 * file gives each frame's energy, the energies stand above the slider, each
 * as high as it is above the lowest - a bar each, or for a long run of
 * frames one profile through them all - and the frame shown says how far
 * above the lowest it is. Pressed, the energies show that frame, and a drag
 * along them goes through the frames.
 *
 * Read from a calculation (`about`, what it was), it says so too, opened:
 * the calculation, and the frame's energy as the calculation gave it. A
 * single geometry's - nothing to go through - is only that, and only while
 * its molecule is pointed at or selected.
 */
export default function Frames3D({
  count,
  frame,
  energies,
  open,
  onFrame,
  below,
  populations,
  about,
}: {
  count: number;
  frame: number;
  /** Each frame's energy, in hartrees. */
  energies?: number[];
  /** Shown in full: its molecule hovered or selected. */
  open: boolean;
  onFrame: (frame: number) => void;
  /** Said just below it - a note on its molecule - and moved down as it opens. */
  below?: ReactNode;
  /** A conformer set's: how much of it each conformer is, at room temperature. */
  populations?: number[];
  /** What the calculation it was read from was, in a line (lib/calc `calcLine`). */
  about?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [pointed, setPointed] = useState<number | null>(null);
  const full = open || hovered;
  const lowest = energies ? Math.min(...energies) : 0;
  const above = energies?.map((e) => (e - lowest) * KCAL_PER_HARTREE);
  const highest = above ? Math.max(...above, 1e-9) : 1;
  const told = pointed ?? frame;
  // (a long run of frames is given more room)
  const width = count > MANY ? WIDE : WIDTH;
  // shut, as wide as what it says; open, as wide as its slider - going from
  // one to the other. (What it says is measured once it is on the page,
  // which is after this renders - it is drawn in a root of its own - and
  // whenever it changes width.)
  const [saidWidth, setSaidWidth] = useState(0);
  const watch = useRef<ResizeObserver | null>(null);
  const said = useCallback((el: HTMLDivElement | null) => {
    watch.current?.disconnect();
    watch.current = null;
    if (!el) return;
    const measure = () => {
      if (el.offsetWidth) setSaidWidth(el.offsetWidth);
    };
    measure();
    watch.current = new ResizeObserver(measure);
    watch.current.observe(el);
  }, []);
  // (a single geometry has nothing to go through: it says what the
  // calculation was, and only while its molecule is pointed at)
  const single = count < 2;
  if (single && !open) return null;
  return (
    <PageHtml zIndexRange={[30, 20]}>
      <div
        className="flex flex-col items-center select-none"
        style={{ transform: "translate(-50%, 10px)" }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => {
          setHovered(false);
          setPointed(null);
        }}
      >
        <div
          className="rounded-2xl border border-gh-line bg-white/85 backdrop-blur shadow-sm py-1 flex flex-col items-center overflow-hidden transition-[width,opacity] duration-200 ease-out"
          style={{ opacity: full ? 1 : 0.75, width: (full ? Math.max(width, saidWidth) : saidWidth) + 2 * SIDE }}
        >
          <div
            className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
            style={{ gridTemplateRows: full ? "1fr" : "0fr", opacity: full ? 1 : 0 }}
          >
            <div className="overflow-hidden flex flex-col items-center" style={{ width }}>
              {above && !single && (
                <Energies
                  above={above}
                  highest={highest}
                  frame={frame}
                  pointed={pointed}
                  width={width}
                  onPoint={setPointed}
                  onFrame={onFrame}
                />
              )}
              {!single && (
                <input
                  type="range"
                  aria-label="Frame"
                  min={0}
                  max={count - 1}
                  step={1}
                  value={frame}
                  onChange={(e) => onFrame(parseInt(e.target.value, 10))}
                  className="my-1.5 h-2 rounded-full appearance-none cursor-pointer bg-white/60 border border-gh-line"
                  style={{ width }}
                />
              )}
              {about && !single && (
                <div className="mb-1 text-center text-[11px] leading-[16px] text-gh-gray tabular-nums">
                  {about}
                  {energies && <span className="text-gh-black"> · {absolute(energies[told])}</span>}
                </div>
              )}
            </div>
          </div>
          <div ref={said} className="w-max text-[11px] leading-[18px] text-gh-gray tabular-nums whitespace-nowrap">
            {single ? (
              <>
                {about}
                {energies && <span className="text-gh-black"> · {absolute(energies[0])}</span>}
              </>
            ) : (
              <>
                {told + 1} / {count}
                {above && <span className="text-gh-black"> · {relative(above[told])}</span>}
                {populations?.[told] != null && <span className="text-gh-black"> · {share(populations[told])}</span>}
              </>
            )}
          </div>
        </div>
        {below}
      </div>
    </PageHtml>
  );
}

/**
 * Each frame's energy above the lowest: a bar each, or - too many frames
 * for a bar each to be seen - one profile through them all, the frame
 * shown marked on it. Pointed at, a frame says its energy; pressed, it is
 * shown, and a drag along goes through the frames.
 */
function Energies({
  above,
  highest,
  frame,
  pointed,
  width,
  onPoint,
  onFrame,
}: {
  above: number[];
  highest: number;
  frame: number;
  pointed: number | null;
  width: number;
  onPoint: (i: number | null) => void;
  onFrame: (i: number) => void;
}) {
  const count = above.length;
  const step = width / count;
  const heightOf = (e: number) => 4 + (BARS - 4) * (e / highest);
  const frameAt = (svg: Element, clientX: number) => {
    const r = svg.getBoundingClientRect();
    return Math.min(count - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * count)));
  };
  const bars = step >= LEAST_BAR;
  const x = (i: number) => (i + 0.5) * step;
  const profile = bars
    ? ""
    : `M0,${BARS} ` +
      above.map((e, i) => `L${x(i).toFixed(2)},${(BARS - heightOf(e)).toFixed(2)}`).join(" ") +
      ` L${width},${BARS} Z`;
  return (
    <svg
      width={width}
      height={BARS}
      className="mt-1.5 block cursor-pointer touch-none"
      role="img"
      aria-label="Energy of each frame"
      onPointerDown={(e) => {
        // (followed wherever the pointer goes until the button comes up)
        const svg = e.currentTarget;
        const id = e.pointerId;
        onFrame(frameAt(svg, e.clientX));
        const move = (ev: PointerEvent) => {
          if (ev.pointerId === id) onFrame(frameAt(svg, ev.clientX));
        };
        const up = (ev: PointerEvent) => {
          if (ev.pointerId !== id) return;
          window.removeEventListener("pointermove", move, true);
          window.removeEventListener("pointerup", up, true);
          window.removeEventListener("pointercancel", up, true);
        };
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", up, true);
        window.addEventListener("pointercancel", up, true);
      }}
      onPointerMove={(e) => onPoint(frameAt(e.currentTarget, e.clientX))}
      onPointerLeave={() => onPoint(null)}
    >
      {bars ? (
        above.map((e, i) => (
          <rect
            key={i}
            x={i * step + Math.min(1, step * 0.2)}
            y={BARS - heightOf(e)}
            width={Math.max(1, step - Math.min(2, step * 0.4))}
            height={heightOf(e)}
            rx={Math.min(1.5, step / 4)}
            className="transition-[fill] duration-150"
            fill={i === frame ? "rgb(49, 118, 137)" : i === pointed ? "rgb(140, 172, 184)" : "rgb(207, 222, 229)"}
          />
        ))
      ) : (
        <>
          <path d={profile} fill="rgb(207, 222, 229)" />
          {pointed != null && pointed !== frame && (
            <line x1={x(pointed)} x2={x(pointed)} y1={0} y2={BARS} stroke="rgb(140, 172, 184)" strokeWidth={1} />
          )}
          <line x1={x(frame)} x2={x(frame)} y1={0} y2={BARS} stroke="rgb(49, 118, 137)" strokeWidth={1.5} />
          <circle cx={x(frame)} cy={BARS - heightOf(above[frame])} r={3} fill="rgb(49, 118, 137)" />
        </>
      )}
    </svg>
  );
}
