"""Tests for the chemistry worker (src-tauri/resources/workers/chem_worker.py).

They need RDKit, so they run in an environment built from the chem lock:

    uv venv .venv-chem --python 3.12
    uv pip install --python .venv-chem/bin/python --require-hashes --no-deps \
        -r src-tauri/resources/py/requirements.chem.lock
    .venv-chem/bin/python -m unittest scripts/chem/test_chem_worker.py
"""

import importlib.util
import json
import pathlib
import unittest

WORKER = pathlib.Path(__file__).resolve().parents[2] / "src-tauri/resources/workers/chem_worker.py"
spec = importlib.util.spec_from_file_location("chem_worker", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

# 4-chlorophenylalanine as the editor writes it: the amino group on a wedge
# from the alpha carbon (atom 8), a ring of alternating bonds.
PCPA = """
  Meno

 13 13  0  0  0  0  0  0  0  0999 V2000
    0.0000    1.5000    0.0000 C   0  0
   -1.2990    0.7500    0.0000 C   0  0
   -1.2990   -0.7500    0.0000 C   0  0
    0.0000   -1.5000    0.0000 C   0  0
    1.2990   -0.7500    0.0000 C   0  0
    1.2990    0.7500    0.0000 C   0  0
    2.5981    1.5000    0.0000 C   0  0
    3.8971    0.7500    0.0000 C   0  0
    5.1962    1.5000    0.0000 C   0  0
    5.1962    3.0000    0.0000 O   0  0
    6.4952    0.7500    0.0000 O   0  0
    3.8971   -0.7500    0.0000 N   0  0
   -2.5981   -1.5000    0.0000 Cl  0  0
  1  2  2  0
  2  3  1  0
  3  4  2  0
  4  5  1  0
  5  6  2  0
  6  1  1  0
  6  7  1  0
  7  8  1  0
  8  9  1  0
  9 10  2  0
  9 11  1  0
  8 12  1  1
  3 13  1  0
M  END
"""


def ask(op, **args):
    return worker.answer(json.dumps({"id": 1, "op": op, **args}))


class ChemWorkerTest(unittest.TestCase):
    def test_writes_a_canonical_smiles_with_its_stereo(self):
        r = ask("to_smiles", molblock=PCPA)
        self.assertTrue(r["ok"])
        self.assertEqual(r["result"]["smiles"], "N[C@@H](Cc1ccc(Cl)cc1)C(=O)O")

    def test_reads_a_smiles_into_a_v3000_block_with_2d_coordinates(self):
        r = ask("from_smiles", smiles="C[C@H](N)C(=O)O")
        block = r["result"]["molblock"]
        self.assertIn("V3000", block)
        # and back to the same molecule
        self.assertEqual(ask("to_smiles", molblock=block)["result"]["smiles"], "C[C@H](N)C(=O)O")

    def test_cleans_up_keeping_the_atoms_in_order(self):
        block = ask("clean", molblock=PCPA)["result"]["molblock"]
        self.assertEqual(ask("to_smiles", molblock=block)["result"]["smiles"],
                         "N[C@@H](Cc1ccc(Cl)cc1)C(=O)O")
        atoms = ask("analyse", molblock=block)["result"]["atoms"]
        self.assertEqual([a["hydrogens"] for a in atoms][11], 2)  # the N, still twelfth

    def test_analyses_hydrogens_aromaticity_and_stereo(self):
        r = ask("analyse", molblock=PCPA)["result"]
        atoms = r["atoms"]
        self.assertEqual(atoms[7].get("cip"), "S")  # L-amino acid
        self.assertEqual(atoms[11]["hydrogens"], 2)  # NH2
        self.assertTrue(all(atoms[i].get("aromatic") for i in range(6)))
        self.assertNotIn("valenceError", atoms[8])

    def test_names_the_atoms_whose_valence_is_wrong(self):
        bad = PCPA.replace("  9 10  2  0", "  9 10  3  0")  # C#O on a carboxyl carbon
        r = ask("analyse", molblock=bad)["result"]
        self.assertIn("valenceError", r["atoms"][8])
        self.assertIsNone(r["smiles"])

    def test_answers_what_it_cannot_do_with_an_error_not_a_crash(self):
        self.assertEqual(ask("exec", code="1")["error"], "no such request: exec")
        self.assertFalse(ask("from_smiles", smiles="C1CC")["ok"])
        self.assertFalse(worker.answer("not json")["ok"])


if __name__ == "__main__":
    unittest.main()
