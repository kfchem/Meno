import { elements } from "./atomUtils";
import type { Molecule, ParsedAtom, ParsedBond, StereoGroup } from "../lib/chem/molecule";
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
  const groups = stereoGroupsOf(ct);
  const atoms: Atom[] = ct.atoms.map((a, i) => ({
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
    ...(a.map ? { map: a.map } : {}),
    ...(a.invRet ? { invRet: a.invRet } : {}),
    ...(a.exactChange ? { exactChange: true } : {}),
    ...(groups.atoms.get(i) ? { stereoGroup: groups.atoms.get(i) } : {}),
  }));
  const bonds: Bond[] = ct.bonds.map((b) => {
    const code =
      b.stereo === "up" ? 1 : b.stereo === "down" ? 6 : b.stereo === "either" ? (b.type === 2 ? 3 : 4) : undefined;
    return { a1: b.a1, a2: b.a2, order: b.type, ...(code ? { stereoCode: code } : {}) };
  });
  return { atoms, bonds, ct };
}

/**
 * Each stereocentre's and stereo bond's enhanced stereo group: as the
 * file's collections have them (MDLV30/STEABS, STERACn, STERELn and the bond
 * collections STEBABS, STEBRACn, STEBRELn) - or, with none, the chiral flag
 * set for all of them: every centre a wedge starts at absolute ("CTfile
 * Formats", the counts line).
 */
export function stereoGroupsOf(ct: CtMolecule): { atoms: Map<number, StereoGroup>; bonds: Map<number, StereoGroup> } {
  const atoms = new Map<number, StereoGroup>();
  const bonds = new Map<number, StereoGroup>();
  for (const c of ct.collections) {
    const m = /^MDLV30\/STE(B?)(ABS|RAC|REL)(\d*)$/i.exec(c.name);
    if (!m) continue;
    const kind = m[2].toUpperCase() === "ABS" ? "abs" : m[2].toUpperCase() === "RAC" ? "and" : "or";
    const group: StereoGroup = kind === "abs" ? { kind } : { kind, n: Number.parseInt(m[3] || "1", 10) };
    if (m[1]) for (const b of c.bonds) bonds.set(b, group);
    else for (const a of c.atoms) atoms.set(a, group);
  }
  if (!atoms.size && !bonds.size && ct.chiral) {
    for (const b of ct.bonds) if (b.stereo === "up" || b.stereo === "down") atoms.set(b.a1, { kind: "abs" });
  }
  return { atoms, bonds };
}

/** An SDfile's (or a molfile's) molecules, V2000 or V3000, as "CTfile Formats" has them. */
export function parseSDF(sdf: string): Molecule[] {
  return readSDfile(sdf).map(fromCtfile);
}

const covalent = new Map<string, number>();

/** An element's single-bond covalent radius, in ångströms; 1.5 for one not known. */
function covalentRadius(el: string): number {
  let r = covalent.get(el);
  if (r === undefined) {
    r = elements.find((e) => e.symbol === el)?.single ?? 1.5;
    covalent.set(el, r);
  }
  return r;
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

    // (each atom's covalent radius looked up once, not once for every pair:
    // a trajectory of hundreds of frames is read quickly)
    const radii = atoms.map((a) => covalentRadius(a.el));
    const bonds: Bond[] = [];
    for (let m = 0; m < atoms.length; m++) {
      const a1 = atoms[m];
      for (let n = m + 1; n < atoms.length; n++) {
        const a2 = atoms[n];
        const threshold = (radii[m] + radii[n]) * 1.1;
        const dx = a1.x - a2.x;
        const dy = a1.y - a2.y;
        const dz = a1.z - a2.z;
        if (dx * dx + dy * dy + dz * dz < threshold * threshold) {
          bonds.push({ a1: m, a2: n, order: 1 });
        }
      }
    }

    frames.push({ atoms, bonds });
    i += 2 + atomCount;
  }

  return frames;
}
