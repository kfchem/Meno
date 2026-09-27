"""Meno's chemistry worker: RDKit, answering a fixed set of requests.

One JSON object per line on stdin, one per line back on stdout:

    {"id": 7, "op": "to_smiles", "molblock": "..."}
    {"id": 7, "ok": true, "result": {"smiles": "CCO"}}
    {"id": 7, "ok": false, "error": "..."}

It runs no code it is sent - only the operations below - and needs no
network. When RDKit has been imported it says so:

    {"event": "ready", "rdkit": "2026.03.6"}

Structures come in as MOL blocks, V2000 or V3000, and go back as V3000 ones
- or, from a clean-up, as coordinates - with their atoms in the order they
came in.
"""

import json
import math
import statistics
import sys

from rdkit import Chem, RDLogger, rdBase
from rdkit.Chem import rdCIPLabeler, rdDepictor

# RDKit's own warnings go to stderr, not into the answers.
RDLogger.DisableLog("rdApp.*")
rdDepictor.SetPreferCoordGen(True)


def read(molblock, sanitize=True):
    """A molecule from a MOL block, kept as drawn: no hydrogens removed."""
    mol = Chem.MolFromMolBlock(molblock, sanitize=False, removeHs=False)
    if mol is None:
        raise ValueError("not a MOL block RDKit can read")
    if sanitize:
        problem = Chem.SanitizeMol(mol, catchErrors=True)
        if problem != Chem.SanitizeFlags.SANITIZE_NONE:
            raise ValueError(f"cannot make sense of the structure ({problem})")
        Chem.AssignChiralTypesFromBondDirs(mol)
        Chem.AssignStereochemistry(mol, cleanIt=True, force=True)
    return mol


def op_ping(_):
    return {"rdkit": rdBase.rdkitVersion}


def op_to_smiles(m):
    return {"smiles": Chem.MolToSmiles(read(m["molblock"]))}


def op_from_smiles(m):
    mol = Chem.MolFromSmiles(m["smiles"])
    if mol is None:
        raise ValueError("not a SMILES RDKit can read")
    rdDepictor.Compute2DCoords(mol)
    return {"molblock": Chem.MolToV3KMolBlock(mol)}


def read_loose(molblock):
    """A molecule to lay out even when its chemistry is wrong - a carbon
    with five bonds is still somewhere on the page."""
    try:
        return read(molblock), True
    except ValueError:
        mol = read(molblock, sanitize=False)
        mol.UpdatePropertyCache(strict=False)
        Chem.GetSymmSSSR(mol)
        return mol, False


def bond_length(mol, xy):
    """The typical bond length of a drawing: the median, so that one bond
    drawn long does not set it."""
    lengths = [
        math.dist(xy[b.GetBeginAtomIdx()], xy[b.GetEndAtomIdx()])
        for b in mol.GetBonds()
    ]
    lengths = [d for d in lengths if d > 1e-6]
    return statistics.median(lengths) if lengths else None


def laid_over(new, drawn, atoms):
    """`new`, for these atoms, turned about its centre - and turned over, if
    that lies closer - to lie over `drawn` as nearly as it can."""
    n = len(atoms)
    pc = [sum(drawn[i][k] for i in atoms) / n for k in (0, 1)]
    qc = [sum(new[i][k] for i in atoms) / n for k in (0, 1)]
    best = None
    for flip in (1, -1):  # as laid out first; turned over only if closer
        q = [(new[i][0] - qc[0], flip * (new[i][1] - qc[1])) for i in atoms]
        p = [(drawn[i][0] - pc[0], drawn[i][1] - pc[1]) for i in atoms]
        dot = sum(a[0] * b[0] + a[1] * b[1] for a, b in zip(q, p))
        cross = sum(a[0] * b[1] - a[1] * b[0] for a, b in zip(q, p))
        t = math.atan2(cross, dot)
        c, s = math.cos(t), math.sin(t)
        out = [(c * x - s * y + pc[0], s * x + c * y + pc[1]) for x, y in q]
        err = sum(math.dist(o, drawn[i]) ** 2 for o, i in zip(out, atoms))
        if best is None or err < best[0] - 1e-9:
            best = (err, out)
    return dict(zip(atoms, best[1]))


def spread(xy, drawn, atoms):
    """How far a layout lies from the drawing, and the layout laid over it."""
    over = laid_over(xy, drawn, atoms)
    return sum(math.dist(over[i], drawn[i]) ** 2 for i in atoms), over


def side_of(mol, bond, atoms):
    """The atoms on the far side of a bond, from its end atom; the smaller
    side of the two."""
    start, stop = bond.GetEndAtomIdx(), bond.GetBeginAtomIdx()
    seen, todo = {start}, [start]
    while todo:
        for n in mol.GetAtomWithIdx(todo.pop()).GetNeighbors():
            j = n.GetIdx()
            if j != stop and j not in seen:
                seen.add(j)
                todo.append(j)
    return seen if len(seen) <= len(atoms) / 2 else set(atoms) - seen


def turned_over(xy, side, a, b):
    """The atoms of `side` turned over the line through atoms a and b."""
    (ax, ay), (bx, by) = xy[a], xy[b]
    dx, dy = bx - ax, by - ay
    d2 = dx * dx + dy * dy
    out = list(xy)
    for i in side:
        px, py = xy[i][0] - ax, xy[i][1] - ay
        t = (px * dx + py * dy) / d2
        out[i] = (ax + 2 * t * dx - px, ay + 2 * t * dy - py)
    return out


def crowded(xy, side, atoms, bonded, near):
    """Whether any atom that moved has come too close to one that did not."""
    rest = [j for j in atoms if j not in side]
    return any(
        math.dist(xy[i], xy[j]) < near
        for i in side
        for j in rest
        if (i, j) not in bonded
    )


def as_drawn(mol, new, drawn, atoms, length):
    """A fragment's fresh layout made to follow the drawing: laid over it,
    with each chain turned over its bonds whichever way it was drawn - an
    amino acid's NH2 stays on the side it was drawn on. Turning a chain
    over a single bond keeps every length and angle, and every double
    bond's geometry."""
    xy = list(new)
    err, over = spread(xy, drawn, atoms)
    inside = set(atoms)
    bonded = set()
    for b in mol.GetBonds():
        bonded.add((b.GetBeginAtomIdx(), b.GetEndAtomIdx()))
        bonded.add((b.GetEndAtomIdx(), b.GetBeginAtomIdx()))
    turns = [
        b for b in mol.GetBonds()
        if b.GetBondType() == Chem.BondType.SINGLE
        and not mol.GetRingInfo().NumBondRings(b.GetIdx())
        and b.GetBeginAtomIdx() in inside
        and b.GetBeginAtom().GetDegree() > 1
        and b.GetEndAtom().GetDegree() > 1
    ]
    for _ in range(4):  # until nothing turned over lies closer
        better = False
        for b in turns:
            side = side_of(mol, b, atoms)
            tried = turned_over(xy, side, b.GetBeginAtomIdx(), b.GetEndAtomIdx())
            e, o = spread(tried, drawn, atoms)
            if e < err - 1e-6 and not crowded(tried, side, atoms, bonded, 0.4 * length):
                xy, err, over, better = tried, e, o, True
        if not better:
            break
    return over


def stereo_of(mol):
    """What a structure's stereochemistry is, as its wedges say it."""
    return Chem.MolToSmiles(read(Chem.MolToV3KMolBlock(mol)))


def op_clean(m):
    """New 2D coordinates for the structure, atoms in the same order: each
    fragment laid out afresh at the drawing's bond length, then turned (and
    turned over, if that lies closer) to sit where it was drawn.

    The wedges stay on the bonds they were drawn on when, in the new
    layout, they still say the same stereochemistry; when they do not,
    RDKit's own wedging is given instead."""
    mol, sane = read_loose(m["molblock"])
    conf = mol.GetConformer()
    drawn = [tuple(conf.GetAtomPosition(i))[:2] for i in range(mol.GetNumAtoms())]
    want = Chem.MolToSmiles(mol) if sane else None
    target = bond_length(mol, drawn) or 1.5

    rdDepictor.Compute2DCoords(mol)
    conf = mol.GetConformer()
    new = [tuple(conf.GetAtomPosition(i))[:2] for i in range(mol.GetNumAtoms())]
    got = bond_length(mol, new)
    k = target / got if got else 1.0
    new = [(x * k, y * k) for x, y in new]
    placed = {}
    for atoms in Chem.GetMolFrags(mol, sanitizeFrags=False):
        if len(atoms) == 1:  # a lone atom stays where it is
            placed[atoms[0]] = drawn[atoms[0]]
        else:
            placed.update(as_drawn(mol, new, drawn, list(atoms), target))
    for i, (x, y) in placed.items():
        conf.SetAtomPosition(i, (x, y, 0.0))

    wedges = None
    if sane:
        Chem.ReapplyMolBlockWedging(mol)
        if stereo_of(mol) != want:
            for b in mol.GetBonds():
                if b.GetBondDir() in (Chem.BondDir.BEGINWEDGE, Chem.BondDir.BEGINDASH):
                    b.SetBondDir(Chem.BondDir.NONE)
            Chem.WedgeMolBonds(mol, conf)
            if stereo_of(mol) != want:
                raise ValueError("the structure could not be laid out keeping its stereochemistry")
            wedges = [
                {
                    "bond": b.GetIdx(),
                    "narrow": b.GetBeginAtomIdx(),  # the stereocentre
                    "stereo": "up" if b.GetBondDir() == Chem.BondDir.BEGINWEDGE else "down",
                }
                for b in mol.GetBonds()
                if b.GetBondDir() in (Chem.BondDir.BEGINWEDGE, Chem.BondDir.BEGINDASH)
            ]
    return {
        "coords": [list(placed[i]) for i in range(mol.GetNumAtoms())],
        "wedges": wedges,
    }


def too_many(atom):
    """An atom with more bonds than it can have: its valence, and the most
    it could be - by the element's own valences, or, when it carries a
    charge, by those of the element it then has the electrons of."""
    table = Chem.GetPeriodicTable()
    z = atom.GetAtomicNum() - atom.GetFormalCharge()
    allowed = [v for v in table.GetValenceList(z) if v >= 0] if 0 < z <= 118 else []
    entry = {"valence": atom.GetValence(Chem.ValenceType.EXPLICIT)}
    if allowed:
        entry["most"] = max(allowed)
    return entry


def op_analyse(m):
    """What a chemist checks by eye: hydrogens, valence, aromatic rings,
    stereo labels - per atom and bond, in the order they came in. Each
    fragment is made sense of on its own, so that a carbon with five bonds
    in one does not keep another's stereocentres from being labelled."""
    mol = read(m["molblock"], sanitize=False)
    mol.UpdatePropertyCache(strict=False)
    atoms = [{"index": a.GetIdx(), "hydrogens": a.GetTotalNumHs()} for a in mol.GetAtoms()]
    bonds = [{"index": b.GetIdx()} for b in mol.GetBonds()]
    for p in Chem.DetectChemistryProblems(mol):
        if p.GetType() == "AtomValenceException":
            atoms[p.GetAtomIdx()]["valenceError"] = too_many(mol.GetAtomWithIdx(p.GetAtomIdx()))

    mapping = []
    frags = Chem.GetMolFrags(
        mol, asMols=True, sanitizeFrags=False, fragsMolAtomMapping=mapping
    )
    sane = True
    for frag, index in zip(frags, mapping):
        if Chem.SanitizeMol(frag, catchErrors=True) != Chem.SanitizeFlags.SANITIZE_NONE:
            sane = False
            continue
        Chem.AssignChiralTypesFromBondDirs(frag)
        Chem.AssignStereochemistry(frag, cleanIt=True, force=True)
        rdCIPLabeler.AssignCIPLabels(frag)
        for a in frag.GetAtoms():
            entry = atoms[index[a.GetIdx()]]
            entry["hydrogens"] = a.GetTotalNumHs()
            if a.HasProp("_CIPCode"):
                entry["cip"] = a.GetProp("_CIPCode")
            if a.GetIsAromatic():
                entry["aromatic"] = True
        for b in frag.GetBonds():
            whole = mol.GetBondBetweenAtoms(
                index[b.GetBeginAtomIdx()], index[b.GetEndAtomIdx()]
            )
            entry = bonds[whole.GetIdx()]
            if b.GetIsAromatic():
                entry["aromatic"] = True
            if b.HasProp("_CIPCode"):
                entry["cip"] = b.GetProp("_CIPCode")
    return {
        "atoms": atoms,
        "bonds": bonds,
        "smiles": Chem.MolToSmiles(read(m["molblock"])) if sane else None,
    }


OPS = {
    "ping": op_ping,
    "to_smiles": op_to_smiles,
    "from_smiles": op_from_smiles,
    "clean": op_clean,
    "analyse": op_analyse,
}


def answer(line):
    try:
        m = json.loads(line)
    except ValueError:
        return {"ok": False, "error": "not JSON"}
    rid = m.get("id")
    op = OPS.get(m.get("op"))
    if op is None:
        return {"id": rid, "ok": False, "error": f"no such request: {m.get('op')}"}
    try:
        return {"id": rid, "ok": True, "result": op(m)}
    except Exception as e:  # an answer, never a crash
        return {"id": rid, "ok": False, "error": str(e) or type(e).__name__}


def main():
    print(json.dumps({"event": "ready", "rdkit": rdBase.rdkitVersion}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(answer(line)), flush=True)


if __name__ == "__main__":
    main()
