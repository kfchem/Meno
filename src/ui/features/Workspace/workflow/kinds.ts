/**
 * The kinds of step Meno defines (docs/WORKFLOWS.md, *Kinds of step*):
 * what each takes and gives, what it is called and drawn as, and its
 * options where Meno does it. Plugins fill kinds; they bring none of their
 * own.
 */
import type { Option } from "../../../../lib/options";

/** What flows along a wire: structures drawn (any not yet in 3D), molecules in 3D each a compound, or conformer sets. */
export type SetKind = "structures" | "molecules" | "conformers";

export type StepKind =
  | "structure-3d"
  | "conformers"
  | "optimise"
  | "energy"
  | "frequencies"
  | "energy-window"
  | "duplicates"
  | "populations"
  | "as-conformers";

/** Which icon a kind has (workflow/icons: QuickAdd, a step's card): a cube, a stack, a trend downwards, a bolt, a signal, a funnel, two squares, bars, shapes grouped. */
export type StepIcon = "cube" | "rings" | "curve" | "level" | "wave" | "band" | "twins" | "bars" | "grouped";

export type KindInfo = {
  kind: StepKind;
  name: string;
  icon: StepIcon;
  /** The sets it takes. */
  takes: readonly SetKind[];
  /** What it gives, for what it took: `same`, the kind of set that came in. */
  gives: SetKind | "same";
  /** Whether it runs a program (a plugin's) or works on entries alone. */
  runs: "program" | "entries";
  /** Its options, where Meno does it. */
  options?: readonly Option[];
  /** What its result set is called; `{id}`, an option's value. */
  made: string;
};

export const KINDS: readonly KindInfo[] = [
  { kind: "structure-3d", name: "3D structure", icon: "cube", takes: ["structures"], gives: "molecules", runs: "program", made: "3D structures" },
  { kind: "conformers", name: "Conformers", icon: "rings", takes: ["molecules", "conformers"], gives: "conformers", runs: "program", made: "Conformers" },
  { kind: "optimise", name: "Optimise", icon: "curve", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Optimised" },
  { kind: "energy", name: "Energy", icon: "level", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Energies" },
  { kind: "frequencies", name: "Frequencies", icon: "wave", takes: ["molecules", "conformers"], gives: "same", runs: "program", made: "Frequencies" },
  {
    kind: "energy-window",
    name: "Energy window",
    icon: "band",
    takes: ["conformers"],
    gives: "conformers",
    runs: "entries",
    made: "Within {window} kcal/mol",
    options: [{ id: "window", label: "Within", type: "number", default: 3, min: 0, step: 0.5, unit: "kcal/mol" }],
  },
  {
    kind: "duplicates",
    name: "Duplicates",
    icon: "twins",
    takes: ["molecules", "conformers"],
    gives: "same",
    runs: "entries",
    made: "Unlike",
    options: [{ id: "rmsd", label: "Alike within (RMSD)", type: "number", default: 0.125, min: 0, step: 0.025, unit: "Å" }],
  },
  {
    kind: "populations",
    name: "Populations",
    icon: "bars",
    takes: ["conformers"],
    gives: "conformers",
    runs: "entries",
    made: "Populations at {temperature} K",
    options: [{ id: "temperature", label: "At", type: "number", default: 298.15, min: 1, step: 1, unit: "K" }],
  },
  { kind: "as-conformers", name: "As conformers", icon: "grouped", takes: ["molecules"], gives: "conformers", runs: "entries", made: "Conformers" },
];

export const kindInfo = (kind: StepKind): KindInfo => KINDS.find((k) => k.kind === kind)!;

/** Whether a step of `kind` takes a set that holds `holds`. */
export const takes = (kind: StepKind, holds: SetKind): boolean => kindInfo(kind).takes.includes(holds);

/** The kinds Meno does itself (docs/WORKFLOWS.md, *Who does a step*): those on entries alone. */
export const MENO_DOES: readonly StepKind[] = KINDS.filter((k) => k.runs === "entries").map((k) => k.kind);

/** A step's options' values, its own over the defaults of the options it takes (doers `optionsFor`). */
export function optionsOf(options: readonly Option[], own: Record<string, string | number | boolean> | undefined): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {};
  for (const o of options) values[o.id] = own?.[o.id] ?? o.default;
  return values;
}

/** What a step's result set is called, its options' values put in. */
export function madeName(kind: StepKind, options: readonly Option[], own: Record<string, string | number | boolean> | undefined): string {
  const values = optionsOf(options, own);
  return kindInfo(kind).made.replace(/\{([a-z0-9-]+)\}/g, (_, id: string) => String(values[id] ?? ""));
}

/** How a step does its work, in a line: each option's value, a number with its unit, a choice by its name - one of none left out. */
export function howOf(options: readonly Option[], own: Record<string, string | number | boolean> | undefined): string {
  const values = optionsOf(options, own);
  return options
    .flatMap((o) => {
      const v = values[o.id];
      if (o.type === "number") return [`${v}${o.unit ? ` ${o.unit}` : ""}`];
      if (o.type === "choice") return v === "none" ? [] : [o.choices.find((c) => c.value === v)?.label ?? String(v)];
      if (o.type === "switch") return v ? [o.label] : [];
      return v ? [String(v)] : [];
    })
    .join(" · ");
}
