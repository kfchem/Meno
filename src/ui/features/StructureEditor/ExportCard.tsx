import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EXPORT_ROLE, optionsFor, WRITERS, writeRole, type WriterId } from "../../../lib/io/writers";
import type { Holds } from "./fileActions";
import { valuesOf, type OptionValues } from "../../../lib/options";
import { useAppSettings } from "../../../lib/settings/appSettings";
import OptionsForm from "../../options/OptionsForm";

/**
 * Export, asked before the file's name (docs/FILE-IO.md, *Save and
 * Export*): the kind of file - those the canvas can be written as; first the
 * kind of the file it came from, else the one chosen last time, where it is
 * among them - and that kind's options, as its writer declares them
 * (lib/io/writers), the last chosen remembered. A card over the canvas, as
 * Ask3D is, so that what is written stays in view.
 */
export default function ExportCard({
  kinds,
  from,
  what,
  onExport,
  onCancel,
}: {
  /** What the canvas can be written as, the fittest first. */
  kinds: readonly WriterId[];
  /** What is on the canvas: a writer's options about what it does not hold are not shown. */
  what: Holds;
  /** The kind of the file the canvas came from, where it can be written as it. */
  from?: WriterId;
  onExport: (kind: WriterId, values: OptionValues) => void;
  onCancel: () => void;
}) {
  const remembered = useAppSettings((s) => s.options);
  const rememberOptions = useAppSettings((s) => s.rememberOptions);
  const last = remembered[EXPORT_ROLE]?.kind;
  const [kind, setKind] = useState<WriterId>(from ?? kinds.find((k) => k === last) ?? kinds[0]);
  // (each kind's options as chosen in this card, or as they were last time)
  const [chosen, setChosen] = useState<Partial<Record<WriterId, OptionValues>>>({});
  const writer = WRITERS[kind];
  const values = chosen[kind] ?? valuesOf(writer.options, remembered[writeRole(kind)]);
  const shown = optionsFor(writer, { drawing: what.drawn || what.reaction, molecules3d: what.solid });

  const exportRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    exportRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const go = () => {
    rememberOptions(EXPORT_ROLE, { kind });
    if (writer.options.length) rememberOptions(writeRole(kind), values);
    onExport(kind, values);
  };

  return (
    <motion.div
      role="dialog"
      aria-labelledby="export-title"
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-[380px] max-w-[90%] rounded-lg border border-gh-line bg-white/95 shadow-lg p-3 text-sm text-gh-black"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="export-title" className="font-semibold mb-2">
        Export
      </h2>
      <div role="radiogroup" aria-label="Kind of file" className="flex flex-wrap gap-1.5 mb-3">
        {kinds.map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={k === kind}
            onClick={() => setKind(k)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors duration-150 ease-meno ${
              k === kind ? "border-accel-base bg-accel-lightbase text-gh-black" : "border-gh-line text-gh-gray hover:bg-gray-100"
            }`}
          >
            {WRITERS[k].name}
          </button>
        ))}
      </div>
      {shown.length > 0 && (
        <motion.div key={kind} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} className="mb-3">
          <OptionsForm options={shown} values={values} onChange={(v) => setChosen((c) => ({ ...c, [kind]: v }))} />
        </motion.div>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-gh-line px-3 py-1.5 hover:bg-gray-100">
          Cancel
        </button>
        <button ref={exportRef} onClick={go} className="rounded-md border border-accel-base bg-accel-lightbase px-3 py-1.5 hover:brightness-95">
          Export…
        </button>
      </div>
    </motion.div>
  );
}
