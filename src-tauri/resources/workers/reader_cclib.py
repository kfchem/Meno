"""Meno's cclib reader: a calculation program's output, read by cclib.

A reader plugin's worker (docs/WORKSPACE.md, stage 3), run in an
environment of its own. One JSON object per line on stdin, one per line
back on stdout, as Meno's chemistry worker's:

    {"id": 7, "op": "read", "name": "job.out", "text": "..."}
    {"id": 7, "ok": true, "result": {...}}
    {"id": 7, "ok": false, "error": "..."}

It reads what it is sent and nothing else - no file of its own choosing,
no network - and says when cclib has been imported:

    {"event": "ready", "reader": "cclib", "version": "1.9rc1"}

What it reads goes back as Meno's own plain data, whatever the program:
the atoms, each geometry it went through (an optimisation's steps) in
angstroms, each one's energy in hartrees, what the calculation was, its
vibrations and its atoms' partial charges. cclib is used as a library;
none of its code is Meno's.
"""

import json
import logging
import os
import sys
import tempfile
import warnings

warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)

import cclib  # noqa: E402
from cclib.parser.utils import PeriodicTable  # noqa: E402

# cclib's energies are in electronvolts; Meno's, in hartrees
EV_PER_HARTREE = 27.211386245988

ELEMENTS = PeriodicTable().element


def has(data, name):
    return getattr(data, name, None) is not None


def frame_energies(data, frames):
    """Each frame's energy, in hartrees: the most correlated a step has,
    where the program gives one for every frame; or the last one, where it
    read a single geometry; or none."""
    candidates = []
    if has(data, "ccenergies"):
        candidates.append([float(e) for e in data.ccenergies])
    if has(data, "mpenergies"):
        candidates.append([float(row[-1]) for row in data.mpenergies])
    if has(data, "scfenergies"):
        candidates.append([float(e) for e in data.scfenergies])
    for found in candidates:
        if len(found) == frames:
            return [e / EV_PER_HARTREE for e in found]
    if frames == 1:
        for found in candidates:
            if found:
                return [found[-1] / EV_PER_HARTREE]
    return None


def method_of(meta):
    """What the calculation was, as its program names it: the functional
    of a DFT calculation, or else the last method it ran."""
    if meta.get("functional"):
        return str(meta["functional"])
    methods = [m for m in meta.get("methods") or [] if m]
    return str(methods[-1]) if methods else None


def op_ping(_m):
    return {"reader": "cclib", "version": cclib.__version__}


def op_read(m):
    name = os.path.basename(str(m.get("name") or "output"))
    text = m.get("text")
    if not isinstance(text, str) or not text:
        raise ValueError("nothing to read")
    # (read from a file of its own, named as the file was, then let go)
    suffix = os.path.splitext(name)[1] or ".out"
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        data = cclib.io.ccread(path)
    finally:
        os.remove(path)
    if data is None or not has(data, "atomnos"):
        raise ValueError(f"cclib found no molecule in {name}")
    meta = getattr(data, "metadata", {}) or {}
    atoms = [ELEMENTS[int(z)] for z in data.atomnos]
    frames = []
    if has(data, "atomcoords"):
        for step in data.atomcoords:
            if len(step) == len(atoms):
                frames.append([float(v) for xyz in step for v in xyz])
    result = {
        "program": meta.get("package"),
        "version": meta.get("package_version"),
        "method": method_of(meta),
        "basis": meta.get("basis_set"),
        "charge": int(data.charge) if has(data, "charge") else None,
        "multiplicity": int(data.mult) if has(data, "mult") else None,
        "atoms": atoms,
        "frames": frames,
        "energies": frame_energies(data, len(frames)) if frames else None,
        "optimised": bool(data.optdone) if has(data, "optdone") else None,
    }
    if has(data, "vibfreqs"):
        disps = getattr(data, "vibdisps", None)
        result["vibrations"] = [
            {
                "frequency": float(f),
                "displacements": (
                    [float(v) for xyz in disps[i] for v in xyz]
                    if disps is not None and i < len(disps)
                    else None
                ),
            }
            for i, f in enumerate(data.vibfreqs)
        ]
    if has(data, "atomcharges"):
        result["charges"] = {
            scheme: [float(q) for q in values]
            for scheme, values in data.atomcharges.items()
            if not scheme.endswith("_sum") and len(values) == len(atoms)
        }
    return result


OPS = {"ping": op_ping, "read": op_read}


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
    print(json.dumps({"event": "ready", "reader": "cclib", "version": cclib.__version__}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(answer(line)), flush=True)


if __name__ == "__main__":
    main()
