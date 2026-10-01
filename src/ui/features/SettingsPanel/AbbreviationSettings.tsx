import { useMemo, useState, type ReactNode } from "react";
import { ABBREVIATIONS, abbreviationOf, abbreviationStructure, type CustomAbbreviation } from "../../../lib/chem/abbreviations";
import { LIGANDS, ligandPicture, structureFormula, type GroupStructure } from "../../../lib/chem/ligands";
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
  const matches = (a: { label: string; also?: string[]; name: string; smiles: string }) => {
    const q = query.trim().toLowerCase();
    return !q || [a.label, ...(a.also ?? []), a.name, a.smiles].some((t) => t.toLowerCase().includes(q));
  };
  const shown = ABBREVIATIONS.filter(matches);
  // each ligand with its donors marked
  const ligands = useMemo(() => LIGANDS.map((l) => ({ l, structure: ligandPicture(l) })), []);
  const complexes = useMemo(
    () =>
      COMPLEXES.map((label) => ({
        label,
        name: abbreviationOf(label)!.name,
        formula: structureFormula(abbreviationStructure(label)!),
      })),
    [],
  );

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

      <section aria-labelledby="ligands-heading">
        <h3 id="ligands-heading" className="text-sm font-semibold text-gh-black">
          Ligands
        </h3>
        <p className="mt-1 text-xs text-gh-gray max-w-2xl">
          Each drawn with a * on the atoms it binds a metal by, and at the centre of each pi system it binds
          through. A label bonded to a metal binds it so when it is expanded or written out: a neutral donor by a
          coordination bond, an anionic one by a bond, a pi system by a bond to its centre. CO, H2O, NH3 and Cp are
          read as ligands inside a complex&apos;s formula only.
        </p>
        <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
          {ligands
            .filter(({ l }) => matches(l))
            .map(({ l, structure }) => (
              <Entry key={l.label} a={l} structure={structure} />
            ))}
        </div>
      </section>

      <section aria-labelledby="complexes-heading">
        <h3 id="complexes-heading" className="text-sm font-semibold text-gh-black">
          Complexes
        </h3>
        <p className="mt-1 text-xs text-gh-gray max-w-2xl">
          A complex&apos;s formula is read as the structure it stands for: its metals, its ligands - in parentheses
          or not - halides, hydrides and groups bound by one bond (OAc, OTf), a part in brackets made as often as
          its count, and the counter-anions after it (BF4, PF6, SbF6, ClO4, BArF). Where a part has several metals,
          its ligands are shared among them in turn: which bridge them, a formula does not say. For example:
        </p>
        <ul className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(18rem,1fr))]">
          {complexes.map(({ label, name, formula }) => (
            <li key={label} className="rounded-lg border border-gh-line bg-white px-3 py-2">
              <div className="text-sm font-semibold text-gh-black">{label}</div>
              <div className="text-xs text-gh-black">{name}</div>
              <code className="font-mono text-[0.7rem] text-gh-gray">{formula}</code>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Complexes' formulas shown as examples. */
const COMPLEXES = ["Pd(PPh3)4", "PdCl2(dppf)", "Pd2(dba)3", "Pd(OAc)2", "[Ir(cod)Cl]2", "[Rh(cod)2]BF4", "Cp2ZrCl2", "Ni(cod)2"];

/** One abbreviation: what it stands for, drawn, and its label, names and SMILES. */
function Entry({
  a,
  structure,
  children,
}: {
  a: CustomAbbreviation & { free?: boolean };
  structure?: GroupStructure;
  children?: ReactNode;
}) {
  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-gh-line bg-white">
      <AbbreviationPicture
        smiles={a.smiles}
        structure={structure}
        className="flex h-32 items-center justify-center border-b border-gh-line p-2"
      />
      <div className="space-y-0.5 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold text-gh-black">{a.label}</span>
          {a.free && <span className="rounded-full bg-gh-base px-2 text-[0.7rem] text-gh-gray">IUPAC</span>}
        </div>
        {a.name && <div className="text-xs text-gh-black">{a.name}</div>}
        {a.also?.length ? <div className="text-xs text-gh-gray">also {a.also.join(", ")}</div> : null}
        {a.smiles && <code className="block break-all font-mono text-[0.7rem] text-gh-gray">{a.smiles}</code>}
        {children}
      </div>
    </article>
  );
}
