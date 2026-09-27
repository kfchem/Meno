# The layout benchmark

```
npm run layout-fetch                                   # fills in molecules.json (network)
<chem python> scripts/layout/baselines.py              # RDKit's layouts -> .layout/baselines.json
npm run layout-bench                                   # writes .layout/index.html
npm run layout-bench -- --open                         # and opens it
npm run layout-bench -- --only=Paclitaxel,D-Glucose    # just those (names as they start)
```

`<chem python>` is the Python of the chem lock: the app's own environment,
under its data folder at `uv/chem/venv`, will do.

## What it is for

Meno has a 2D layout engine of its own, written from scratch
(`src/lib/layout/engine.ts`, by the rules in `docs/LAYOUT-2D.md`): what lays
a structure out when it is cleaned up, or when it arrives as a SMILES. This
is how that engine is judged, and how each change to it is judged against
the last: every molecule in `molecules.json`, drawn by Meno's engine and by
RDKit's two, beside the structure its Wikipedia article shows - the
standard to reach - with the numbers `src/lib/layout/metrics.ts` gives each
drawing.

The engine is given only what `baselines.py` records as the molecule's
graph: elements, charges, H counts, bond orders, each double bond's cis or
trans, and each stereocentre's configuration (as its neighbours in order
and the sign of the volume the first three span, from a 3D embedding).

The molecules are chosen for what makes layout hard: fused and bridged ring
systems (steroids, alkaloids, taxol), cages, spiro centres, macrocycles
(macrolides, cyclic peptides, cyclodextrins), long chains with stereo double
bonds, and the kinds of molecule drawn by their own conventions - sugars,
amino acids and peptides, nucleosides, lipids.

## The numbers

Lower is better, and each is measured against the drawing's own typical
bond, so scale does not matter. Every caption shows the score and what it
is made of, the largest part first; the weights are `SCORE_WEIGHTS` in
`metrics.ts`.

They are general rules, meant to hold for a structure nobody has drawn
before, not a record of how particular molecules are drawn.

**Faults** - what no drawing may have:

| | |
|---|---|
| overlaps | atoms not bonded but closer than half a bond |
| crossings | bonds crossing bonds |
| clashes | atoms lying on a bond they are not part of |
| crowded labels | labelled atoms (anything but a neutral C) close enough for their labels to meet |

**Shape**:

| | |
|---|---|
| bond lengths | how much bond lengths vary |
| angles | how far angles at chain atoms are from ideal |
| rings | how far rings of up to eight are from regular polygons |
| macrocycle angles | how far the angles round a ring of nine or more are from a zigzag's 120° - a macrocycle drawn as a round polygon is far off; a ring that runs through other rings (a porphyrin's) is a ring of rings, and not counted |
| substituents | how far a ring atom's other bonds are from splitting the room outside the ring evenly: an H at a ring fusion drawn straight out, not aslant |
| wedges on rings | wedges and hashes on ring bonds, where they read badly |

**Orientation** - the drawing square to the page, and read left to right:

| | |
|---|---|
| tilt | how far the drawing is turned off the 30° lattice. The largest ring system is the frame; a ring hung off it askew is *askew*, not the frame tilted. A frame whose rings cannot all lie on the lattice together, as fluorene's cannot, is square when its long axis is level or upright |
| askew | how far the bonds that could lie on the lattice are still off it once the frame is square |
| chains off level | how far the open parts of the structure - strands of atoms in no ring, split where they branch - run from level, along the axis of their zigzag; a strand of up to four bonds hung on a ring may run straight out from it instead |
| long axis | how far the drawing's long axis is from level, in proportion to how much longer than broad it is |
| tall | height over width, past square |
| macrocycle tall | a ring of twelve or more drawn taller than wide |
| folded chains, splayed chains | long chains folded up rather than drawn out, and not running parallel as lipids' do |
| reading order | an acid at the end of a chain on the right; a ring system to the left of the chains out of it; the rings hung on a macrocycle to its right and below it |

The score still does not see everything a chemist does - whether a skeleton
is turned the way it is always drawn, a steroid's A ring at the lower left
among them - so the sheet shows the reference beside every drawing.

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
  references: the engine works from rules, not from stored drawings.
  RDKit's layouts appear here only as a baseline to beat.
