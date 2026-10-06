"""The Gaussian input plugin's worker: a molecule written as Gaussian 16 input.

A writer plugin's worker (docs/PLUGINS.md, docs/FILE-IO.md), run in an
environment of its own - Python alone, no package. One JSON object per line
on stdin, one per line back on stdout, as every plugin's:

    {"id": 3, "op": "write", "kind": "gaussian-input", "name": "water.gjf",
     "molecules": [{"name": "water", "atoms": [...], "bonds": [...]}],
     "options": {"job": "opt freq", "method": "B3LYP", ...}}
    {"id": 3, "ok": true, "result": {"text": "..."}}
    {"id": 3, "ok": false, "error": "..."}

It writes what it is given and nothing else - no file of its own choosing,
no network - and says when it is ready:

    {"event": "ready", "version": "0.1.0"}

The input is laid out as Gaussian's own reference has it (gaussian.com,
"About Gaussian 16 Input", "Link 0 Commands", "Molecule Specifications"),
and from nothing else:

- Link 0 commands, each a line beginning with "%", not ended by a blank
  line: %Chk names the checkpoint file, %NProcShared the processors a run
  may use, %Mem its memory, a number of 8-byte words or with a unit.
- The route section, begun by "#", ended by a blank line: the method and
  basis set, empirical dispersion (the "EmpiricalDispersion" keyword: GD2,
  GD3 or GD3BJ), the job (SP, Opt, Freq) and any keywords besides.
- The title section, ended by a blank line: at most five lines, none of
  the characters the reference says to avoid (@ # ! an en dash _ \\ and
  control characters).
- The molecule specification, ended by a blank line: the charge and spin
  multiplicity on its first line, then each atom's element and its
  Cartesian coordinates, an isotope as "(Iso=n)" after the element.
"""

import json
import re
import sys

VERSION = "0.1.0"

# The elements by atomic number, from 1: what an atom's element may be.
SYMBOLS = (
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr "
    "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu "
    "Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr "
    "Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og"
).split()
NUMBER = {s: i + 1 for i, s in enumerate(SYMBOLS)}

# The job, as its keywords say it ("SP" is the default, said all the same).
JOBS = {"opt freq": "Opt Freq", "opt": "Opt", "freq": "Freq", "sp": "SP"}
DISPERSIONS = {"none": "", "GD2": "EmpiricalDispersion=GD2", "GD3": "EmpiricalDispersion=GD3", "GD3BJ": "EmpiricalDispersion=GD3BJ"}
# %Mem's value: a number, of 8-byte words, or with its unit after it, no space between.
MEMORY = re.compile(r"^\d+(KB|MB|GB|TB|KW|MW|GW|TW)?$", re.IGNORECASE)
# What the title section should not hold: these, control characters, and (the input being ASCII) anything else.
TITLE_AVOID = re.compile(r"[@#!–_\\\x00-\x1f\x7f]|[^\x00-\x7f]")


class Refused(Exception):
    """What it was given cannot be written: said to the chemist as it is."""


def one_line(value, what):
    """A text option as one line: a section ends at a line's end, so a line break in it is none of it."""
    if not isinstance(value, str):
        raise Refused(f"{what} is not text")
    return " ".join(value.split())


def whole(value, what, least=None):
    """A number option that must be a whole number."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != int(value):
        raise Refused(f"{what} must be a whole number, not {value!r}")
    n = int(value)
    if least is not None and n < least:
        raise Refused(f"{what} must be at least {least}, not {n}")
    return n


def title_of(value, name):
    """The title section's line: the title given, else the file's name, without what the reference says to avoid."""
    t = " ".join(TITLE_AVOID.sub(" ", value or "").split())
    if not t:
        t = " ".join(TITLE_AVOID.sub(" ", name or "").split())
    return t or "Molecule"


def checkpoint_of(name):
    """The checkpoint file's name: the input's, without its extension, its spaces and what is not ASCII made "_"."""
    stem = re.sub(r"\.[^.]*$", "", (name or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1])
    stem = re.sub(r"[\s\x00-\x1f\x7f]|[^\x00-\x7f]", "_", stem)
    return stem or "checkpoint"


def element_label(atom):
    """An atom's element label: its symbol, an isotope said as the reference has it - "C(Iso=13)"."""
    el = atom.get("el")
    if el not in NUMBER:
        raise Refused(f'"{el}" is no element: Gaussian is given atoms of elements only')
    iso = atom.get("isotope")
    if iso:
        return f"{el}(Iso={whole(iso, 'An isotope', 1)})"
    return el


def coordinate(atom, axis):
    v = atom.get(axis)
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or v in (float("inf"), float("-inf")):
        raise Refused(f"an atom's {axis} is not a number")
    return float(v)


def gaussian_input(name, molecule, options):
    """The input file's text, as the reference lays it out."""
    atoms = molecule.get("atoms") or []
    if not atoms:
        raise Refused("there are no atoms to write")
    charge = whole(options.get("charge", 0), "The charge")
    multiplicity = whole(options.get("multiplicity", 1), "The spin multiplicity", 1)
    # (a multiplicity the molecule's electrons cannot have: Gaussian would stop at once)
    electrons = sum(NUMBER.get(a.get("el"), 0) for a in atoms) - charge
    if electrons < 0 or multiplicity - 1 > electrons or (electrons - (multiplicity - 1)) % 2:
        raise Refused(
            f"a charge of {charge} and a spin multiplicity of {multiplicity} cannot be: "
            f"the molecule would have {electrons} electrons"
        )

    lines = []
    # Link 0 commands
    if options.get("checkpoint", True):
        lines.append(f"%Chk={checkpoint_of(name)}")
    processors = whole(options.get("processors", 0), "Processors", 0)
    if processors:
        lines.append(f"%NProcShared={processors}")
    memory = one_line(options.get("memory", ""), "Memory").replace(" ", "")
    if memory:
        if not MEMORY.match(memory):
            raise Refused(f'memory must be a number with KB, MB, GB, TB, KW, MW, GW or TW after it, as 8GB - not "{memory}"')
        lines.append(f"%Mem={memory}")

    # the route section
    method = one_line(options.get("method", ""), "The method")
    basis = one_line(options.get("basis", ""), "The basis set")
    chemistry = "/".join(p for p in (method, basis) if p)
    job = JOBS.get(options.get("job", "sp"))
    if job is None:
        raise Refused(f"no job is called {options.get('job')!r}")
    dispersion = DISPERSIONS.get(options.get("dispersion", "none"))
    if dispersion is None:
        raise Refused(f"no empirical dispersion is called {options.get('dispersion')!r}")
    more = one_line(options.get("keywords", ""), "The keywords")
    lines.append(" ".join(p for p in ("#", chemistry, dispersion, job, more) if p))
    lines.append("")

    # the title section
    lines.append(title_of(options.get("title", ""), molecule.get("name") or name))
    lines.append("")

    # the molecule specification
    lines.append(f"{charge} {multiplicity}")
    for a in atoms:
        x, y, z = (coordinate(a, axis) for axis in ("x", "y", "z"))
        lines.append(f"{element_label(a):<10}{x:>16.8f}{y:>16.8f}{z:>16.8f}")
    lines.append("")
    return "\n".join(lines) + "\n"


def op_write(m):
    if m.get("kind") != "gaussian-input":
        raise Refused(f"this plugin writes no {m.get('kind')!r}")
    molecules = m.get("molecules") or []
    if len(molecules) != 1:
        raise Refused("a Gaussian input holds one molecule")
    return {"text": gaussian_input(m.get("name", ""), molecules[0], m.get("options") or {})}


def op_ping(_m):
    return {"version": VERSION}


OPS = {"write": op_write, "ping": op_ping}


def answer(line):
    try:
        m = json.loads(line)
    except ValueError:
        return {"ok": False, "error": "not JSON"}
    op = OPS.get(m.get("op"))
    try:
        if op is None:
            raise Refused(f"no such request: {m.get('op')!r}")
        return {"id": m.get("id"), "ok": True, "result": op(m)}
    except Refused as e:
        return {"id": m.get("id"), "ok": False, "error": f"The Gaussian input could not be written: {e}."}
    except Exception as e:  # noqa: BLE001 - said, not thrown: the worker keeps answering
        return {"id": m.get("id"), "ok": False, "error": f"The Gaussian input could not be written: {e}"}


def main():
    print(json.dumps({"event": "ready", "version": VERSION}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(answer(line)), flush=True)


if __name__ == "__main__":
    main()
