/**
 * Reading a calculation's output (docs/WORKSPACE.md, stage 3): the kind of
 * output it is, told by its start; every reader added that reads that kind,
 * each reading it; and what they found, put together. Readers are alike:
 * where two find the same thing - the geometries, what the calculation was,
 * a result of the same name - the one chosen in Settings for that kind
 * gives it, or else the first in Meno's order. What no reader added reads
 * says which would.
 */
import { useAppSettings } from "../settings/appSettings";
import { READER_PLUGINS, readersFor, readersOf, type OutputKind, type ReaderPlugin } from "./catalog";
import { OUTPUT_SCHEMA, type ReaderOutput } from "./output";
import { readResults, type Result } from "./results";
import { addedReaders, readerClient } from "./workers";

/** The readers that read a file of `kind`, the one whose finding counts first first; or why no one can: no reader that reads it is added. */
export function whoReads(
  kind: OutputKind,
  name: string,
  added: ReadonlySet<string>,
  chosen: Readonly<Record<string, string>>,
  plugins: readonly ReaderPlugin[] = READER_PLUGINS,
): ReaderPlugin[] | Error {
  const readers = readersFor(kind.id, added, chosen, plugins);
  if (readers.length) return readers;
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

/** What one reader found in an output, and the reader: its name and version. */
export type Found = { from: string; output: ReaderOutput };

/** What makes two results the same thing: what they belong to, and what they are called. */
const sameThing = (r: Result) => `${r.on}\u0000${r.group}\u0000${r.label}`;

/**
 * What readers found in one output, put together - `found` in the order
 * their findings count, where two find the same thing. The geometries are
 * the first's that gives any; a reader whose atoms are not those, in that
 * order, is left out, since nothing it says of them could be placed. Each
 * frame's energy, and each thing the calculation was, are the first's
 * that gives them; every result is kept, with the reader it came from, but
 * one of the same name and kind as a result kept already. What belongs to
 * frames is kept only from a reader that read as many as the geometries
 * are. Also: the readers whose findings were put together.
 */
export function combine(found: readonly Found[]): { output: ReaderOutput; readers: string[] } {
  const framesOf = (o: ReaderOutput) =>
    Array.isArray(o.frames) ? o.frames.filter((f) => Array.isArray(f) && f.length === 3 * (o.atoms?.length ?? 0)) : [];
  const base = found.find((f) => f.output.atoms?.length && framesOf(f.output).length);
  if (!base) return { output: found[0]?.output ?? { atoms: [], frames: [] }, readers: [] };
  const atoms = base.output.atoms;
  const frames = framesOf(base.output);
  const els = atoms.map((el) => String(el).toLowerCase());
  const agrees = (o: ReaderOutput) =>
    Array.isArray(o.atoms) && o.atoms.length === els.length && o.atoms.every((el, i) => typeof el === "string" && el.toLowerCase() === els[i]);
  const taken = found.filter((f) => f === base || agrees(f.output));
  const sameFrames = (o: ReaderOutput) => framesOf(o).length === frames.length;
  const first = <T>(pick: (o: ReaderOutput) => T | null | undefined): T | undefined =>
    taken.map((f) => pick(f.output)).find((v) => v != null && v !== "") ?? undefined;
  const results: Result[] = [];
  const seen = new Set<string>();
  for (const f of taken) {
    for (const r of readResults(f.output.results, atoms.length, sameFrames(f.output) ? frames.length : 0, f.from)) {
      if (seen.has(sameThing(r))) continue;
      seen.add(sameThing(r));
      results.push(r);
    }
  }
  return {
    output: {
      schema: OUTPUT_SCHEMA,
      program: first((o) => o.program),
      version: first((o) => o.version),
      method: first((o) => o.method),
      basis: first((o) => o.basis),
      charge: first((o) => o.charge),
      multiplicity: first((o) => o.multiplicity),
      optimised: first((o) => o.optimised),
      atoms,
      frames,
      energies: first((o) => (sameFrames(o) && o.energies?.length === frames.length ? o.energies : null)),
      results,
    },
    readers: taken.map((f) => f.from),
  };
}

/**
 * Reads a calculation's output with every reader added that reads its
 * kind, and puts together what they found (`combine`): the output, and the
 * readers that read it. A reader that fails leaves the others' findings as
 * they are; where every one fails, the first's failure is said.
 */
export async function readOutput(name: string, text: string, kind: OutputKind): Promise<{ output: ReaderOutput; readers: string[] }> {
  const readers = whoReads(kind, name, await addedReaders(), useAppSettings.getState().calcReaders.chosen);
  if (readers instanceof Error) throw readers;
  const tries = await Promise.allSettled(
    readers.map(async (p) => {
      const client = await readerClient(p);
      const version = client.version ?? p.version;
      return { from: version ? `${p.name} ${version}` : p.name, output: await client.read(name, text) };
    }),
  );
  const found = tries.flatMap((t) => (t.status === "fulfilled" ? [t.value] : []));
  if (!found.length) throw (tries[0] as PromiseRejectedResult).reason;
  tries.forEach((t, i) => {
    if (t.status === "rejected") console.warn(`${readers[i].name} could not read ${name}:`, t.reason);
  });
  const { output, readers: by } = combine(found);
  return { output: checked(output, kind, name), readers: by };
}
