/**
 * The kinds Meno writes by Export (docs/FILE-IO.md, *Save and Export*): each
 * with what it is called, its files' extension, and the options it takes, in
 * the general form (lib/options) - drawn before the file's name is asked
 * for, the chemist's last choices remembered. Save writes the workspace,
 * and takes none.
 */
import type { Option } from "../options";

/** One of a writer's options, and what on the page it is about - the drawing, or the molecules in 3D - where it is about one only: shown only where the page holds that. */
export type WriterOption = Option & { about?: "drawing" | "molecules3d" };

/** A kind Meno writes, as Export offers it. */
export type Writer = {
  /** Known by it, and its files by it as their extension. */
  id: "mol" | "sdf" | "rxn" | "svg";
  /** What it is called, in Export. */
  name: string;
  options: readonly WriterOption[];
};

/** Which CTfile version a structure is written in: the drawing's - molecules in 3D are written in V2000. */
const VERSION: WriterOption = {
  about: "drawing",
  id: "version",
  label: "Version",
  type: "choice",
  choices: [
    { value: "auto", label: "V2000, or V3000 where V2000 cannot hold it" },
    { value: "V3000", label: "V3000" },
  ],
  default: "auto",
};

export const WRITERS = {
  mol: { id: "mol", name: "MOL file", options: [VERSION] },
  sdf: {
    id: "sdf",
    name: "SD file",
    options: [
      VERSION,
      {
        id: "frames",
        about: "molecules3d",
        label: "Molecules in 3D",
        type: "choice",
        choices: [
          { value: "shown", label: "The frame shown" },
          { value: "all", label: "Every frame, a record each" },
        ],
        default: "shown",
      },
    ],
  },
  rxn: { id: "rxn", name: "RXN file", options: [VERSION] },
  svg: { id: "svg", name: "SVG picture", options: [] },
} as const satisfies Record<string, Writer>;

export type WriterId = keyof typeof WRITERS;

/** A writer's options that are about what the page holds: those about its drawing where it has one, about its molecules in 3D where it has any, and the rest. */
export function optionsFor(writer: Writer, holds: { drawing: boolean; molecules3d: boolean }): WriterOption[] {
  return writer.options.filter((o) => !o.about || holds[o.about]);
}

/** The role a writer's options are remembered under (lib/settings/appSettings `options`). */
export const writeRole = (id: WriterId) => `write:${id}`;
/** The role Export's last kind is remembered under. */
export const EXPORT_ROLE = "export";
