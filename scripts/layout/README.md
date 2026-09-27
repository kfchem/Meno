# The layout benchmark

```
npm run layout-fetch                                   # fills in molecules.json (network)
<chem python> scripts/layout/baselines.py              # RDKit's layouts -> .layout/baselines.json
npm run layout-bench                                   # writes .layout/index.html
npm run layout-bench -- --open                         # and opens it
```

`<chem python>` is the Python of the chem lock: the app's own environment,
under its data folder at `uv/chem/venv`, will do.

## What it is for

Meno is getting a 2D layout engine of its own, written from scratch: what
lays a structure out when it is cleaned up, or when it arrives as a SMILES.
This is how that engine is judged, and how each change to it is judged
against the last: every molecule in `molecules.json`, drawn by each engine,
beside the structure its Wikipedia article shows - the standard to reach -
with the numbers `src/lib/layout/metrics.ts` gives each drawing.

The molecules are chosen for what makes layout hard: fused and bridged ring
systems (steroids, alkaloids, taxol), cages, spiro centres, macrocycles
(macrolides, cyclic peptides, cyclodextrins), long chains with stereo double
bonds, and the kinds of molecule drawn by their own conventions - sugars,
amino acids and peptides, nucleosides, lipids.

## The numbers

Lower is better, and each is measured against the drawing's own typical
bond, so scale does not matter.

| | |
|---|---|
| overlaps | atoms not bonded but closer than half a bond |
| crossings | bonds crossing bonds |
| clashes | atoms lying on a bond they are not part of |
| crowded labels | labelled atoms (anything but a neutral C) close enough for their labels to meet |
| bonds ± | how much bond lengths vary |
| angles | how far angles at chain atoms are from ideal |
| rings | how far rings of up to eight are from regular polygons |
| macrocycle angles | how far the angles round a ring of nine or more are from a zigzag's 120° - a macrocycle drawn as a round polygon is far off |
| wedges on rings | wedges and hashes on ring bonds, where they read badly |

The score weighs them together to put drawings in order. It does not see
everything a chemist does - orientation, and whether a skeleton looks the
way it is always drawn, among others - so the sheet shows the reference
beside every drawing.

## Licences

- **The references** are shown from Wikimedia Commons, never copied: the
  sheet links each one with its licence and author, which `fetch.ts` records
  from Commons. Only files on Commons are used - a file Wikipedia holds
  itself may be there under a claim of fair use. A file a molecule names in
  `referenceFile` is used instead of the one its article's infobox leads
  with.
- **The SMILES** are PubChem's, recorded with their CID.
- **The engine** is Meno's own code. Nothing is taken from other depiction
  code (RDKit, CoordGen, CDK and the rest), and nothing is traced from the
  references: skeleton templates, when there are any, are drawn for Meno.
  RDKit's layouts appear here only as a baseline to beat.
