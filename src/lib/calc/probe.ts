/**
 * Kinds a plugin tells itself (lib/io/kinds `probe`): asked about last, of
 * the plugins added that read them, only where nothing else told what a
 * file is and its name is one such a kind's files go by. Asking starts the
 * plugin, as opening the file would.
 */
import { headOf, probeCandidates, type Kind } from "../io/kinds";
import { readersOf } from "./catalog";
import { addedReaders, readerClient } from "./workers";

/** The kind a plugin added says a file is, asked; none, where none says so. */
export async function probeKind(name: string, text: string): Promise<Kind | null> {
  const candidates = probeCandidates(name);
  if (!candidates.length) return null;
  const added = await addedReaders();
  const head = headOf(text);
  for (const kind of candidates) {
    for (const p of readersOf(kind.id).filter((r) => !r.builtin && added.has(r.id))) {
      const yes = await readerClient(p)
        .then((c) => c.probe(kind.id, name, head))
        .catch(() => false);
      if (yes) return kind;
    }
  }
  return null;
}
