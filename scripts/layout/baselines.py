"""The benchmark molecules as RDKit lays them out, to measure Meno's own
layout against: each molecule's graph (what a layout engine is given) and
the coordinates two engines give it - CoordGen, and RDKit's own depictor
with its ring-system templates - with the H atoms and wedges RDKit adds to
draw them.

Runs in the environment of the chem lock (RDKit):

    <chem python> scripts/layout/baselines.py     # writes .layout/baselines.json

The app's own chem environment will do: it is under the app's data folder,
at uv/chem/venv.
"""

import json
import pathlib
import time

from rdkit import Chem, RDLogger
from rdkit.Chem import rdDepictor
from rdkit.Chem.Draw import rdMolDraw2D

RDLogger.DisableLog("rdApp.*")
here = pathlib.Path(__file__).resolve().parent
root = here.parents[1]


def cis_trans(b):
    """A double bond's stereo as a layout engine needs it: an atom on each
    end, and whether those two are cis. RDKit's E and Z are taken against the
    neighbours it records for the bond, which rank highest (CIP)."""
    stereo = b.GetStereo()
    refs = list(b.GetStereoAtoms())
    if stereo == Chem.BondStereo.STEREONONE or len(refs) != 2:
        return None
    cis = stereo in (Chem.BondStereo.STEREOZ, Chem.BondStereo.STEREOCIS)
    return {"refs": refs, "cis": cis}


def graph(mol):
    kek = Chem.Mol(mol)
    Chem.Kekulize(kek, clearAromaticFlags=True)
    bonds = []
    for b in kek.GetBonds():
        bond = {
            "a": b.GetBeginAtomIdx(),
            "b": b.GetEndAtomIdx(),
            "order": {1.0: 1, 2.0: 2, 3.0: 3}.get(b.GetBondTypeAsDouble(), 1),
        }
        stereo = cis_trans(mol.GetBondWithIdx(b.GetIdx())) if bond["order"] == 2 else None
        if stereo:
            bond["stereo"] = stereo
        bonds.append(bond)
    return {
        "atoms": [
            {"el": a.GetSymbol(), "charge": a.GetFormalCharge(), "hs": a.GetTotalNumHs()}
            for a in kek.GetAtoms()
        ],
        "bonds": bonds,
    }


def laid_out(mol, coordgen):
    """A layout as RDKit would draw it: coordinates, then an H added to each
    stereocentre that needs one to show its stereo (a ring fusion, say) and
    the wedges put on - what RDKit's own drawing does before it draws."""
    m = Chem.Mol(mol)
    rdDepictor.SetPreferCoordGen(coordgen)
    t = time.perf_counter()
    if coordgen:
        rdDepictor.Compute2DCoords(m)
    else:
        rdDepictor.Compute2DCoords(m, useRingTemplates=True)
    ms = (time.perf_counter() - t) * 1000
    m = rdMolDraw2D.PrepareMolForDrawing(m, kekulize=True, addChiralHs=True, wedgeBonds=True)
    wedges = [
        {
            "bond": b.GetIdx(),
            "narrow": b.GetBeginAtomIdx(),
            "stereo": "up" if b.GetBondDir() == Chem.BondDir.BEGINWEDGE else "down",
        }
        for b in m.GetBonds()
        if b.GetBondDir() in (Chem.BondDir.BEGINWEDGE, Chem.BondDir.BEGINDASH)
    ]
    p = m.GetConformer().GetPositions()
    return {
        "graph": graph(m),
        "x": [round(float(v), 4) for v in p[:, 0]],
        "y": [round(float(v), 4) for v in p[:, 1]],
        "wedges": wedges,
        "ms": round(ms, 1),
    }


def main():
    listed = json.loads((here / "molecules.json").read_text())["molecules"]
    out = []
    for m in listed:
        mol = Chem.MolFromSmiles(m.get("smiles") or "")
        if mol is None:
            print(f"{m['name']}: no SMILES")
            continue
        entry = {
            "name": m["name"],
            "graph": graph(mol),
            "layouts": {
                "CoordGen": laid_out(mol, True),
                "RDKit": laid_out(mol, False),
            },
        }
        out.append(entry)
        print(f"{m['name']:28} {mol.GetNumAtoms():4} atoms")
    dest = root / ".layout"
    dest.mkdir(exist_ok=True)
    (dest / "baselines.json").write_text(json.dumps({"molecules": out}))
    print(f"{len(out)} molecules -> {dest / 'baselines.json'}")


if __name__ == "__main__":
    main()
