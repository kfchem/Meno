import { pluginsFilling } from "../../../lib/calc/catalog";
import { ROLES, roleOptionsRole, type Role, type RoleId } from "../../../lib/plugins/roles";
import { rolePlugin } from "../../../lib/roles/worker";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { valuesOf } from "../../../lib/options";
import OptionsForm from "../../options/OptionsForm";

/**
 * Who fills each role shown in a part of Settings (docs/PLUGINS.md, the
 * roles chosen where they are used): the plugin, by name - a choice where
 * more than one fills it - and the options it takes for the role, as its
 * manifest declares them, drawn in the general form and remembered.
 */
export default function RoleChoices({ where }: { where: Role["where"] }) {
  const plugins = useAppSettings((s) => s.plugins);
  const setPlugins = useAppSettings((s) => s.setPlugins);
  const remembered = useAppSettings((s) => s.options);
  const rememberOptions = useAppSettings((s) => s.rememberOptions);
  const roles = (Object.keys(ROLES) as RoleId[]).filter((r) => ROLES[r].where === where);
  return (
    <div className="rounded-lg border border-gh-line bg-white divide-y divide-gh-line">
      {roles.map((role) => {
        const can = pluginsFilling(role);
        const chosen = rolePlugin(role);
        const options = chosen?.roleOptions[role] ?? [];
        return (
          <div key={role} className="px-4 py-2">
            <div className="flex items-center gap-4">
              <span className="flex-1 text-sm text-gh-black">{ROLES[role].name}</span>
              {can.length > 1 ? (
                <select
                  aria-label={`Who does this: ${ROLES[role].name}`}
                  value={chosen?.id ?? ""}
                  onChange={(e) => setPlugins({ ...plugins, roles: { ...plugins.roles, [role]: e.target.value } })}
                  className="h-7 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black"
                >
                  {can.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-gh-black">{chosen?.name ?? <span className="text-gh-gray">Nothing yet</span>}</span>
              )}
            </div>
            {options.length > 0 && (
              <div className="mt-2 mb-1 pl-3 border-l border-gh-line">
                <OptionsForm
                  options={options}
                  values={valuesOf(options, remembered[roleOptionsRole(role)])}
                  onChange={(v) => rememberOptions(roleOptionsRole(role), v)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
