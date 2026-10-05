import { useEffect, useState } from "react";
import { OUTPUT_KINDS, READER_PLUGINS, readerFor, readersOf, type PythonReader, type ReaderPlugin } from "../../../lib/calc/catalog";
import { addedReaders, addReader, removeReader, useReaders } from "../../../lib/calc/workers";
import { useAppSettings } from "../../../lib/settings/appSettings";

const KIND_NAME = Object.fromEntries(OUTPUT_KINDS.map((k) => [k.id, k.name]));

/**
 * Calculation readers in Settings: the readers Meno knows of, each added or
 * taken away here; and, where more than one added reads a kind of output -
 * each reads it - which of them gives what they both find.
 */
export default function CalcReaderSettings() {
  const states = useReaders((s) => s.state);
  const problems = useReaders((s) => s.problem);
  const chosen = useAppSettings((s) => s.calcReaders.chosen);
  const setCalcReaders = useAppSettings((s) => s.setCalcReaders);
  useEffect(() => {
    void addedReaders();
  }, []);
  const added = new Set(READER_PLUGINS.filter((p) => states[p.id] === "added").map((p) => p.id));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {READER_PLUGINS.map((p) => (
          <Reader key={p.id} plugin={p} state={states[p.id]} problem={problems[p.id]} />
        ))}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gh-black">Where readers overlap</h3>
        <p className="mt-0.5 mb-2 text-xs text-gh-gray max-w-2xl">
          Every reader added reads the kinds of output it reads. Where two find the same thing, the one chosen here gives it; otherwise the first.
        </p>
        <div className="rounded-lg border border-gh-line bg-white divide-y divide-gh-line">
          {OUTPUT_KINDS.map((k) => {
            const can = readersOf(k.id).filter((p) => added.has(p.id));
            const reads = readerFor(k.id, added, chosen);
            return (
              <label key={k.id} className="flex items-center gap-4 px-4 py-2">
                <span className="flex-1 text-sm text-gh-black">{k.name}</span>
                {can.length ? (
                  <select
                    aria-label={`Reader chosen for ${k.name}`}
                    value={reads?.id ?? ""}
                    disabled={can.length < 2}
                    onChange={(e) => setCalcReaders({ chosen: { ...chosen, [k.id]: e.target.value } })}
                    className="h-7 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black disabled:text-gh-black disabled:opacity-100"
                  >
                    {can.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-gh-gray">No reader added</span>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * A reader: what it is and reads, whether it is added, and the button that
 * adds it or takes it away - or, one that comes with Meno, that it does.
 */
function Reader({ plugin: p, state, problem }: { plugin: ReaderPlugin; state?: string; problem?: string }) {
  const [busy, setBusy] = useState(false);
  const run = (job: (p: PythonReader) => Promise<void>) => {
    if (p.builtin) return;
    setBusy(true);
    job(p)
      .catch(() => {}) // (said by the reader's problem)
      .finally(() => setBusy(false));
  };
  const status = p.builtin
    ? "Comes with Meno"
    : state === "added"
      ? "Added"
      : state === "adding"
        ? "Adding…"
        : state === "removing"
          ? "Removing…"
          : state === "absent"
            ? "Not added"
            : "";
  return (
    <div className="rounded-lg border border-gh-line bg-white px-4 py-3 flex items-start gap-4">
      <div className="flex-1">
        <div className="text-sm text-gh-black">
          {p.name} {p.version && <span className="text-gh-gray">{p.version}</span>}
        </div>
        <p className="text-xs text-gh-gray mt-0.5">{p.description}</p>
        <p className="text-xs text-gh-gray mt-1">Reads {p.reads.map((k) => KIND_NAME[k]).join(", ")}.</p>
        {!p.builtin && (
          <p className="text-xs text-gh-gray mt-1">
            {p.licence} · {p.homepage.replace(/^https?:\/\//, "")}
          </p>
        )}
        {problem && <p className="text-xs text-accel-accent mt-1 meno-fade-in">{problem}</p>}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span key={status} className="text-xs text-gh-gray meno-fade-in">
          {status}
        </span>
        {!p.builtin && (state === "added" || state === "absent") && (
          <button
            disabled={busy}
            onClick={() => run(state === "added" ? removeReader : addReader)}
            className="h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base disabled:opacity-50"
          >
            {state === "added" ? "Remove" : "Add"}
          </button>
        )}
      </div>
    </div>
  );
}
