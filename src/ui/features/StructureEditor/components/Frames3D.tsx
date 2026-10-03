import { Html } from "@react-three/drei";
import { useCallback, useRef, useState } from "react";

/** Kilocalories per mole in a hartree. */
const KCAL_PER_HARTREE = 627.509474;
/** The bars' and the slider's width, the bars' height, and the room either side, in pixels. */
const WIDTH = 196;
const BARS = 30;
const SIDE = 10;

/** An energy above the lowest, as it is written: "1.23 kcal/mol". */
function relative(e: number): string {
  return `${e < 10 ? e.toFixed(2) : e.toFixed(1)} kcal/mol`;
}

/**
 * A molecule's frames, just below it on the page: which one it shows, of
 * how many, and - hovered or selected - a slider through them. Where its
 * file gives each frame's energy, each is a bar above the slider, as high
 * as it is above the lowest, and the frame shown says how far above that it
 * is: a click on a bar shows that frame.
 */
export default function Frames3D({
  count,
  frame,
  energies,
  open,
  onFrame,
}: {
  count: number;
  frame: number;
  /** Each frame's energy, in hartrees. */
  energies?: number[];
  /** Shown in full: its molecule hovered or selected. */
  open: boolean;
  onFrame: (frame: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pointed, setPointed] = useState<number | null>(null);
  const full = open || hovered;
  const lowest = energies ? Math.min(...energies) : 0;
  const above = energies?.map((e) => (e - lowest) * KCAL_PER_HARTREE);
  const highest = above ? Math.max(...above, 1e-9) : 1;
  const told = pointed ?? frame;
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
  return (
    <Html zIndexRange={[30, 20]}>
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
          style={{ opacity: full ? 1 : 0.75, width: (full ? Math.max(WIDTH, saidWidth) : saidWidth) + 2 * SIDE }}
        >
          <div
            className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
            style={{ gridTemplateRows: full ? "1fr" : "0fr", opacity: full ? 1 : 0 }}
          >
            <div className="overflow-hidden flex flex-col items-center" style={{ width: WIDTH }}>
              {above && (
                <svg width={WIDTH} height={BARS} className="mt-1.5 block" role="img" aria-label="Energy of each frame">
                  {above.map((e, i) => {
                    const step = WIDTH / count;
                    const h = 4 + (BARS - 4) * (e / highest);
                    return (
                      <rect
                        key={i}
                        x={i * step + Math.min(1, step * 0.2)}
                        y={BARS - h}
                        width={Math.max(1, step - Math.min(2, step * 0.4))}
                        height={h}
                        rx={Math.min(1.5, step / 4)}
                        className="cursor-pointer transition-[fill] duration-150"
                        fill={i === frame ? "rgb(49, 118, 137)" : i === pointed ? "rgb(140, 172, 184)" : "rgb(207, 222, 229)"}
                        onPointerEnter={() => setPointed(i)}
                        onClick={() => onFrame(i)}
                      />
                    );
                  })}
                </svg>
              )}
              <input
                type="range"
                aria-label="Frame"
                min={0}
                max={count - 1}
                step={1}
                value={frame}
                onChange={(e) => onFrame(parseInt(e.target.value, 10))}
                className="my-1.5 h-2 rounded-full appearance-none cursor-pointer bg-white/60 border border-gh-line"
                style={{ width: WIDTH }}
              />
            </div>
          </div>
          <div ref={said} className="w-max text-[11px] leading-[18px] text-gh-gray tabular-nums whitespace-nowrap">
            {told + 1} / {count}
            {above && <span className="text-gh-black"> · {relative(above[told])}</span>}
          </div>
        </div>
      </div>
    </Html>
  );
}
