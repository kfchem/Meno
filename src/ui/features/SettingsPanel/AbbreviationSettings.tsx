import { useMemo, useState, type ReactNode } from "react";
import { ABBREVIATIONS, type CustomAbbreviation } from "../../../lib/chem/abbreviations";
import { useAppSettings } from "../../../lib/settings/appSettings";
import AbbreviationForm from "../../abbreviations/AbbreviationForm";
import AbbreviationPicture from "../../abbreviations/AbbreviationPicture";

/**
 * Abbreviations in Settings: the user's own - added, changed and taken away
 * here, or saved from a canvas - and Meno's, each drawn as what it stands
 * for, with the rules labels are put together by.
 */
export default function AbbreviationSettings() {
  const mine = useAppSettings((s) => s.abbreviations);
  const setAbbreviations = useAppSettings((s) => s.setAbbreviations);
  // the one being changed, or "new" while one is being added
  const [editing, setEditing] = useState<CustomAbbreviation | "new" | null>(null);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ABBREVIATIONS;
    return ABBREVIATIONS.filter((a) =>
      [a.label, ...(a.also ?? []), a.name, a.smiles].some((t) => t.toLowerCase().includes(q)),
    );
  }, [query]);

  return (
    <div className="space-y-8">
      <section aria-labelledby="mine-heading">
        <div className="flex items-center justify-between">
          <h3 id="mine-heading" className="text-sm font-semibold text-gh-black">
            Yours
          </h3>
          {editing === null && (
            <button
              onClick={() => setEditing("new")}
              className="h-8 rounded-md border border-gh-line bg-white px-3 text-sm text-gh-black hover:bg-gh-base"
            >
              Add an abbreviation
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gh-gray max-w-2xl">
          Labels of your own, read as Meno&apos;s are: typed on an atom, they are counted and written out as the
          atoms they stand for, and can be expanded. They also stand behind O, S or NH and in an ester, as
          Meno&apos;s groups do. A group can be saved from a canvas too: select it, and choose{" "}
          <i>Save as abbreviation…</i> from its menu.
        </p>
        {editing === "new" && (
          <div className="mt-3 rounded-lg border border-gh-line bg-white p-4 max-w-xl">
            <AbbreviationForm
              initial={{}}
              saveText="Add"
              onCancel={() => setEditing(null)}
              onSave={(a) => {
                setAbbreviations([...mine, a]);
                setEditing(null);
              }}
            />
          </div>
        )}
        {mine.length === 0 && editing !== "new" && (
          <p className="mt-3 rounded-lg border border-dashed border-gh-line px-4 py-6 text-center text-sm text-gh-gray">
            None yet.
          </p>
        )}
        <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
          {mine.map((a) =>
            editing === a ? (
              <div key={a.label} className="col-span-full rounded-lg border border-gh-line bg-white p-4 max-w-xl">
                <AbbreviationForm
                  initial={a}
                  editing={a}
                  onCancel={() => setEditing(null)}
                  onSave={(next) => {
                    setAbbreviations(mine.map((x) => (x === a ? next : x)));
                    setEditing(null);
                  }}
                />
              </div>
            ) : (
              <Entry key={a.label} a={a}>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setEditing(a)}
                    className="h-7 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black hover:bg-gh-base"
                  >
                    Change
                  </button>
                  <button
                    onClick={() => setAbbreviations(mine.filter((x) => x !== a))}
                    className="h-7 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black hover:bg-gh-base"
                  >
                    Remove
                  </button>
                </div>
              </Entry>
            ),
          )}
        </div>
      </section>

      <section aria-labelledby="rules-heading" className="max-w-3xl">
        <h3 id="rules-heading" className="text-sm font-semibold text-gh-black">
          Put together by rule
        </h3>
        <ul className="mt-1 list-disc pl-5 text-xs text-gh-gray space-y-1">
          <li>
            A group or contracted label behind O, S or NH: OTBS, SPh, NHBoc, OCF3. Not Cp, which IUPAC allows only
            bonded to a metal.
          </li>
          <li>An ester, CO2 and a group: CO2Me, CO2t-Bu.</li>
          <li>
            A substituted aryl group: positions, di or tri and a substituent before Ph, Bz or Bn (2,6-diMeBz,
            p-ClBn), or before the ring as a formula (4-MeOC6H4, 2,6-Me2C6H3, 3,5-(CF3)2C6H3).
          </li>
          <li>
            The <i>t</i> of <i>t</i>-Bu, the <i>s</i> of <i>s</i>-Bu and <i>o</i>-, <i>m</i>-, <i>p</i>- are set in
            italics, as IUPAC prefers; iPr and iBu upright.
          </li>
        </ul>
      </section>

      <section aria-labelledby="own-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="own-heading" className="text-sm font-semibold text-gh-black">
            Meno&apos;s
          </h3>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a label, name or SMILES"
            aria-label="Find one of Meno's abbreviations"
            className="h-8 w-64 max-w-full rounded-md border border-gh-line bg-white px-2 text-sm"
          />
        </div>
        <p className="mt-1 text-xs text-gh-gray max-w-2xl">
          Groups and contracted labels from everyday use. Those marked IUPAC are in its Table II, which may be used
          without explanation.
        </p>
        <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
          {shown.map((a) => (
            <Entry key={a.label} a={a} />
          ))}
        </div>
        {shown.length === 0 && <p className="mt-3 text-sm text-gh-gray">Nothing matches.</p>}
      </section>
    </div>
  );
}

/** One abbreviation: what it stands for, drawn, and its label, names and SMILES. */
function Entry({ a, children }: { a: CustomAbbreviation & { free?: boolean }; children?: ReactNode }) {
  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-gh-line bg-white">
      <AbbreviationPicture smiles={a.smiles} className="flex h-32 items-center justify-center border-b border-gh-line p-2" />
      <div className="space-y-0.5 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold text-gh-black">{a.label}</span>
          {a.free && <span className="rounded-full bg-gh-base px-2 text-[0.7rem] text-gh-gray">IUPAC</span>}
        </div>
        {a.name && <div className="text-xs text-gh-black">{a.name}</div>}
        {a.also?.length ? <div className="text-xs text-gh-gray">also {a.also.join(", ")}</div> : null}
        <code className="block break-all font-mono text-[0.7rem] text-gh-gray">{a.smiles}</code>
        {children}
      </div>
    </article>
  );
}
