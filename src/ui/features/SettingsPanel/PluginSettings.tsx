import { useEffect, useState } from "react";
import { READER_PLUGINS, type PythonReader } from "../../../lib/calc/catalog";
import { addedReaders, addReader, removeReader, useReaders } from "../../../lib/calc/workers";
import { kindById, refusedMarks } from "../../../lib/io/kinds";

/**
 * Plugins in Settings: every plugin Meno knows of, added or not - what it
 * is, the kinds of file it reads, its version, licence and home - each added
 * or taken away here. Meno itself is not among them: what it reads and
 * writes is in Files.
 */
export default function PluginSettings() {
  const states = useReaders((s) => s.state);
  const problems = useReaders((s) => s.problem);
  useEffect(() => {
    void addedReaders();
  }, []);
  return (
    <div className="space-y-3">
      {READER_PLUGINS.map((p) => (
        <Plugin key={p.id} plugin={p} state={states[p.id]} problem={problems[p.id]} />
      ))}
    </div>
  );
}

/** A plugin: what it is and reads, whether it is added, and the button that adds it or takes it away. */
function Plugin({ plugin: p, state, problem }: { plugin: PythonReader; state?: string; problem?: string }) {
  const [busy, setBusy] = useState(false);
  const run = (job: (p: PythonReader) => Promise<void>) => {
    setBusy(true);
    job(p)
      .catch(() => {}) // (said by the plugin's problem)
      .finally(() => setBusy(false));
  };
  const status =
    state === "added" ? "Added" : state === "adding" ? "Adding…" : state === "removing" ? "Removing…" : state === "absent" ? "Not added" : "";
  const refused = refusedMarks().filter((r) => r.plugin === p.id);
  return (
    <div className="rounded-lg border border-gh-line bg-white px-4 py-3 flex items-start gap-4">
      <div className="flex-1">
        <div className="text-sm text-gh-black">
          {p.name} <span className="text-gh-gray">{p.version}</span>
        </div>
        <p className="text-xs text-gh-gray mt-0.5">{p.description}</p>
        <p className="text-xs text-gh-gray mt-1">Reads {p.reads.map((k) => kindById(k)?.name ?? k).join(", ")}.</p>
        <p className="text-xs text-gh-gray mt-1">
          {p.licence} · {p.homepage.replace(/^https?:\/\//, "")}
        </p>
        {refused.length > 0 && (
          <p className="text-xs text-gh-gray mt-1">
            Not taken: {refused.map((r) => `“${r.mark}”`).join(", ")} - what a file of Meno's own holds too, so it cannot tell {p.name}'s kinds.
          </p>
        )}
        {problem && <p className="text-xs text-accel-accent mt-1 meno-fade-in">{problem}</p>}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span key={status} className="text-xs text-gh-gray meno-fade-in">
          {status}
        </span>
        {(state === "added" || state === "absent") && (
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
