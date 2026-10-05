/**
 * Reading a calculation's output (docs/WORKSPACE.md, stage 3): the kind of
 * output it is, told by its start; the reader that reads that kind - the
 * one chosen in Settings, or the first added - and what it makes of it.
 * What no reader added reads says which would.
 */
import { useAppSettings } from "../settings/appSettings";
import { READER_PLUGINS, readerFor, readersOf, type OutputKind, type ReaderPlugin } from "./catalog";
import type { ReaderOutput } from "./output";
import { addedReaders, readerClient } from "./workers";

/** Who reads a file of `kind`, or why no one can: no reader that reads it is added. */
export function whoReads(
  kind: OutputKind,
  name: string,
  added: ReadonlySet<string>,
  chosen: Readonly<Record<string, string>>,
  plugins: readonly ReaderPlugin[] = READER_PLUGINS,
): ReaderPlugin | Error {
  const reader = readerFor(kind.id, added, chosen, plugins);
  if (reader) return reader;
  const could = readersOf(kind.id, plugins).map((p) => p.name);
  return new Error(
    could.length
      ? `To read ${name} (${kind.name}), add ${could.join(" or ")} in Settings, Calculation readers.`
      : `${name} (${kind.name}) is read by no reader Meno knows of.`,
  );
}

/** What was read, where it has a geometry to stand on the page; or why it is no use. */
export function checked(output: ReaderOutput, kind: OutputKind, name: string): ReaderOutput {
  if (!output.atoms?.length || !output.frames?.some((f) => f.length === 3 * output.atoms.length)) {
    throw new Error(
      `${name} (${kind.name}) holds no geometry for its molecule: ${kind.program} can leave it to another file. Open that one (its .xyz, say) to see the molecule.`,
    );
  }
  return output;
}

/** Reads a calculation's output with the reader that reads its kind: the output, and who read it. */
export async function readOutput(name: string, text: string, kind: OutputKind): Promise<{ output: ReaderOutput; reader: ReaderPlugin; version: string }> {
  const reader = whoReads(kind, name, await addedReaders(), useAppSettings.getState().calcReaders.chosen);
  if (reader instanceof Error) throw reader;
  const client = await readerClient(reader);
  const output = checked(await client.read(name, text), kind, name);
  return { output, reader, version: client.version ?? reader.version };
}
