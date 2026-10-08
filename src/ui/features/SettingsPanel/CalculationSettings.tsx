import { rememberable, valuesOf } from "../../../lib/options";
import { useAppSettings } from "../../../lib/settings/appSettings";
import OptionRows from "../../options/OptionRows";
import { stepRole } from "../StructureEditor/store/slices/workflowSlice";
import { defaultDoer, doable, doersOf } from "../StructureEditor/workflow/doers";
import { StepGlyph } from "../StructureEditor/workflow/icons";
import { KINDS } from "../StructureEditor/workflow/kinds";

/**
 * Calculations in Settings (docs/WORKFLOWS.md, *Who does a step*), laid
 * out as the settings beside them are: each kind of step something added
 * does, a row - who does it, a choice where more than one can - and under
 * it its options as a new step starts with them: the last chosen in a
 * step, or changed here.
 */
export default function CalculationSettings() {
  const calculations = useAppSettings((s) => s.calculations);
  const setCalculations = useAppSettings((s) => s.setCalculations);
  const remembered = useAppSettings((s) => s.options);
  const rememberOptions = useAppSettings((s) => s.rememberOptions);
  const shown = KINDS.filter((k) => doable(k.kind));
  return (
    <div className="rounded-lg border border-gh-line bg-white divide-y divide-gh-line">
      {shown.map((k) => {
        const can = doersOf(k.kind);
        const by = defaultDoer(k.kind);
        const options = k.options ?? [];
        return (
          <div key={k.kind} className="divide-y divide-gh-line/60">
            <div className="px-3 py-2.5 flex items-center gap-3">
              <span className="text-gh-gray">
                <StepGlyph icon={k.icon} />
              </span>
              <span className="min-w-0 flex-1 text-sm text-gh-black">{k.name}</span>
              {can.length > 1 ? (
                <select
                  aria-label={`Who does ${k.name}`}
                  value={by?.id ?? ""}
                  onChange={(e) => setCalculations({ ...calculations, by: { ...calculations.by, [k.kind]: e.target.value } })}
                  className="h-7 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black"
                >
                  {can.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-gh-black">{by?.name}</span>
              )}
            </div>
            {options.length > 0 && (
              <OptionRows
                indent
                options={options}
                values={valuesOf(options, remembered[stepRole(k.kind)])}
                onChange={(values) => rememberOptions(stepRole(k.kind), rememberable(options, values))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
