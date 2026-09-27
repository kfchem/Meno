# How Meno lays out a structure

The rules Meno's 2D layout engine (`src/lib/layout/`) works by. They are
meant to be general: to give a drawing a chemist finds clean for a structure
nobody has drawn before, not to reproduce stored drawings of known ones.
Where a class of molecule has a way it is always drawn - sugars, peptides,
steroids - the aim is for that way to follow from the rules, and the
sections below say how it does.

The benchmark in `scripts/layout` measures the engine against these rules
(`src/lib/layout/metrics.ts`) and shows every drawing beside the structure
its Wikipedia article uses.

## What a good drawing is

A structure drawing is read, not looked at. A chemist should take in its
skeleton and its stereochemistry at once, and read it the way everything
else on the page is read: left to right. Four aims follow, in order of
priority - a later one never buys itself at the cost of an earlier one:

1. **Nothing hidden.** No atom on another, no bond through an atom or
   across another bond, no label crowding a label.
2. **Every part in its standard shape.** One bond length; rings as regular
   polygons; chains as zigzags; the bonds round an atom evenly spread.
3. **Square to the page.** Bonds on a lattice, as far as the skeleton
   allows.
4. **Read in order.** The drawing runs left to right along its main axis,
   and the parts one looks for are where one looks for them.

## 1. The lattice

Text runs horizontally, so a chain - the part of a structure that is read
along - runs horizontally too, as a zigzag of bonds at +30 and -30 degrees.
Every bond at an ideal angle to those lies at 30 + 60k degrees, so that is
the lattice: bonds at 30, 90, 150, 210, 270 and 330 degrees. A six-membered
ring on it has two sides upright, and a ring substituent leaves it along
the lattice too. Everything below keeps to this one lattice.

Rings that cannot lie on it - five-membered rings, rings of seven and more
- are set so that they are symmetric about a lattice direction: fused to a
six-membered ring along its shared side, or with their apex along the bond
they hang from.

## 2. Shape

- **Bonds**: one length throughout. A bond is stretched only as the last
  way out of a clash (section 5).
- **Rings of three to eight**: regular polygons. Rings fused to each other
  share a side exactly; a ring fused on two sides or more at once (as in
  pyrene) takes the positions its neighbours already fix.
- **Macrocycles** (nine and more): a chain closed on itself, drawn as one:
  two zigzags, one above the other, joined at their ends, every angle 120
  or 240 degrees. Wide rather than tall, like the chain it is.
- **Bridged systems**: the largest ring drawn as a polygon, the bridges as
  chords across it, their atoms spaced evenly along them. Cages that cannot
  be drawn that way without crossings (adamantane, cubane) take the
  conventional perspective.
- **Chains**: zigzag, each turn the other way from the last. A trans double
  bond carries the zigzag on; a cis one turns it back. A triple bond, or
  two double bonds on one atom, runs straight.
- **At an atom in no ring**: its bonds evenly spread - three at 120 degrees,
  four at 90.
- **At a ring atom**: the other bonds split the room outside the ring
  evenly: one straight out, along the bisector; two either side of it.

## 3. Square to the page

The largest ring system is the frame, and it is set square on the
lattice. A ring hung off it that cannot be square as well is left askew
rather than the frame tilted to meet it halfway. A frame whose own rings
cannot all be square together (fluorene's two benzene rings either side of
a five-membered one) is set with its long axis level.

Among the ways of setting the frame square - six turns, and their mirror
images - the drawing takes the one that reads best (section 4).

## 4. Reading order

- **The long axis level.** A drawing is wider than it is tall, and its
  chains run level.
- **Fused rings as IUPAC orients them for numbering**: as many rings as
  possible in a horizontal row, then as many as possible above and to the
  right of it. Phenanthrene's third ring goes up and to the right; a
  steroid's A and B rings form the row, with C and D above and to the right
  - the way steroids are always drawn.
- **A ring system to the left of the chains that leave it.** The ring
  system is what the molecule is; its chains are read after it.
- **The first carbon of a chain on the right.** The carbon a chain is
  numbered from - the carboxyl of an acid or an ester, a sugar's anomeric
  carbon - is at the right-hand end. Most conventions follow from this one:
  - acids, and fatty acids, with the COOH on the right, and an acyl chain in
    a lipid with its carbonyl on the right and its tail to the left;
  - peptides from N-terminus to C-terminus, left to right, as their
    sequences are written;
  - sugars (below).
- **Rings hung on a macrocycle** - the sugars of a macrolide - to its right
  and below it, where the eye goes after reading the ring.

### Sugars and nucleosides

A flat drawing of a sugar is the Haworth projection seen from above: the
ring oxygen at the back becomes the top, the anomeric carbon (C1) is on the
right, and a group above the ring is a wedge, one below it a hash. Set on
the lattice, a pyranose has its ring oxygen at the top vertex, C1 upper
right and C5, with C6, upper left; a furanose has its oxygen at the apex.
Glycosidic bonds then run from left to right, from C1 of one ring to the
next. In a nucleoside the base, on C1', is on the right, and the chain from
C5' - the phosphates of ATP - runs off to the left.

## 5. Room

When parts clash, in this order:

1. **Choose among equal placements**: which side of a chain a branch goes,
   which way a zigzag turns, which way round a ring system is hung - each
   is free, and the one without the clash is taken.
2. **Turn** a substituent off its ideal angle, as little as will do.
3. **Stretch** a bond, only if the clash is still there.

## 6. Stereochemistry that reads

- Wedges and hashes on bonds out of rings, never on ring bonds, their
  narrow end at the stereocentre: a bond to H first, then to an end atom,
  then to a chain.
- A stereocentre at a ring fusion with no bond out of the rings gets an
  explicit H, drawn straight out.
- Double bonds are drawn as they are: a cis double bond with its
  substituents on one side.

## How the engine goes about it

1. Find the rings (smallest set of smallest rings) and the ring systems -
   fused, bridged, spiro - and the chains between them.
2. Lay each ring system out in its own frame, square on the lattice.
3. Grow the structure out from the largest ring system (or, with no ring,
   from the middle of its longest chain), placing each bond by the rules of
   section 2 and choosing among free placements by section 5.
4. Try the frame's orientations and keep the one that reads best by
   section 4.
5. Put the stereo on (section 6).

Every step is measured on the benchmark, and a change is kept only if the
drawings it makes are better.
