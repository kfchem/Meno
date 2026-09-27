"""The benchmark molecules as RDKit lays them out, to measure Meno's own
layout against: each molecule's graph (what a layout engine is given) and
the coordinates two engines give it - CoordGen, and RDKit's own depictor
with its ring-system templates - with the wedges RDKit puts on them.

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

RDLogger.DisableLog("rdApp.*")
here = pathlib.Path(__file__).resolve().parent
root = here.parents[1]


def graph(mol):
    kek = Chem.Mol(mol)
    Chem.Kekulize(kek, clearAromaticFlags=True)
    return {
        "atoms": [
            {"el": a.GetSymbol(), "charge": a.GetFormalCharge(), "hs": a.GetTotalNumHs()}
            for a in kek.GetAtoms()
        ],
        "bonds": [
            {
                "a": b.GetBeginAtomIdx(),
                "b": b.GetEndAtomIdx(),
                "order": {1.0: 1, 2.0: 2, 3.0: 3}.get(b.GetBondTypeAsDouble(), 1),
            }
            for b in kek.GetBonds()
        ],
    }


def laid_out(mol, coordgen):
    m = Chem.Mol(mol)
    rdDepictor.SetPreferCoordGen(coordgen)
    t = time.perf_counter()
    if coordgen:
        rdDepictor.Compute2DCoords(m)
    else:
        rdDepictor.Compute2DCoords(m, useRingTemplates=True)
    ms = (time.perf_counter() - t) * 1000
    conf = m.GetConformer()
    Chem.WedgeMolBonds(m, conf)
    wedges = [
        {
            "bond": b.GetIdx(),
            "narrow": b.GetBeginAtomIdx(),
            "stereo": "up" if b.GetBondDir() == Chem.BondDir.BEGINWEDGE else "down",
        }
        for b in m.GetBonds()
        if b.GetBondDir() in (Chem.BondDir.BEGINWEDGE, Chem.BondDir.BEGINDASH)
    ]
    p = conf.GetPositions()
    return {
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
