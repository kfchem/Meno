"""Tests for the Gaussian input plugin's worker
(src-tauri/resources/plugins/gaussian-input/worker.py).

The worker needs Python alone, so these run anywhere - CI runs them:

    python3 -m unittest scripts/calc/test_writer_gaussian_input.py

What a Gaussian input holds, and how it is laid out, is checked against
Gaussian's own reference (gaussian.com, "About Gaussian 16 Input", "Link 0
Commands", "Molecule Specifications"), not against any other program.
"""

import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/gaussian-input/worker.py"
MANIFEST = ROOT / "src-tauri/resources/plugins/gaussian-input/manifest.json"
spec = importlib.util.spec_from_file_location("writer_gaussian_input", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

WATER = {
    "name": "water",
    "atoms": [
        {"el": "O", "x": 0.0, "y": 0.0, "z": 0.11926},
        {"el": "H", "x": 0.0, "y": 0.76324, "z": -0.47704},
        {"el": "H", "x": 0.0, "y": -0.76324, "z": -0.47704},
    ],
    "bonds": [{"a1": 0, "a2": 1, "order": 1}, {"a1": 0, "a2": 2, "order": 1}],
}


def defaults():
    """The options' defaults, as the manifest declares them - as Meno would send them, unchanged."""
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return {o["id"]: o["default"] for o in manifest["writes"][0]["options"]}


def write(molecule=WATER, name="water.gjf", **options):
    line = json.dumps({"id": 1, "op": "write", "kind": "gaussian-input", "name": name, "molecules": [molecule], "options": {**defaults(), **options}})
    return worker.answer(line)


def text(**kw):
    r = write(**kw)
    assert r["ok"], r
    return r["result"]["text"]


class Sections(unittest.TestCase):
    def test_the_sections_in_order_each_ended_as_the_reference_says(self):
        lines = text().split("\n")
        # Link 0 (no blank line after it), the route section, a blank line,
        # the title, a blank line, the molecule specification, a blank line
        self.assertEqual(lines[0], "%Chk=water")
        self.assertEqual(lines[1], "# B3LYP/6-31G(d) EmpiricalDispersion=GD3BJ Opt Freq")
        self.assertEqual(lines[2], "")
        self.assertEqual(lines[3], "water")
        self.assertEqual(lines[4], "")
        self.assertEqual(lines[5], "0 1")
        self.assertEqual(lines[6].split(), ["O", "0.00000000", "0.00000000", "0.11926000"])
        self.assertEqual(len(lines[6:9]), 3)
        self.assertEqual(lines[9:], ["", ""])

    def test_the_route_section_from_the_options(self):
        route = lambda **o: text(**o).split("\n")[1]  # noqa: E731
        self.assertEqual(route(job="sp", dispersion="none"), "# B3LYP/6-31G(d) SP")
        self.assertEqual(route(job="opt", method="M062X", basis="def2-TZVP", dispersion="GD3", keywords="SCRF=(Solvent=Water)"),
                         "# M062X/def2-TZVP EmpiricalDispersion=GD3 Opt SCRF=(Solvent=Water)")
        # (a line break in a keyword would end the section: it is a space)
        self.assertEqual(route(job="freq", dispersion="none", keywords="Int=UltraFine\nNoSymm"), "# B3LYP/6-31G(d) Freq Int=UltraFine NoSymm")

    def test_link_0_commands_only_where_asked(self):
        lines = text(checkpoint=False, processors=8, memory="16GB").split("\n")
        self.assertEqual(lines[:2], ["%NProcShared=8", "%Mem=16GB"])
        self.assertTrue(text(checkpoint=False).startswith("# "))
        # (the checkpoint named after the input's file, its spaces made "_")
        self.assertEqual(text(name="/runs/my run.com").split("\n")[0], "%Chk=my_run")

    def test_the_title_holds_none_of_what_the_reference_says_to_avoid(self):
        title = lambda t: text(title=t).split("\n")[3]  # noqa: E731
        self.assertEqual(title("cis_2-butene #1 @ 298 K!"), "cis 2-butene 1 298 K")
        self.assertEqual(title("back\\slash – dash"), "back slash dash")
        # (no title given: the molecule's name; none of that either: still one)
        self.assertEqual(title(""), "water")
        self.assertEqual(text(title="", molecule={**WATER, "name": "___"}, name="").split("\n")[3], "Molecule")

    def test_charge_multiplicity_and_isotopes(self):
        anion = {**WATER, "atoms": WATER["atoms"][:2]}
        self.assertEqual(text(molecule=anion, charge=-1, multiplicity=1).split("\n")[5], "-1 1")
        heavy = {**WATER, "atoms": [{**WATER["atoms"][0]}, {**WATER["atoms"][1], "isotope": 2}, WATER["atoms"][2]]}
        self.assertTrue(text(molecule=heavy).split("\n")[7].startswith("H(Iso=2) "))


class Refused(unittest.TestCase):
    def refused(self, why, **kw):
        r = write(**kw)
        self.assertFalse(r["ok"])
        self.assertIn(why, r["error"])

    def test_a_multiplicity_its_electrons_cannot_have(self):
        # water has 10 electrons: a doublet cannot be; its cation, 9, can
        self.refused("would have 10 electrons", multiplicity=2)
        self.assertTrue(write(charge=1, multiplicity=2)["ok"])
        self.refused("would have 9 electrons", charge=1, multiplicity=1)

    def test_what_is_not_a_whole_number_or_not_an_element(self):
        self.refused("whole number", charge=0.5)
        self.refused("at least 1", multiplicity=0)
        self.refused("is no element", molecule={**WATER, "atoms": [{"el": "Ph", "x": 0, "y": 0, "z": 0}]})
        self.refused("memory must be", memory="lots")
        self.refused("there are no atoms", molecule={"atoms": [], "bonds": []})

    def test_one_molecule_of_its_own_kind(self):
        r = worker.answer(json.dumps({"id": 2, "op": "write", "kind": "orca-input", "molecules": [WATER], "options": {}}))
        self.assertFalse(r["ok"])
        r = worker.answer(json.dumps({"id": 3, "op": "write", "kind": "gaussian-input", "molecules": [WATER, WATER], "options": {}}))
        self.assertIn("one molecule", r["error"])
        self.assertEqual(worker.answer('{"id": 4, "op": "run"}')["ok"], False)


if __name__ == "__main__":
    unittest.main()
