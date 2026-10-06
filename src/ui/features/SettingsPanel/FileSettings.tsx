import { useEffect } from "react";
import { alsoReadersFor, READERS, readerFor, readersOf } from "../../../lib/calc/catalog";
import { addedReaders, useReaders } from "../../../lib/calc/workers";
import { MENO_KINDS, MENO_WRITES, useKinds } from "../../../lib/io/kinds";
import { useAppSettings } from "../../../lib/settings/appSettings";

/**
 * Files in Settings: every kind of file Meno reads - its own, and those the
 * plugins added bring - and who reads it - Meno, or a plugin added - who
 * else reads it, their findings added to the reader's, and who writes it.
 * Where more than one can read a kind, the chemist chooses.
 */
export default function FileSettings() {
  const states = useReaders((s) => s.state);
  const files = useAppSettings((s) => s.files);
  const setFiles = useAppSettings((s) => s.setFiles);
  useEffect(() => {
    void addedReaders();
  }, []);
  const added = new Set(READERS.filter((p) => states[p.id] === "added").map((p) => p.id));
  const shown = useKinds((s) => s.kinds).filter((k) => k.id !== MENO_KINDS.record.id);

  return (
    <div className="rounded-lg border border-gh-line bg-white divide-y divide-gh-line">
      <div className="grid grid-cols-[minmax(10rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_6rem] gap-4 px-4 py-2 text-xs text-gh-gray">
        <span>Kind</span>
        <span>Read by</span>
        <span>Also read by</span>
        <span>Written by</span>
      </div>
      {shown.map((k) => {
        const can = readersOf(k.id).filter((p) => p.builtin || added.has(p.id));
        const reader = readerFor(k.id, added, files);
        const also = alsoReadersFor(k.id, added, files);
        const others = can.filter((p) => p !== reader);
        const could = readersOf(k.id).filter((p) => !p.builtin && !added.has(p.id));
        const toggle = (id: string, on: boolean) => {
          const now = new Set(files.also[k.id] ?? []);
          if (on) now.add(id);
          else now.delete(id);
          setFiles({ ...files, also: { ...files.also, [k.id]: [...now] } });
        };
        return (
          <div key={k.id} className="grid grid-cols-[minmax(10rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_6rem] gap-4 items-center px-4 py-2">
            <span className="text-sm text-gh-black">
              {k.name} <span className="text-xs text-gh-gray">{k.extensions.join(" ")}</span>
            </span>
            {can.length > 1 ? (
              <select
                aria-label={`Who reads ${k.name}`}
                value={reader?.id ?? ""}
                onChange={(e) => setFiles({ ...files, read: { ...files.read, [k.id]: e.target.value } })}
                className="h-7 w-fit rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black"
              >
                {can.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : reader ? (
              <span className="text-xs text-gh-black">{reader.name}</span>
            ) : (
              <span className="text-xs text-gh-gray">{could.length ? `Add ${could.map((p) => p.name).join(" or ")} in Plugins` : "Nothing yet"}</span>
            )}
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {others.length ? (
                others.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-xs text-gh-black">
                    <input type="checkbox" checked={also.includes(p)} onChange={(e) => toggle(p.id, e.target.checked)} />
                    {p.name}
                  </label>
                ))
              ) : (
                <span className="text-xs text-gh-gray">-</span>
              )}
            </span>
            <span className="text-xs text-gh-black">{MENO_WRITES.includes(k.id) ? "Meno" : <span className="text-gh-gray">-</span>}</span>
          </div>
        );
      })}
    </div>
  );
}
