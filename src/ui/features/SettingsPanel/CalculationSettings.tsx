import { rememberable, valuesOf } from "../../../lib/options";
import { useAppSettings } from "../../../lib/settings/appSettings";
import OptionsForm from "../../options/OptionsForm";
import { stepRole } from "../StructureEditor/store/slices/workflowSlice";
import { defaultDoer, doable, doersOf } from "../StructureEditor/workflow/doers";
import { StepGlyph } from "../StructureEditor/workflow/icons";
import { KINDS } from "../StructureEditor/workflow/kinds";

/**
 * Calculations in Settings (docs/WORKFLOWS.md, *Who does a step*): each
 * kind of step something added does - who does it, where more than one
 * can, and its options as a new step starts with them: the last chosen in
 * a step, or changed here.
 */
export default function CalculationSettings() {
  const calculations = useAppSettings((s) => s.calculations);
  const setCalculations = useAppSettings((s) => s.setCalculations);
  const remembered = useAppSettings((s) => s.options);
  const rememberOptions = useAppSettings((s) => s.rememberOptions);
  const shown = KINDS.filter((k) => doable(k.kind));
  return (
    <div className="rounded-lg border border-gh-line bg-white divide-y divide-gh-line">
      <div className="grid grid-cols-[minmax(10rem,1fr)_8rem_minmax(12rem,1.4fr)] gap-4 px-4 py-2 text-xs text-gh-gray">
        <span>Step</span>
        <span>Done by</span>
        <span>Its options</span>
      </div>
      {shown.map((k) => {
        const can = doersOf(k.kind);
        const by = defaultDoer(k.kind);
        const options = k.options ?? [];
        return (
          <div key={k.kind} className="grid grid-cols-[minmax(10rem,1fr)_8rem_minmax(12rem,1.4fr)] gap-4 items-start px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-gh-black">
              <StepGlyph icon={k.icon} />
              {k.name}
            </span>
            {can.length > 1 ? (
              <select
                aria-label={`Who does ${k.name}`}
                value={by?.id ?? ""}
                onChange={(e) => setCalculations({ ...calculations, by: { ...calculations.by, [k.kind]: e.target.value } })}
                className="h-7 w-fit rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black"
              >
                {can.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs leading-5 text-gh-black">{by?.name}</span>
            )}
            {options.length ? (
              <OptionsForm
                options={options}
                values={valuesOf(options, remembered[stepRole(k.kind)])}
                onChange={(values) => rememberOptions(stepRole(k.kind), rememberable(options, values))}
              />
            ) : (
              <span className="text-xs leading-5 text-gh-gray">None</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
