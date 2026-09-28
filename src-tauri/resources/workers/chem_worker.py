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
engine's, in the app: src/lib/layout.)
"""

import json
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
