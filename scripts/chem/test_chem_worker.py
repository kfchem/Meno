"""Tests for the chemistry worker (src-tauri/resources/workers/chem_worker.py).

They need RDKit, so they run in an environment built from the chem lock:

    uv venv .venv-chem --python 3.12
    uv pip install --python .venv-chem/bin/python --require-hashes --no-deps \
        -r src-tauri/resources/py/requirements.chem.lock
    .venv-chem/bin/python -m unittest scripts/chem/test_chem_worker.py
"""

import importlib.util
import itertools
import json
import math
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


def v2000(atoms, bonds):
    """A V2000 block: atoms as (element, x, y), bonds as (first, second,
    order, "up" / "down" / None), 0-based, a wedge narrow at `first`."""
    lines = ["", "  test", "", f"{len(atoms):3d}{len(bonds):3d}  0  0  0  0  0  0  0  0999 V2000"]
    for el, x, y in atoms:
        lines.append(f"{x:10.4f}{y:10.4f}{0:10.4f} {el:<3} 0  0")
    stereo = {None: 0, "up": 1, "down": 6}
    for a, b, order, s in bonds:
        lines.append(f"{a + 1:3d}{b + 1:3d}{order:3d}{stereo[s]:3d}")
    return "\n".join(lines + ["M  END"]) + "\n"


def atom_coords(block):
    """The (x, y) of every atom of a V2000 block."""
    lines = block.splitlines()
    n = int(lines[3][:3])
    return [(float(l[:10]), float(l[10:20])) for l in lines[4:4 + n]]


def with_coords(block, coords):
    """A V2000 block with its atoms moved."""
    lines = block.splitlines()
    for i, (x, y) in enumerate(coords):
        lines[4 + i] = f"{x:10.4f}{y:10.4f}" + lines[4 + i][20:]
    return "\n".join(lines) + "\n"


def centre(coords):
    return (sum(p[0] for p in coords) / len(coords), sum(p[1] for p in coords) / len(coords))


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

    def test_cleans_up_where_it_was_drawn_keeping_its_stereo(self):
        r = ask("clean", molblock=PCPA)["result"]
        coords = r["coords"]
        self.assertEqual(len(coords), 13)
        # the wedge still says what it did, so it stays where it was drawn
        self.assertIsNone(r["wedges"])
        self.assertEqual(
            ask("to_smiles", molblock=with_coords(PCPA, coords))["result"]["smiles"],
            "N[C@@H](Cc1ccc(Cl)cc1)C(=O)O",
        )
        # at the drawing's bond length, and over where it was drawn
        self.assertAlmostEqual(math.dist(coords[7], coords[8]), 1.5, delta=0.1)
        drawn = atom_coords(PCPA)
        self.assertLess(
            math.dist(centre(coords), centre(drawn)), 1e-6)
        self.assertLess(max(math.dist(p, q) for p, q in zip(coords, drawn)), 1.0)

    def test_rewedges_only_when_the_drawn_wedges_would_say_otherwise(self):
        # CHFClBr, drawn with its four neighbours in every order and a wedge
        # on each bond in turn: however it is laid out, the same molecule
        spots = [(0, 1.5), (1.3, -0.75), (-1.3, -0.75), (0.4, -1.4)]
        rewedged = 0
        for order in itertools.permutations(["F", "Cl", "Br", "C"]):
            for wedge in range(4):
                atoms = [("C", 0, 0)] + [(el, x, y) for el, (x, y) in zip(order, spots)]
                bonds = [(0, j + 1, 1, "up" if j == wedge else None) for j in range(4)]
                block = v2000(atoms, bonds)
                before = ask("to_smiles", molblock=block)["result"]["smiles"]
                r = ask("clean", molblock=block)["result"]
                if r["wedges"] is not None:
                    rewedged += 1
                    bonds = [(0, j + 1, 1, None) for j in range(4)]
                    for w in r["wedges"]:
                        a, b, order_, _ = bonds[w["bond"]]
                        other = b if w["narrow"] == a else a
                        bonds[w["bond"]] = (w["narrow"], other, order_, w["stereo"])
                moved = [(el, x, y) for (el, _, _), (x, y) in zip(atoms, r["coords"])]
                after = ask("to_smiles", molblock=v2000(moved, bonds))["result"]["smiles"]
                self.assertEqual(before, after, (order, wedge))
        self.assertGreater(rewedged, 0)

    def test_leaves_each_fragment_where_it_was(self):
        block = v2000(
            [("C", 0, 0), ("C", 1.5, 0), ("O", 10, 0), ("C", 11.5, 0.3), ("N", 20, 5)],
            [(0, 1, 1, None), (2, 3, 1, None)],
        )
        coords = ask("clean", molblock=block)["result"]["coords"]
        self.assertEqual(coords[4], [20.0, 5.0])
        self.assertLess(math.dist(coords[2], (10, 0)), 0.1)

    def test_cleans_up_what_it_cannot_make_sense_of(self):
        five = v2000(
            [("C", 0, 0), ("C", 1.5, 0), ("C", -1.5, 0), ("C", 0, 1.5), ("C", 0, -1.5), ("C", 1, 1)],
            [(0, j, 1, None) for j in range(1, 6)],
        )
        r = ask("clean", molblock=five)
        self.assertTrue(r["ok"])
        self.assertIsNone(r["result"]["wedges"])

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
        self.assertEqual(r["atoms"][8]["valenceError"], {"valence": 5, "most": 4})
        self.assertIsNone(r["smiles"])

    def test_labels_one_fragment_when_another_makes_no_sense(self):
        # (S)-CHFClBr beside a carbon with five bonds
        block = v2000(
            [("C", 0, 0), ("F", 0, 1.5), ("Cl", 1.3, -0.75), ("Br", -1.3, -0.75),
             ("C", 10, 0), ("C", 11.5, 0), ("C", 8.5, 0), ("C", 10, 1.5), ("C", 10, -1.5), ("C", 11, 1)],
            [(0, 1, 1, "up"), (0, 2, 1, None), (0, 3, 1, None)]
            + [(4, j, 1, None) for j in range(5, 10)],
        )
        r = ask("analyse", molblock=block)["result"]
        self.assertEqual(r["atoms"][0].get("cip"), "S")
        self.assertIn("valenceError", r["atoms"][4])
        self.assertIsNone(r["smiles"])

    def test_labels_double_bonds_e_and_z(self):
        trans = v2000(
            [("C", 0, 0), ("C", 1.3, 0.75), ("C", 2.6, 0), ("C", 3.9, 0.75)],
            [(0, 1, 1, None), (1, 2, 2, None), (2, 3, 1, None)],
        )
        self.assertEqual(ask("analyse", molblock=trans)["result"]["bonds"][1]["cip"], "E")

    def test_reads_an_unknown_atom_as_any_atom(self):
        # what the editor writes for a label that is not an element
        block = v2000([("C", 0, 0), ("*", 1.5, 0)], [(0, 1, 1, None)])
        self.assertEqual(ask("to_smiles", molblock=block)["result"]["smiles"], "*C")

    def test_answers_what_it_cannot_do_with_an_error_not_a_crash(self):
        self.assertEqual(ask("exec", code="1")["error"], "no such request: exec")
        self.assertFalse(ask("from_smiles", smiles="C1CC")["ok"])
        self.assertFalse(worker.answer("not json")["ok"])


if __name__ == "__main__":
    unittest.main()
