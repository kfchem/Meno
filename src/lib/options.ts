/**
 * Options in a general form (docs/PLUGINS.md, *Several plugins, one role*):
 * what a role takes besides its input - how a file is written, say - each a
 * choice, a number, a text or a switch, with a label and a default. Whoever
 * fills the role declares them, Meno or a plugin; Meno draws them
 * (OptionsForm) and remembers the chemist's last choices, by the role
 * (lib/settings/appSettings `options`).
 */

type OptionBase = {
  /** Known by it, among the role's options. */
  id: string;
  /** What the chemist reads beside it. */
  label: string;
};
/** One of several, each with what it is called. */
export type ChoiceOption = OptionBase & { type: "choice"; choices: readonly { value: string; label: string }[]; default: string };
export type NumberOption = OptionBase & { type: "number"; default: number; min?: number; max?: number; step?: number; unit?: string };
export type TextOption = OptionBase & { type: "text"; default: string };
export type SwitchOption = OptionBase & { type: "switch"; default: boolean };
export type Option = ChoiceOption | NumberOption | TextOption | SwitchOption;

/** A role's options' values, by their ids. */
export type OptionValues = Record<string, string | number | boolean>;

/** An option's value, where `v` is one it takes; else none. */
function fitting(o: Option, v: unknown): string | number | boolean | undefined {
  switch (o.type) {
    case "choice":
      return typeof v === "string" && o.choices.some((c) => c.value === v) ? v : undefined;
    case "number":
      return typeof v === "number" && Number.isFinite(v) && (o.min == null || v >= o.min) && (o.max == null || v <= o.max) ? v : undefined;
    case "text":
      return typeof v === "string" ? v : undefined;
    case "switch":
      return typeof v === "boolean" ? v : undefined;
  }
}

/** The values of `options`: those remembered, where each still fits its option, else each one's default. */
export function valuesOf(options: readonly Option[], remembered: Readonly<Record<string, unknown>> = {}): OptionValues {
  return Object.fromEntries(options.map((o) => [o.id, fitting(o, remembered[o.id]) ?? o.default]));
}
