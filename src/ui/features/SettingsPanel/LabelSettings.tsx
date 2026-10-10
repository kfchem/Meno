import clsx from "clsx";
import { useAppSettings } from "../../../lib/settings/appSettings";

/** How an atom's label is read as it is typed, in Settings: as it was meant, or exactly as typed. */
export default function LabelSettings() {
  const labels = useAppSettings((s) => s.labels);
  const setLabels = useAppSettings((s) => s.setLabels);
  return (
    <div className="mt-3 rounded-lg border border-gh-line bg-white px-3 py-2.5 flex gap-3 items-start">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-gh-black">Read labels as they are meant</div>
        <p className="text-xs leading-snug text-gh-gray mt-0.5">An atom's label typed as nh2 is NH2, obz is OBz. Off, a label is kept exactly as typed.</p>
      </div>
      <button
        role="switch"
        aria-checked={labels.smart}
        aria-label="Read labels as they are meant"
        onClick={() => setLabels({ ...labels, smart: !labels.smart })}
        className={clsx("relative h-6 w-11 shrink-0 rounded-full transition-colors", labels.smart ? "bg-accel-base" : "bg-gh-line")}
      >
        <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", labels.smart ? "left-[1.375rem]" : "left-0.5")} />
      </button>
    </div>
  );
}
