import { elements } from "./atomUtils";
import type { Molecule, ParsedAtom, ParsedBond } from "../lib/chem/molecule";
import { readSDfile, type CtMolecule } from "../lib/chem/ctfile";

// (a file's molecule is the one in lib/chem/molecule; the names it had here)
export type { Molecule };
export type Atom = ParsedAtom;
export type Bond = ParsedBond;

/**
 * A CTfile molecule (lib/chem/ctfile) as the rest of the app takes a file's
 * molecule: its atoms' elements and chemistry, its bonds' types and V2000
 * stereo codes - and the whole of what the file said, as `ct`.
 */
export function fromCtfile(ct: CtMolecule): Molecule {
  const atoms: Atom[] = ct.atoms.map((a) => ({
    x: a.x,
    y: a.y,
    z: a.z,
    // an alias is the label the atom is drawn with: it is what the atom is
    // taken to be (an abbreviation, if the dictionary knows it)
    el: a.alias || a.symbol,
    ...(a.charge ? { charge: a.charge } : {}),
    ...(a.radical ? { radical: a.radical } : {}),
    ...(a.mass ? { isotope: a.mass } : {}),
    ...(a.rgroups?.length ? { rgroups: a.rgroups } : {}),
    ...(a.list ? { list: a.list } : {}),
    ...(a.valence != null ? { valence: a.valence } : {}),
    ...(a.hCount != null ? { hCount: a.hCount } : {}),
  }));
  const bonds: Bond[] = ct.bonds.map((b) => {
    const code =
      b.stereo === "up" ? 1 : b.stereo === "down" ? 6 : b.stereo === "either" ? (b.type === 2 ? 3 : 4) : undefined;
    return { a1: b.a1, a2: b.a2, order: b.type, ...(code ? { stereoCode: code } : {}) };
  });
  return { atoms, bonds, ct };
}

/** An SDfile's (or a molfile's) molecules, V2000 or V3000, as "CTfile Formats" has them. */
export function parseSDF(sdf: string): Molecule[] {
  return readSDfile(sdf).map(fromCtfile);
}

export function parseXYZ(xyz: string): Molecule[] {
  const lines = xyz.trim().split("\n");
  const frames: Molecule[] = [];

  let i = 0;
  while (i < lines.length) {
    const atomCount = parseInt(lines[i].trim());
    const atomLines = lines.slice(i + 2, i + 2 + atomCount);

    const atoms: Atom[] = atomLines.map((line) => {
      const [element, x, y, z] = line.trim().split(/\s+/);
      return {
        el: element,
        x: parseFloat(x),
        y: parseFloat(y),
        z: parseFloat(z),
      };
    });

    const bonds: Bond[] = [];
    for (let m = 0; m < atoms.length; m++) {
      for (let n = m + 1; n < atoms.length; n++) {
        const a1 = atoms[m];
        const a2 = atoms[n];
        const r1 = elements.find((e) => e.symbol === a1.el)?.single ?? 1.5;
        const r2 = elements.find((e) => e.symbol === a2.el)?.single ?? 1.5;
        const threshold = (r1 + r2) * 1.1;

        const dx = a1.x - a2.x;
        const dy = a1.y - a2.y;
        const dz = a1.z - a2.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < threshold) {
          bonds.push({ a1: m, a2: n, order: 1 });
        }
      }
    }

    frames.push({ atoms, bonds });
    i += 2 + atomCount;
  }

  return frames;
}
