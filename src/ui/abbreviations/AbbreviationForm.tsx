import { useId, useMemo, useState, type ReactNode } from "react";
import { labelProblem, structureProblem, type CustomAbbreviation } from "../../lib/chem/abbreviations";
import AbbreviationPicture from "./AbbreviationPicture";

/**
 * An abbreviation of the user's own, being made or changed: its label,
 * other ways of writing it, its name and its structure - SMILES with a "*"
 * where it is attached - drawn as it is typed. What is wrong with it is
 * said under the field it is wrong in, and it cannot be saved until
 * nothing is.
 */
export default function AbbreviationForm({
  initial,
  editing,
  saveText = "Save",
  children,
  onSave,
  onCancel,
}: {
  initial: Partial<CustomAbbreviation>;
  /** The abbreviation being changed, which keeps its own names. */
  editing?: CustomAbbreviation;
  saveText?: string;
  /** More, under the fields: a choice of the canvas's, say. */
  children?: ReactNode;
  onSave: (a: CustomAbbreviation) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [label, setLabel] = useState(initial.label ?? "");
  const [also, setAlso] = useState((initial.also ?? []).join(", "));
  const [name, setName] = useState(initial.name ?? "");
  const [smiles, setSmiles] = useState(initial.smiles ?? "");
  const others = useMemo(
    () => also.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
    [also],
  );
  const labelWrong = label.trim() ? labelProblem(label, editing) : null;
  const alsoWrong =
    others
      .map((o) => (o === label.trim() ? `${o} is its label already.` : labelProblem(o, editing)))
      .find((p) => p) ?? null;
  const smilesWrong = smiles.trim() ? structureProblem(smiles) : null;
  const ready = !!label.trim() && !!smiles.trim() && !labelWrong && !alsoWrong && !smilesWrong;
  const field = "mt-1 h-8 w-full rounded-md border border-gh-line bg-white px-2 text-sm text-gh-black focus:outline-none focus:ring-2 focus:ring-accel-base/40";
  const problem = (text: string | null) => text && <p className="mt-1 text-xs text-accel-accent">{text}</p>;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        onSave({
          label: label.trim(),
          name: name.trim(),
          smiles: smiles.trim(),
          ...(others.length ? { also: others } : {}),
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-gh-gray" htmlFor={`${id}-label`}>
          Label
          <input id={`${id}-label`} className={field} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mmt" autoFocus spellCheck={false} />
          {problem(labelWrong)}
        </label>
        <label className="block text-xs text-gh-gray" htmlFor={`${id}-also`}>
          Also written
          <input id={`${id}-also`} className={field} value={also} onChange={(e) => setAlso(e.target.value)} placeholder="MMTr" spellCheck={false} />
          {problem(alsoWrong)}
        </label>
      </div>
      <label className="block text-xs text-gh-gray" htmlFor={`${id}-name`}>
        Name
        <input id={`${id}-name`} className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="4-methoxytrityl" spellCheck={false} />
      </label>
      <label className="block text-xs text-gh-gray" htmlFor={`${id}-smiles`}>
        Structure, as SMILES: a * where it is attached
        <input id={`${id}-smiles`} className={`${field} font-mono`} value={smiles} onChange={(e) => setSmiles(e.target.value)} placeholder="*C(c1ccccc1)(c1ccccc1)c1ccc(OC)cc1" spellCheck={false} />
        {problem(smilesWrong)}
      </label>
      {smiles.trim() && !smilesWrong && (
        <AbbreviationPicture smiles={smiles} className="flex h-40 items-center justify-center rounded-md border border-gh-line bg-white p-2" />
      )}
      {children}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-8 rounded-md border border-gh-line bg-white px-3 text-sm text-gh-black hover:bg-gh-base">
          Cancel
        </button>
        <button type="submit" disabled={!ready} className="h-8 rounded-md bg-accel-base px-3 text-sm text-white disabled:opacity-40">
          {saveText}
        </button>
      </div>
    </form>
  );
}
