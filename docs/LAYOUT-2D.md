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
   across another bond, no label crowding a label - an OH's H as much as
   its O, with a space between labels side by side - and no bond between
   two labels covered by their letters (a Pd and an NH a bond apart at a
   slant, the d reaching along it to the N).
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
- **Rings of three to eight**: regular polygons; a four-membered ring a
  square with its sides level and upright (a beta-lactam, an oxetane).
  Rings fused to each other share a side exactly; a ring fused on two
  sides or more at once (as in pyrene) takes the positions its neighbours
  already fix. Where those cannot make it regular - a five-membered ring
  hemmed in by others, morphine's furan, acenaphthene's - its shape comes
  before its bond lengths: the rest of it goes where the regular polygon
  best fitted to what is fixed puts it, a little larger than the others
  if it must be. A ring system whose rings still come out bent (strychnine)
  is eased toward rings of their own shape, its bonds giving first.
- **Macrocycles** (nine and more): a chain closed on itself, drawn as one:
  two zigzags, one above the other, joined at their ends, every angle 120
  or 240 degrees - never round. At every corner a substituent takes the
  wider, 240-degree side, as on any zigzag: outside the ring where the
  corner points out, inside it where the corner points in, which is why a
  macrolide is drawn with groups inside its ring. The atoms carrying the
  larger groups take the corners pointing out, and the shape is chosen,
  among the few that lie well, for the room it leaves inside. A ring fused
  on its side sits where the shape turns (both ends of that side corners
  pointing out), a ring it runs through at three atoms stands outside a
  corner pointing in, and every double bond in it keeps its cis or trans.
  A macrolide has its lactone at the lower left, the ring numbered from
  its carbonyl carbon counterclockwise - C2 to its right along the bottom,
  the ring O last, above it - as erythromycin and epothilone are drawn: of
  the ways of fitting the ring to its shape that put the heavy groups
  outside, the one that does so. A ring of up to fifteen, seven bonds a
  side at most, is as tall as it is wide whatever its shape, and lies as
  that puts it.
- **Rings of rings**: a macrocycle that is rings strung together and
  nothing else - a porphyrin's pyrroles, a cyclodextrin's glucoses, each
  linked to the next by an atom or two - is set round a circle, each ring
  it runs through regular and outside it. One with chains between its
  rings (vancomycin's peptide) is a chain like any other macrocycle:
  where several run through the same ring, that ring is drawn first and
  each macrocycle is a zigzag from ring to ring, turning as a hexagon
  does where it runs through one, so that the ring comes out regular,
  and kept clear of where the rest of that ring will fall.
- **Bridged systems**: where a ring is fused on a side as well - morphine,
  artemisinin, taxol - the system is drawn flat: the smaller ring of a
  bridged pair regular, the larger arcing round it with the bridge inside
  (taxol's A ring, its B ring round the gem-dimethyl bridge). Where that
  crowds the bridge or stretches its bonds, the fused rings are drawn flat
  and regular as though the bridge were not there, and the bridge is a
  path of bonds across the face of a ring, in front of it or behind it as
  the molecule has it, the bond behind broken where they cross -
  artemisinin's peroxide inside its seven-membered ring. A bridge as long
  as the path it spans is that path set off by a bond, the ring the two
  make the chair or boat it is (a morphinan's piperidine under its B
  ring).
- **Cages**: a system whose rings are all bridged, each sharing three atoms
  or more with another (norbornane, camphor, tropane, quinuclidine,
  adamantane), or a polyhedron (cubane), is drawn in perspective, as the
  solid it is, upright and seen from above - the higher on the page, the
  further back; a drawing that needs it the other way round has the cage
  seen from its other side, never turned over or mirrored. It is built on
  one of its six-membered rings,
  drawn as a chair or a boat always is: two zigzags of three atoms, their
  bonds 15 degrees off level, the back one above the front one and joined
  to it by two bonds 60 degrees steep - a chair's zigzags pointing opposite
  ways, a boat's the same way. Every bond is one length and opposite bonds
  are parallel. The ring's axial bonds (a boat's flagpoles) are upright, always, a
  bridge between two of them hanging from them however it must;
  an atom bridging two of its atoms (norbornane's C7) stands straight
  above the front one, a bond's length from the back one; the rest is
  eased into place. Adamantane is then a chair with its three axial bonds
  rising to the fourth bridgehead; bicyclo[2.2.2]octane a boat with its
  third bridge rising from both bridgeheads. A bond passing behind another
  is drawn broken there. Bonds out of the ring follow it - an equatorial
  bond parallel to the ring bonds but one, an axial one upright - and what
  hangs from the cage hangs from its front where it can.
- **Chains**: zigzag, each turn the other way from the last. A trans double
  bond carries the zigzag on; a cis one is a step in it - the chain read as
  the straight chain it would be without it, taking up again, two bonds
  past it, the line it ran along before (a fatty acid, a lipid's acyl
  chains, lying level and side by side). A triple bond, or two double bonds on
  one atom, runs straight.
- **At an atom in no ring**: its bonds evenly spread - three at 120 degrees,
  four at 90.
- **A phosphate, a sulfonyl**: a phosphorus or sulfur with four bonds is a
  cross square to the page, the chain straight through it and a
  double-bonded O above it, as IUPAC puts double-bonded substituents on a
  chain. The O between two crosses runs straight on, so that ATP's
  triphosphate is one line; the bond joining a cross to a zigzag gives way,
  to 150 degrees.
- **At a ring atom**: one bond out goes straight out, along the bisector;
  two (a gem-dimethyl) go close together, 60 degrees apart about it; more
  split the room evenly. A substituent never takes the 120-degree side of
  a zigzag's corner; only a small ring's own angles excuse it.
- **Parts joined**: where two parts each with rings of their own meet at a
  single bond - a sugar on its glycosidic oxygen, taxol's side chain on
  its ester - each is drawn well on its own and then joined, the angle at
  the join giving way to them. So too a long chain hung from a branch (a
  lipid's acyl chains on its glycerol): drawn straight, then joined.

## 3. Square to the page

The ring system the molecule is built round - the one nearest all the
rest of it, the largest of those - is the frame, and it is set square on
the lattice. A ring hung off it that cannot be square as well is left askew
rather than the frame tilted to meet it halfway. A frame whose own rings
cannot all be square together (fluorene's two benzene rings either side of
a five-membered one) is set with its long axis level.

Among the ways of setting the frame square - six turns, and their mirror
images; twelve for a frame of squares and no hexagons, whose sides can
lie level either way round - the drawing takes the one that reads best
(section 4).

## 4. Reading order

- **The long axis level.** A drawing is wider than it is tall, and its
  chains run level.
- **Fused rings as IUPAC orients them for numbering**: as many rings as
  possible in a horizontal row, then as many as possible above and to the
  right of it. Phenanthrene's third ring goes up and to the right; a
  steroid's A and B rings form the row, with C and D above and to the right
  - the way steroids are always drawn.
- **A benzene ring at the left of its ring system**, where reading
  begins: indole, quinoline and coumarin with their benzene rings on the
  left, estradiol's aromatic A ring, griseofulvin's, reserpine's indole at
  the upper left of the rings that follow it. The heteroatoms of a ring
  fused to it go below: quinoline's N, indole's NH, coumarin's O at the
  bottom, and so morphine's ether O and strychnine's indoline N, as IUPAC
  draws morphinan and strychnidine. Which way up a ring system is comes
  before how the rest of its rings lie.
- **Seen from the face its angular groups are on.** A ring system has two
  faces, and a drawing from one is the mirror image of a drawing from the
  other, every wedge a hash. It is drawn from the face its angular groups
  are on - the one bond out of the rings at an atom with three ring bonds:
  a steroid's methyls, a terpenoid's, taxol's, artemisinin's - so that
  they stand in front of the page on wedges, as a steroid's do: the way
  IUPAC orients a steroid makes its beta face the one in front, and
  natural steroids and terpenoids have their angular methyls beta. (A cage
  shows the face its own drawing gives it, section 2; a macrocycle lies as
  its own conventions have it.)
- **A ring system to the left of the chains that leave it.** The ring
  system is what the molecule is; its chains are read after it.
- **The first carbon of a chain on the right.** The carbon a chain is
  numbered from - the carboxyl of an acid or an ester, a sugar's anomeric
  carbon - is at the right-hand end. Most conventions follow from this one:
  - acids, and fatty acids, with the COOH on the right, and an acyl chain in
    a lipid with its carbonyl on the right and its tail to the left; an
    acid's C=O points up - at the end of a chain or on an aromatic ring,
    in its plane; one on a saturated ring goes where the ring's stereo
    puts it (penicillin's points down);
  - peptides from N-terminus to C-terminus, left to right, as their
    sequences are written, the backbone carrying straight on through each
    alpha carbon and the side chains branching off; an amino acid then
    comes out with its side chain on the left, the COOH on the right (C=O
    up) and the NH2 below;
  - sugars (below).
- **Rings hung on a macrocycle** - the sugars of a macrolide - to its right
  and below it: the aglycone at the upper left, read first.
- **A chain folded back on itself** - a fatty acid drawn as a hairpin, a
  prostaglandin's two chains from its ring, both running off to the right
  - has its carboxyl end above its tail: read from the carboxyl first, as
  arachidonic acid is drawn and as IUPAC sets prostane, the ring on the
  left, the chain with the acid above the other.

### Sugars and nucleosides

A flat drawing of a sugar is the Haworth projection seen from above: the
ring oxygen at the back becomes the top, the anomeric carbon (C1) is on the
right, and a group above the ring is a wedge, one below it a hash. Set on
the lattice, a pyranose has its ring oxygen at the top vertex, C1 upper
right and C5, with C6, upper left; a furanose has its oxygen at the apex.
The anomeric carbon is always on the right, and the ring's carbons are
numbered on from it clockwise: a ring is drawn from the face that has them
so. Glycosidic bonds then run from left to right, from C1
of one ring to the next (a sugar hung on a macrolide faces its aglycone
instead, its anomeric carbon toward it, whichever side that is - still
seen from the face its carbons number clockwise from, its ring oxygen
where that puts it: turned over on its link, and swung clear, once the
aglycone is set, which it leaves as it is); where two anomeric carbons are linked (sucrose),
the aldose keeps its C1 on the right and the ketose gives way. In a nucleoside the base, on C1', is on the right, and the chain from
C5' - the phosphates of ATP - runs off to the left.

## 5. Room

When parts clash, in this order:

1. **Choose among equal placements**: which side of a chain a branch goes,
   which way a zigzag turns, which way round a ring system is hung, which
   of a ring atom's two groups goes which way - each is free, and the one
   without the clash is taken (erythromycin's tertiary OH up, out of its
   sugar's way, its methyl across). A branch turned over
   is tried with what hangs on it turned back as well: tryptophan's side
   chain turned down, its NH2 below, its carboxyl's C=O still up.
2. **Turn** a substituent off its ideal angle, as little as will do.
3. **Stretch** a bond, only if the clash is still there.

None of these ends with bonds crossing that did not cross before, however
much else a crossing would clear.

And last, room for the H of every label: the drawing writes it beside the
symbol on the side the bonds leave free (OH, or HO where they leave to the
right; under or over the symbol only between bonds on both sides, as in a
chain's NH). Where it - or its count, NH2's 2 after it and set lower -
would run into another label, an atom or a bond, the
bond to the atom is turned a little or drawn a little longer or shorter -
an OH, an SH - or the same is done to what it runs into, a C=O's O or a
small branch (taxol's benzoate, clear of its C1 OH). The H is never moved
under the symbol to make room, and no move that crosses bonds is taken.
Nothing else is moved for it: the drawing is set first, its H's last.

## 6. Stereochemistry that reads

- Wedges and hashes on bonds out of rings, never on ring bonds, their
  narrow end at the stereocentre: an end atom first, then a chain - but
  never a run of wedges sharing atoms, nor a wedge on the bond between two
  stereocentres: there the main chain stays plain and the centre's H is
  drawn to carry the stereo.
- A stereocentre at a ring fusion with no bond out of the rings gets an
  explicit H, drawn straight up on a wedge or straight down on hashes, as
  a steroid's are - so the page shows the sense as well as the wedge.
  Where that spot is taken - the middle of morphine or strychnine, hemmed
  in by rings - the H goes wherever round its atom there is most room,
  clear of atoms and bonds and crossing none; its wedge says the same
  whichever way it points.
- A ring atom's two groups - erythromycin's OH and methyl on one carbon -
  each show which face they are on: the one in front on a wedge, the other
  behind on hashes.
- Double bonds are drawn as they are: a cis double bond with its
  substituents on one side.
- A wedge says what a reader reads it as - and RDKit, which is how that is
  checked. With all four bonds of a centre drawn, that is the way they run
  round it and which stand out of the page, not the angles between them:
  where three bonds in the page lie within 180 degrees of each other (a
  bridgehead often has them so), read from the angles two of them and the
  wedge would say one thing and the other two the opposite
  (`drawnVolume`). With three drawn and the H left out, the angles are read.
- A cage drawn in perspective shows its stereochemistry by the drawing
  itself, with no wedges; what it shows is read back from the solid the
  cage is drawn from, fitted to where its atoms are and how deep, and the
  way each bond out of it points (`drawn.ts`). Drawn the other way, a bond
  turns its centre. So a stereocentre's one bond out of a cage, beside its
  H, is drawn the way the solid has it - never straight out from the
  cage's bonds, which is where neither of its corners is and says nothing.

## How the engine goes about it

1. Find the rings (smallest set of smallest rings) and the ring systems -
   fused, bridged, spiro - and the chains between them.
2. Lay each ring system out in its own frame, square on the lattice - or,
   for a cage, in perspective and upright.
3. Grow the structure out from the frame (section 3), or, with no ring,
   from the middle of its longest chain, placing each bond by the rules of
   section 2 and choosing among free placements by section 5.
4. Try the frame's orientations and keep the one that reads best by
   section 4, its free choices tried the other way and its parts
   untangled (section 5).
5. Last, turn a macrolide's sugars to their face and make room for the
   H's of labels, each by a small local move (sections 4 and 5).
6. Set the pieces of a salt or a mixture side by side, the largest first,
   with a bond and a half of paper between one's ink and the next's: a
   label's symbol, its H beside it and its charge count as ink (an OH
   facing an HO stands off further than two carbons).
7. Put the stereo on (section 6).

Every step is measured on the benchmark, and a change is kept only if the
drawings it makes are better. How to go about changing the engine, and
what the maintainer has decided, is in
[`LAYOUT-2D-TUNING.md`](LAYOUT-2D-TUNING.md).
