/**
 * The plugins Meno carries, for now: each a folder of its own among Meno's
 * resources (src-tauri/resources/plugins/<id>/) - its manifest, its worker,
 * its lock - found there and read as data, as one fetched would be
 * (./manifest). Meno names none of them; a folder put there is a plugin
 * Meno knows of. A list fetched online needs a way to trust it, and comes
 * later; its plugins will be folders of the same kind.
 */
import { acceptManifest, type Manifest } from "./manifest";

/** Where the plugins' folders are, among Meno's resources. */
export const PLUGINS_ROOT = "resources/plugins";

const found = import.meta.glob<unknown>("/src-tauri/resources/plugins/*/manifest.json", { eager: true, import: "default" });

/** The manifests of the plugins Meno carries, in their ids' order: each its folder's, named as its folder is. */
export const MANIFESTS: readonly Manifest[] = Object.entries(found)
  .map(([path, raw]) => {
    const m = acceptManifest(raw);
    const folder = path.split("/").slice(-2)[0];
    return m && m.id === folder ? m : null;
  })
  .filter((m): m is Manifest => m != null)
  .sort((a, b) => a.id.localeCompare(b.id));

const grammars = import.meta.glob<string>("/src-tauri/resources/plugins/*/*.grammar", { eager: true, query: "?raw", import: "default" });

/** A grammar in the folder of a plugin Meno carries (lib/plugins/manifest `GrammarDecl`): its text, or none where the folder holds no such file. */
export function grammarText(plugin: string, file: string): string | undefined {
  return grammars[`/src-tauri/resources/plugins/${plugin}/${file}`];
}
