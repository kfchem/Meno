import clsx from "clsx";
import type { CalcInfo } from "../../../../lib/calc/output";
import { frequencyText } from "../utils/vibration3d";

/**
 * A molecule's vibrations, as its calculation gave them, under it: each by
 * its frequency, an imaginary one marked. One chosen, the molecule moves in
 * it; chosen again, or the list closed, it comes to rest. A vibration whose
 * output gave no displacements is listed, but cannot be chosen.
 */
export default function Vibrations3D({
  vibrations,
  chosen,
  onChoose,
  onClose,
}: {
  vibrations: NonNullable<CalcInfo["vibrations"]>;
  chosen: number | null;
  onChoose: (mode: number | null) => void;
  onClose: () => void;
}) {
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
      <div role="listbox" aria-label="Vibrations" className="max-h-44 overflow-y-auto">
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
