import { MANY_CHOICES, type Option, type OptionValues } from "../../lib/options";

/**
 * A role's options, drawn from their general form (lib/options): a choice
 * as its choices, each to pick - or, of many, a list to pick from; a number
 * with its unit; a text; a switch.
 * Whoever fills the role declares them - Meno, or a plugin - and this draws
 * any of them alike.
 */
export default function OptionsForm({
  options,
  values,
  onChange,
}: {
  options: readonly Option[];
  values: OptionValues;
  onChange: (values: OptionValues) => void;
}) {
  const set = (id: string, v: string | number | boolean) => onChange({ ...values, [id]: v });
  return (
    <div className="space-y-3">
      {options.map((o) => (
        <div key={o.id}>
          {o.type === "choice" && o.choices.length > MANY_CHOICES ? (
            <label className="block">
              <span className="block text-xs text-gh-gray mb-1">{o.label}</span>
              <select
                value={String(values[o.id] ?? "")}
                onChange={(e) => set(o.id, e.target.value)}
                className="h-7 w-full max-w-[12rem] rounded-md border border-gh-line bg-white px-2 text-sm text-gh-black"
              >
                {o.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          ) : o.type === "choice" ? (
            <fieldset>
              <legend className="text-xs text-gh-gray mb-1">{o.label}</legend>
              <div className="space-y-1">
                {o.choices.map((c) => (
                  <label key={c.value} className="flex items-center gap-2 text-sm text-gh-black">
                    <input type="radio" name={o.id} checked={values[o.id] === c.value} onChange={() => set(o.id, c.value)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : o.type === "switch" ? (
            <label className="flex items-center gap-2 text-sm text-gh-black">
              <input type="checkbox" checked={values[o.id] === true} onChange={(e) => set(o.id, e.target.checked)} />
              {o.label}
            </label>
          ) : (
            <label className="block">
              <span className="block text-xs text-gh-gray mb-1">{o.label}</span>
              <span className="flex items-center gap-1.5">
                <input
                  type={o.type === "number" ? "number" : "text"}
                  value={String(values[o.id] ?? "")}
                  {...(o.type === "number" ? { min: o.min, max: o.max, step: o.step } : {})}
                  onChange={(e) => {
                    if (o.type !== "number") return set(o.id, e.target.value);
                    const n = Number(e.target.value);
                    if (e.target.value !== "" && Number.isFinite(n)) set(o.id, n);
                  }}
                  className="h-7 w-full max-w-[12rem] rounded-md border border-gh-line bg-white px-2 text-sm text-gh-black"
                />
                {o.type === "number" && o.unit && <span className="text-xs text-gh-gray">{o.unit}</span>}
              </span>
            </label>
          )}
        </div>
      ))}
    </div>
  );
}
