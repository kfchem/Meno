import { pluginsFilling } from "../../../lib/calc/catalog";
import { ROLES, type Role, type RoleId } from "../../../lib/plugins/roles";
import { rolePlugin } from "../../../lib/roles/worker";
import { useAppSettings } from "../../../lib/settings/appSettings";

/**
 * Who fills each role shown in a part of Settings (docs/PLUGINS.md, the
 * roles chosen where they are used): the plugin, by name - a choice where
 * more than one fills it.
 */
export default function RoleChoices({ where }: { where: Role["where"] }) {
  const plugins = useAppSettings((s) => s.plugins);
  const setPlugins = useAppSettings((s) => s.setPlugins);
  const roles = (Object.keys(ROLES) as RoleId[]).filter((r) => ROLES[r].where === where);
  return (
    <div className="rounded-lg border border-gh-line bg-white divide-y divide-gh-line">
      {roles.map((role) => {
        const can = pluginsFilling(role);
        const chosen = rolePlugin(role);
        return (
          <div key={role} className="flex items-center gap-4 px-4 py-2">
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
        );
      })}
    </div>
  );
}
