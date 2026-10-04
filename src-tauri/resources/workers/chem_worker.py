"""Meno's chemistry worker: RDKit, answering a fixed set of requests.

One JSON object per line on stdin, one per line back on stdout:

    {"id": 7, "op": "to_smiles", "molblock": "..."}
    {"id": 7, "ok": true, "result": {"smiles": "CCO"}}
    {"id": 7, "ok": false, "error": "..."}

It runs no code it is sent - only the operations below - and needs no
network. When RDKit has been imported it says so:

    {"event": "ready", "rdkit": "2026.03.6"}

Structures come in as MOL blocks, V2000 or V3000, and go back as V3000 ones
with their atoms in the order they came in. (Clean-up is Meno's own layout
engine's, in the app: src/lib/layout.) Their 3D structures go back as
atoms, bonds and coordinates: the atoms in the order they came in, the
hydrogens made for them after.
"""

import json
import sys

from rdkit import Chem, RDLogger, rdBase
from rdkit.Chem import (
    rdCIPLabeler,
    rdDepictor,
    rdDistGeom,
    rdForceFieldHelpers,
    rdMolAlign,
)
from rdkit.Chem.EnumerateStereoisomers import (
    EnumerateStereoisomers,
    StereoEnumerationOptions,
)

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
    # an H drawn to carry a wedge says its centre's configuration, which
    # the SMILES says without it
    return {"smiles": Chem.MolToSmiles(Chem.RemoveHs(read(m["molblock"])))}


def op_from_smiles(m):
    mol = Chem.MolFromSmiles(m["smiles"])
    if mol is None:
        raise ValueError("not a SMILES RDKit can read")
    rdDepictor.Compute2DCoords(mol)
    return {"molblock": Chem.MolToV3KMolBlock(mol)}


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


# --- 3D structures -----------------------------------------------------------

#: The most stereoisomers a structure is made in, all at once.
MOST_ISOMERS = 32
#: How many conformers are tried for each: the same shape twice is kept once.
CONFORMERS = 30
#: Conformers closer than this, in angstroms over their heavy atoms, are one.
SAME_SHAPE = 0.5
#: Kilocalories per mole in a hartree: energies go back in hartrees.
KCAL_PER_HARTREE = 627.509474


def open_stereo(mol):
    """The stereocentres and double bonds a structure leaves open: those
    that could have a configuration, and are drawn without one."""
    atoms, bonds = [], []
    for si in Chem.FindPotentialStereo(Chem.Mol(mol), cleanIt=True):
        if si.specified != Chem.StereoSpecified.Unspecified:
            continue
        if si.type == Chem.StereoType.Atom_Tetrahedral:
            atoms.append(si.centeredOn)
        elif si.type == Chem.StereoType.Bond_Double:
            bonds.append(si.centeredOn)
    return sorted(atoms), sorted(bonds)


def isomers_of(mol):
    """Each stereoisomer the open stereocentres and double bonds give, the
    ones drawn kept as drawn; the structure itself when none is open."""
    options = StereoEnumerationOptions(onlyUnassigned=True, unique=True, maxIsomers=MOST_ISOMERS)
    return list(EnumerateStereoisomers(mol, options=options)) or [mol]


def op_open_stereo(m):
    """What a 3D structure would have to choose: the open stereocentres and
    double bonds, and how many stereoisomers they make."""
    mol = read(m["molblock"])
    atoms, bonds = open_stereo(mol)
    count = len(isomers_of(mol)) if atoms or bonds else 1
    return {"atoms": atoms, "bonds": bonds, "isomers": count}


def kekule_order(bond):
    # (aromatic rings as alternating bonds: a 3D structure's bonds are drawn
    # as single, double and triple)
    return {Chem.BondType.SINGLE: 1, Chem.BondType.DOUBLE: 2, Chem.BondType.TRIPLE: 3}.get(bond.GetBondType(), 1)


def conformers(mol, count=CONFORMERS, seed=0x4D45):
    """A stereoisomer's conformers, embedded (ETKDG) and optimised (MMFF94,
    or UFF where MMFF has no parameters), lowest energy first, the same
    shape twice kept once, and each laid over the first by its heavy atoms."""
    mol = Chem.AddHs(mol)
    params = rdDistGeom.ETKDGv3()
    params.randomSeed = seed
    params.pruneRmsThresh = SAME_SHAPE
    params.numThreads = 0  # (every core)
    ids = list(rdDistGeom.EmbedMultipleConfs(mol, numConfs=count, params=params))
    if not ids:
        # (a crowded cage embeds from random coordinates where it does not otherwise)
        params.useRandomCoords = True
        ids = list(rdDistGeom.EmbedMultipleConfs(mol, numConfs=count, params=params))
    if not ids:
        raise ValueError("no 3D structure could be made of it")
    if rdForceFieldHelpers.MMFFHasAllMoleculeParams(mol):
        field, results = "MMFF94", rdForceFieldHelpers.MMFFOptimizeMoleculeConfs(mol, numThreads=0, maxIters=2000)
    else:
        field, results = "UFF", rdForceFieldHelpers.UFFOptimizeMoleculeConfs(mol, numThreads=0, maxIters=2000)
    energy = {cid: e for cid, (_, e) in zip(ids, results)}
    heavy = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() > 1]
    kept = []
    for cid in sorted(ids, key=lambda c: energy[c]):
        if kept:
            # (laid over the lowest, which keeps it so for the overlay)
            rms = rdMolAlign.AlignMol(mol, mol, prbCid=cid, refCid=kept[0], atomMap=[(i, i) for i in heavy])
            if rms < SAME_SHAPE or any(
                rdMolAlign.CalcRMS(mol, mol, prbId=cid, refId=k, map=[[(i, i) for i in heavy]]) < SAME_SHAPE
                for k in kept[1:]
            ):
                continue
        kept.append(cid)
    shown = Chem.Mol(mol)
    Chem.Kekulize(shown, clearAromaticFlags=True)
    return {
        "atoms": [{"el": a.GetSymbol(), "charge": a.GetFormalCharge()} for a in mol.GetAtoms()],
        "bonds": [
            {"a1": b.GetBeginAtomIdx(), "a2": b.GetEndAtomIdx(), "order": kekule_order(b)}
            for b in shown.GetBonds()
        ],
        "frames": [
            [round(v, 4) for p in mol.GetConformer(cid).GetPositions() for v in p] for cid in kept
        ],
        "energies": [energy[cid] / KCAL_PER_HARTREE for cid in kept],
        "field": field,
    }


def op_conformers(m):
    """Conformers of a structure drawn in 2D. With stereocentres or double
    bonds left open, `isomers` says what to make: "one" (the first of its
    stereoisomers) or "all" (each, up to MOST_ISOMERS). Each goes back with
    the CIP label of every stereocentre and double bond (`cip`), and of the
    ones that were left open (`chosen`), atom by atom and bond by bond."""
    mol = read(m["molblock"])
    atoms, bonds = open_stereo(mol)
    isomers = isomers_of(mol)
    if m.get("isomers", "one") != "all":
        isomers = isomers[:1]
    made = []
    for iso in isomers:
        entry = conformers(iso, int(m.get("count", CONFORMERS)))
        rdCIPLabeler.AssignCIPLabels(iso)
        entry["cip"] = {
            "atoms": {str(a.GetIdx()): a.GetProp("_CIPCode") for a in iso.GetAtoms() if a.HasProp("_CIPCode")},
            "bonds": {str(b.GetIdx()): b.GetProp("_CIPCode") for b in iso.GetBonds() if b.HasProp("_CIPCode")},
        }
        entry["chosen"] = {
            "atoms": {str(i): iso.GetAtomWithIdx(i).GetProp("_CIPCode") for i in atoms if iso.GetAtomWithIdx(i).HasProp("_CIPCode")},
            "bonds": {str(i): iso.GetBondWithIdx(i).GetProp("_CIPCode") for i in bonds if iso.GetBondWithIdx(i).HasProp("_CIPCode")},
        }
        entry["smiles"] = Chem.MolToSmiles(iso)
        made.append(entry)
    return {"isomers": made}


def op_drawing_of(m):
    """A molecule in 3D as a formula to draw: its heavy atoms, in their
    order, laid out in 2D, wedged as its 3D structure says (for Meno's engine
    to draw afresh). Where its bonds' orders are not known - all single, as a
    file of coordinates alone gives them - they are found from where its
    atoms are, if they can be."""
    mol = Chem.MolFromMolBlock(m["molblock"], sanitize=False, removeHs=False)
    if mol is None:
        raise ValueError("not a MOL block RDKit can read")
    if m.get("perceive"):
        from rdkit.Chem import rdDetermineBonds

        try:
            found = Chem.Mol(mol)
            rdDetermineBonds.DetermineBondOrders(found, charge=int(m.get("charge", 0)))
            mol = found
        except Exception:
            pass  # (as the file has them, then)
    problem = Chem.SanitizeMol(mol, catchErrors=True)
    if problem != Chem.SanitizeFlags.SANITIZE_NONE:
        raise ValueError(f"cannot make sense of the structure ({problem})")
    Chem.AssignStereochemistryFrom3D(mol)
    heavy = Chem.RemoveHs(mol)
    heavy.RemoveAllConformers()
    rdDepictor.Compute2DCoords(heavy)
    return {"molblock": Chem.MolToV3KMolBlock(heavy)}


OPS = {
    "ping": op_ping,
    "to_smiles": op_to_smiles,
    "from_smiles": op_from_smiles,
    "analyse": op_analyse,
    "open_stereo": op_open_stereo,
    "conformers": op_conformers,
    "drawing_of": op_drawing_of,
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
