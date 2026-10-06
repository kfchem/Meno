/**
 * What Meno reads itself under the readers' contract (docs/FILE-IO.md), by
 * kind: the one list, which the catalog says Meno reads by, and the worker
 * that runs them (./builtinWorker) reads by. Each reads a file's text and
 * gives what a plugin would; and gives a promise's value, asked for by its
 * key, the file sent again.
 */
import { cubeGrid, readCube } from "./cube";
import type { ReaderOutput } from "./output";

export type MenoRead = {
  read(name: string, text: string): ReaderOutput;
  ask(key: string, name: string, text: string): unknown;
};

export const MENO_READS: Record<string, MenoRead> = {
  cube: { read: readCube, ask: (key, name, text) => cubeGrid(name, text, key) },
};
