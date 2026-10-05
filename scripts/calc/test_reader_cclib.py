"""Tests for the cclib reader (src-tauri/resources/workers/reader_cclib.py).

They need cclib, so they run in an environment built from its lock:

    uv venv .venv-cclib --python 3.12
    uv pip install --python .venv-cclib/bin/python --require-hashes --no-deps \
        -r src-tauri/resources/py/requirements.reader-cclib.lock
    .venv-cclib/bin/python -m unittest scripts/calc/test_reader_cclib.py

The programs' outputs they read are not in the repository
(docs/WORKSPACE.md, stage 3): put small ones - cclib's own samples, from
its repository's data folder - in calc-samples/, as
calc-samples/ORCA/dvb_gopt.out and so on. Those tests are skipped where
the files are not there.
"""

import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/workers/reader_cclib.py"
SAMPLES = ROOT / "calc-samples"
spec = importlib.util.spec_from_file_location("reader_cclib", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def read(path):
    """The worker's answer to reading a sample, as the app asks for it."""
    line = json.dumps({"id": 1, "op": "read", "name": path.name, "text": path.read_text()})
    return worker.answer(line)


def sample(rel):
    path = SAMPLES / rel
    if not path.exists():
        raise unittest.SkipTest(f"no {rel} in calc-samples/")
    return path


class Protocol(unittest.TestCase):
    def test_says_what_it_is(self):
        a = worker.answer(json.dumps({"id": 3, "op": "ping"}))
        self.assertEqual((a["id"], a["ok"], a["result"]["reader"]), (3, True, "cclib"))

    def test_answers_a_failure_rather_than_crashing(self):
        a = worker.answer(json.dumps({"id": 4, "op": "read", "name": "x.out", "text": "nothing a program wrote\n"}))
        self.assertEqual((a["id"], a["ok"]), (4, False))
        self.assertTrue(a["error"])
        self.assertFalse(worker.answer(json.dumps({"id": 5, "op": "read", "name": "x.out", "text": ""}))["ok"])
        self.assertFalse(worker.answer(json.dumps({"id": 6, "op": "run", "code": "1"}))["ok"])


class Orca(unittest.TestCase):
    def test_an_optimisation_its_steps_and_their_energies(self):
        a = read(sample("ORCA/dvb_gopt.out"))
        self.assertTrue(a["ok"], a.get("error"))
        r = a["result"]
        self.assertEqual(r["program"], "ORCA")
        self.assertTrue(r["version"].startswith("6."))
        self.assertEqual((r["charge"], r["multiplicity"], r["basis"]), (0, 1, "STO-3G"))
        self.assertEqual(sorted(set(r["atoms"])), ["C", "H"])
        self.assertEqual(len(r["atoms"]), 20)
        self.assertGreater(len(r["frames"]), 1)
        self.assertTrue(all(len(f) == 60 for f in r["frames"]))
        self.assertEqual(len(r["energies"]), len(r["frames"]))
        # (hartrees: divinylbenzene is about -380 of them, not some 10 000 eV)
        self.assertTrue(all(-400 < e < -370 for e in r["energies"]))
        self.assertLessEqual(r["energies"][-1], r["energies"][0])
        self.assertTrue(r["optimised"])

    def test_vibrations_with_their_displacements(self):
        r = read(sample("ORCA/dvb_ir.out"))["result"]
        self.assertEqual(len(r["vibrations"]), 54)
        self.assertTrue(all(len(v["displacements"]) == 60 for v in r["vibrations"]))

    def test_partial_charges_by_scheme(self):
        r = read(sample("ORCA/dvb_sp_hf.out"))["result"]
        self.assertTrue({"mulliken", "lowdin", "hirshfeld"} <= set(r["charges"]))
        self.assertTrue(all(len(q) == 20 for q in r["charges"].values()))
        self.assertAlmostEqual(sum(r["charges"]["mulliken"]), 0, places=3)


class Gaussian(unittest.TestCase):
    def test_an_optimisation_and_its_method(self):
        r = read(sample("Gaussian/dvb_gopt.out"))["result"]
        self.assertEqual((r["program"], r["method"], r["basis"]), ("Gaussian", "B3LYP", "STO-3G"))
        self.assertEqual(len(r["frames"]), len(r["energies"]))
        self.assertGreater(len(r["frames"]), 1)
        # (the sums of charges are not charges of atoms)
        self.assertNotIn("mulliken_sum", r["charges"])

    def test_a_correlated_energy_over_the_scf(self):
        r = read(sample("Gaussian/water_mp2.log"))["result"]
        self.assertEqual(r["method"], "MP2")
        self.assertEqual(len(r["energies"]), 1)


class XTB(unittest.TestCase):
    def test_an_optimisation_gives_its_final_geometry(self):
        r = read(sample("XTB/dvb_opt.out"))["result"]
        self.assertEqual((r["program"], r["method"]), ("xTB", "GFN2-xTB"))
        self.assertEqual(len(r["frames"]), 1)
        self.assertEqual(len(r["energies"]), 1)

    def test_a_single_point_has_no_geometry_to_give(self):
        r = read(sample("XTB/dvb_sp.out"))["result"]
        self.assertEqual(r["frames"], [])
        self.assertIsNone(r["energies"])


if __name__ == "__main__":
    unittest.main()
