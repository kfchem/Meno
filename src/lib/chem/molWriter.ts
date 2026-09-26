import { NOMINAL_BOND_LENGTH } from "./acs";
import { wedgeNarrowAtom } from "./layout2d";

/** An atom to write: where it is in the editor's world units, and what. */
export type WriterAtom = { id: number; x: number; y: number; el: string };
/** A bond to write, between two atoms by id, as the editor holds it. */
export type WriterBond = {
  a: number;
  b: number;
  order: 1 | 2 | 3;
  stereo?: "up" | "down" | "wavy" | "none";
  stereoOrient?: "principle" | "reverse";
  dative?: boolean;
};
export type WriterModel = { atoms: WriterAtom[]; bonds: WriterBond[] };

/** How long a MOL file's bonds are, in ångström: the usual 1.5. */
export const MOL_BOND_LENGTH = 1.5;

/** MOL's bond type for a coordination (dative) bond. */
const COORDINATION_BOND = 9;

type Row = {
  first: number;
  second: number;
  type: number;
  stereo: "up" | "down" | "wavy" | "none";
};

/**
 * The bonds as a MOL file lists them: 1-based atoms, the first of a wedge its
 * narrow end - the stereocentre, as the drawing has it - and the first of a
 * wavy bond or a dative one where the drawing starts it.
 */
function rows(model: WriterModel, index: Map<number, number>): Row[] {
  const deg = new Map<number, number>();
  for (const b of model.bonds) {
    const i = index.get(b.a);
    const j = index.get(b.b);
    if (i == null || j == null) continue;
    deg.set(i, (deg.get(i) ?? 0) + 1);
    deg.set(j, (deg.get(j) ?? 0) + 1);
  }
  const out: Row[] = [];
  for (const b of model.bonds) {
    const i = index.get(b.a);
    const j = index.get(b.b);
    if (i == null || j == null) continue;
    const stereo = b.stereo ?? "none";
    let first = i;
    if (stereo === "up" || stereo === "down") {
      first = wedgeNarrowAtom(
        { a1: i, a2: j, order: b.order, stereoOrient: b.stereoOrient },
        deg,
      );
    } else if (stereo === "wavy") {
      first = (deg.get(i) ?? 0) >= (deg.get(j) ?? 0) ? i : j;
    }
    const second = first === i ? j : i;
    const type = b.dative && b.order === 1 ? COORDINATION_BOND : b.order;
    out.push({ first: first + 1, second: second + 1, type, stereo });
  }
  return out;
}

const f10 = (v: number) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4).padStart(10);
const i3 = (n: number) => String(n).padStart(3);

/** The second header line: the program, no date, and that it is 2D. */
const PROGRAM_LINE = "  Meno    " + " ".repeat(10) + "2D";

function writeV2000(model: WriterModel, title: string): string {
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const scale = MOL_BOND_LENGTH / NOMINAL_BOND_LENGTH;
  const bonds = rows(model, index);
  const code = { up: 1, down: 6, wavy: 4, none: 0 } as const;
  const lines = [
    title,
    PROGRAM_LINE,
    "",
    `${i3(model.atoms.length)}${i3(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`,
  ];
  for (const a of model.atoms) {
    lines.push(
      `${f10(a.x * scale)}${f10(a.y * scale)}${f10(0)} ${a.el.padEnd(3)}` +
        " 0  0  0  0  0  0  0  0  0  0  0  0",
    );
  }
  for (const b of bonds) {
    lines.push(
      `${i3(b.first)}${i3(b.second)}${i3(b.type)}${i3(code[b.stereo])}  0  0  0`,
    );
  }
  lines.push("M  END");
  return lines.join("\n") + "\n";
}

function writeV3000(model: WriterModel, title: string): string {
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const scale = MOL_BOND_LENGTH / NOMINAL_BOND_LENGTH;
  const bonds = rows(model, index);
  const cfg = { up: 1, down: 3, wavy: 2, none: 0 } as const;
  const num = (v: number) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4);
  const lines = [
    title,
    PROGRAM_LINE,
    "",
    "  0  0  0     0  0  0  0  0  0999 V3000",
    "M  V30 BEGIN CTAB",
    `M  V30 COUNTS ${model.atoms.length} ${bonds.length} 0 0 0`,
    "M  V30 BEGIN ATOM",
  ];
  model.atoms.forEach((a, i) => {
    lines.push(`M  V30 ${i + 1} ${a.el} ${num(a.x * scale)} ${num(a.y * scale)} 0 0`);
  });
  lines.push("M  V30 END ATOM");
  if (bonds.length > 0) {
    lines.push("M  V30 BEGIN BOND");
    bonds.forEach((b, i) => {
      const c = cfg[b.stereo];
      lines.push(
        `M  V30 ${i + 1} ${b.type} ${b.first} ${b.second}` + (c ? ` CFG=${c}` : ""),
      );
    });
    lines.push("M  V30 END BOND");
  }
  lines.push("M  V30 END CTAB", "M  END");
  return lines.join("\n") + "\n";
}

/**
 * The structure as a MOL file. V2000 wherever it can say everything - which
 * it cannot for a dative bond, or past 999 atoms or bonds - and V3000 where
 * it cannot, unless one is asked for.
 *
 * Coordinates are scaled so the editor's nominal bond comes out at 1.5 Å;
 * hydrogens are left implicit, as the drawing has them.
 */
export function writeMolfile(
  model: WriterModel,
  options: { title?: string; version?: "V2000" | "V3000" | "auto" } = {},
): string {
  const title = (options.title ?? "").replace(/[\r\n]+/g, " ").slice(0, 80);
  const version = options.version ?? "auto";
  const needsV3000 =
    model.atoms.length > 999 ||
    model.bonds.length > 999 ||
    model.bonds.some((b) => b.dative && b.order === 1);
  return version === "V3000" || (version === "auto" && needsV3000)
    ? writeV3000(model, title)
    : writeV2000(model, title);
}

/** The structure as a one-record SD file. */
export function writeSdf(
  model: WriterModel,
  options: { title?: string } = {},
): string {
  return writeMolfile(model, options) + "$$$$\n";
}
