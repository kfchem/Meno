# Finishing the 2D editor

What "finished" means for the 2D structure editor, how it is meant to be
worked, and what is left to do, in the order it should be done. Agreed with
the maintainer on 2026-09-25; judge it, like everything else, against
[PURPOSE.md](PURPOSE.md).

## What finished means

Everything up to, and not including, linking a structure to the 3D views
(which is the workspace's first stage: [WORKSPACE.md](WORKSPACE.md)).
Within that, the feature set of a capable general-purpose structure editor,
and in particular:

- **Drawing style as settings**: bond length, line width, double-bond
  spacing, wedge shape, hash spacing, rounding at ends and joins, label font
  and size - adjustable, with ACS 1996 as the preset rather than the only
  option.
- **SVG export**, drawn exactly as on the canvas.
- **Pasting into Word and PowerPoint** as an object.

## How it is worked

- **Hover, then act.** The atom or bond under the pointer is the subject of
  whatever comes next - a click, a drag, a wheel turn, a key. This is already
  how labels are typed.
  - What is under the pointer is lit from behind: the highlight sits under
    every bond and shape, so it never tints the drawing. A bond's highlight
    follows what the bond draws - it widens with a wedge to its broad end
    and takes in a double bond's second line, the same margin past the
    drawing all along (the drawing reports how far each bond reaches,
    `Layout.reach`).
- **Drawing is dragging bonds out of atoms**, and the editor is made for
  that way of drawing rather than for keys to learn: there are no keyboard
  shortcuts for building structures (agreed 2026-09-27).
  - A drag on an atom moves it; it snaps as it goes, and dropped on another
    atom it becomes that atom.
  - A double-click on an atom draws one bond where there is room; a
    double-click that drags draws one bond where it is led. Near 120
    degrees from a bond already there it snaps to that, and an arc grows
    out of the atom to tell it from the 30-degree grid. (Agreed 2026-09-28,
    after trying it: a plain drag drawing a bond was hard to get used to.)
  - A click alone edits the atom's label once the system's double-click
    time has passed (DOUBLE_CLICK_MS, half a second); a double-click
    slower than that, finding its first click already editing, takes the
    edit back. The end of a drag is not a click, though the browser fires
    one wherever the button comes up: a bond let go on the atom it has just
    drawn does not go on to edit that atom's label (utils/press).
  - A pause in a drag (FREE_MS) lets a bond or a moved atom go exactly
    where the pointer is, off the grid.
  - A bond led within reach of an atom closes onto it, and so does one led
    onto an atom however far away - a long bond closes a ring too; the
    preview shows it closed before the button comes up.
  - Chains - a bond laid down for every bond length the pointer goes - are
    not drawn for now (2026-09-28); they are to come back in some form.
    `utils/stroke` still knows them.

  The whole stroke is one undo step. (PR #57)
- **The mouse alone should be enough**, and it should travel as little as
  possible: what is done to an atom is done where the atom is, not from a
  toolbar across the window. Keys are shortcuts, never the only way.
- **Labels**: hydrogens go on the side away from the bonds, and on the right
  when the bonds are within 10 degrees of vertical (#24).

### Pointer and keys, in 2D and 3D

Agreed with the maintainer on 2026-09-27. Meno runs on Windows and macOS,
is worked with a mouse first but must be just as usable from a trackpad, and
will show the 2D drawing and the 3D structure in one canvas - so the same
hands do the same things in both, and modifier keys follow each system's
own conventions: where Windows uses Ctrl, macOS uses ⌘ (on a Mac, a
Ctrl-click is a right-click).

**Moving the view.** A left drag, the gesture used most, is the view's own
main movement; everything else moves or zooms the same way in both.

| | Mouse | Trackpad | 2D | 3D |
|---|---|---|---|---|
| Left drag from empty space | left drag | press and drag | move | turn |
| Right or middle drag, anywhere | right or middle drag | two-finger press and drag | move | move |
| Scroll | the wheel zooms | two fingers move | as the device | as the device |
| Zoom | the wheel | pinch | zoom | zoom |

A mouse wheel and two fingers arrive as the same event, so they are told
apart by the first event of each run - fingers move sideways, in fractions
and in small first steps (`lib/input/wheel.ts`); a pinch comes as a WebKit
gesture or, in Chromium, with Ctrl held. Measured on the maintainer's Mac,
a trackpad's first step is 1 or 2 px however fast the stroke, and a
smoothly scrolling mouse's notch (an MX Master 3S) is 13 px, so 8 px tells
them apart; a notch zooms at least as far as a plain wheel's 40 px line.
(PR #55; 3D follows when the views are joined.)

A drag that moves the view and is let go while still moving glides on,
as fast as it was going over its last moments and slowing to a stop; one
held still before it is let go stays where it was put. (It used to glide on
by its last move whatever came after - a drag held still went on drifting
when it was let go.)

**A click keeps each view's own meaning**: in 2D a click on an atom edits
its label and a click on a bond changes its kind, as drawing wants; in 3D a
click on an atom selects it. A right-click, or a press with two fingers,
opens the menu for what is under the pointer; it waits for the button to
come up, so a right drag is a move, not a menu.

**Selecting**, the same in both views:

| | Windows | macOS |
|---|---|---|
| Add or take out one atom or bond | Ctrl+click | ⌘+click |
| Everything along the bonds from the last atom chosen to this one | Shift+click | Shift+click |
| A box: what it holds | double-click empty space and drag, or Ctrl+drag | double-click empty space and drag, or ⌘+drag |
| A lasso: what it encloses | the box's gesture with Alt held | the box's gesture with Option held |
| A whole structure | right-click, *Select this structure* | the same |
| Everything | Ctrl+A | ⌘A |
| Nothing | click empty space, or Esc | the same |

A double-click in empty space that does not move still draws a bond, and a
double-click-and-drag that starts on an atom draws out of it instead. On a
trackpad a double-tap and drag does the same as a double-click and drag.
A box or a lasso drawn with Ctrl (⌘) held adds what it takes to the
selection; drawn without, it replaces it.

**What is done to a selection** (2D, PR #66). It is shaded in the hover
highlight's colour, under the drawing, and a small handle stands above it.

- Dragging any of its atoms moves the whole of it, off the grid, as one undo
  step; an atom that is not selected moves on its own as before.
- Dragging the handle turns it about its middle, in steps of 15 degrees, or
  freely after a pause - one undo step.
- The keys that act on what is under the pointer act on the selection
  instead, once there is one: Delete or Backspace deletes it, and
  Ctrl/⌘+Shift+K cleans up every structure it is in.
- A right-click on something selected, or on empty space, opens the
  selection's menu: *Delete selection*, *Turn over left to right*, *Turn
  over top to bottom*, *Clean up these structures*. Turning over is seeing
  the molecule from its other side, not its mirror image: the drawing is
  mirrored and every wedge on it becomes hashes and every hash a wedge, so
  each stereocentre keeps its configuration.
- The selection is the view's, not the document's: undo does not change it,
  and what an edit deletes leaves it.

**Copy, cut and paste** (PR #68; pictures, PR #69). Ctrl/⌘ with C, X and
V, as everywhere, and the same from the menus.

- What is copied is the selection - its atoms and every bond among them -
  or, with nothing selected, the structure under the pointer. With nothing
  to copy there, or anywhere else in the app with no text selected, a copy
  leaves the clipboard as it was (on a Mac the Edit menu's Copy would
  otherwise have the webview write an empty item over it).
- A paste goes where the pointer is (where the menu was opened, from the
  menu; the middle of the view, if the pointer is off the drawing), comes
  in selected so it can be dragged straight on, and is one undo step. What
  is dropped onto the drawing - a structure's file, or a structure dragged
  out of Word or PowerPoint - comes in the same way where it is dropped, as
  does a SMILES added beside what is drawn.
- The clipboard holds Meno's own record of the structure, which loses
  nothing, and a MOL file for other chemistry programs (MDLCT on Windows,
  which they exchange there) - and no plain text: PowerPoint pastes plain
  text as a text box in preference to anything offered with it. *Copy as
  SMILES*, in the selection's menu, puts the SMILES alone there as text.
- With them go pictures of the structure, drawn in the canvas's style at
  its own size, each carrying Meno's record so that the structure comes
  back: an EMF (vectors, the record in a comment) in Office's own clip
  format, which Word and PowerPoint keep as it is on either system; the
  EMF on its own, for Windows' other programs; and a PNG at 300 dpi (the
  record in a text chunk) for everything else. Pasted into Word or
  PowerPoint, the structure is a vector picture; copied there and pasted
  back into Meno, it is the structure again, wedges and charges and all.
- A paste reads Meno's own record first, then a picture that carries one
  (Office's clip format, as Word and PowerPoint hand it back, or a PNG),
  then a MOL file, then plain text that is a MOL file or a SMILES (drawn by
  the engine, as the SMILES card draws one).
- On empty space with nothing selected, a right-click opens *Paste* and
  *Select all*; the selection's menu starts with *Cut*, *Copy* and *Copy
  as SMILES*, and *Paste* when it was opened on empty space. Either, opened
  on empty space, ends with *Add reaction arrow* and *Add plus*.

## Who does what

- **TypeScript** holds the model, the gestures and the drawing - everything
  that has to answer within a frame. No Python in the drawing path.
- **RDKit** decides chemistry: valence and implicit hydrogens with charges,
  aromaticity, SMILES, stereo perception and CIP labels. (2D coordinates -
  clean-up - are Meno's own layout engine's, in TypeScript: 4a below.) It
  runs in the Python
  sidecar, in an environment the bundled `uv` builds on first launch;
  downloading it then, rather than shipping it, keeps Meno itself small, and
  the workflow side will need far more packages than this. Calls are
  asynchronous, and the editor stays usable while the environment is being
  built.
- **MOL V3000** is what passes between the two. The same writer saves files.

## Work, in order

Status: **done** (merged), **PR** (open), or blank.

### 1. What is broken now

| | |
|---|---|
| Atoms that cannot be picked up (stale bounding sphere, audit H2) | PR #23 |
| OH/HO flipping near vertical, at rest and mid-drag | PR #24 |
| Aromatic bonds (MOL order 4) imported as triple bonds | PR #27 |
| Opening a file counts as an edit: the tab is dirty at once, and undo empties the canvas | PR #28 |
| Closing a tab throws edits away without asking; the dirty mark is never shown (audit G2) | PR #29 |
| A double-click draw is two or three undo steps, not one | PR #26 |
| Wavy bonds notched at every joint (audit H3) | PR #31 |
| A carbon with no bonds is not drawn at all (ACS writes CH4) | PR #37 |
| A lone water drawn OH2: an atom with no bonds is written as its formula is, hydrogens first for groups 16 and 17 (H2O, H2S, HCl, H3O+) and after the symbol for the rest (NH3, CH4) | PR |
| An RXN file's structures run into its arrow: spaced by what is drawn, labels included - half a bond clear of the arrow, a bond between two structures on a side - and placed by the middle of what is drawn, not by the atoms' centroid | PR |

### 2. Drawing style as data, and one way of drawing

The move preview is a second implementation of the drawing, and it is where
every recent regression has been. It trims bonds at labels by font size
rather than by the label, picks double-bond sides with a simplified rule,
draws aromatic rings as Kekulé structures, sizes caps and joins on its own
terms, and holds three instances per bond where a hashed wedge needs seven.
Meanwhile the resting layers drop the dragged atom's bonds, which can turn a
neighbouring wedge round mid-drag.

Both go together, because both touch every layer.

**The drawing style**, as the maintainer set it out:

- **What it covers.** Bond length; line width; the width of a wedge's broad
  end and of a bold bond; double- and triple-bond spacing and how far the
  inner line is shortened; hash spacing; wavy amplitude and period; how ends
  and joins are finished; the label's font, size and clearance from its
  bonds; whether implicit hydrogens and terminal carbons are written; rings
  as circles or as Kekulé structures; colour, bold and italic.
- **Hashes at a fixed spacing.** A longer hashed bond gets more hashes, not
  wider gaps (PR #33).
- **More bond types.** Besides single, double, triple, wedge, hashed wedge and
  wavy: a plain bold bond, a bold dashed bond, a thin dashed bond, and a
  dative (coordinate) bond.
- **Rounding is all or nothing.** When ends and joins are round, every end is
  round - double and triple bonds included, which today are not. When they
  are square, every one is square.
- **Units.** Every length can be given in points or as a fraction of the bond
  length, whichever the user prefers.
- **Scope.** An application default; a document's own style over it; and
  per-bond and per-atom overrides over that (a coloured atom, a bold bond).
- **Where it is set.** Settings holds the application's style, and the
  canvas's Drawing style button gives a document one of its own. Either is
  a preset - ACS 1996, RSC, Wiley or Nature - and what was changed from it;
  every setting has its name, description, unit and range in
  `styleFields.ts`, and the preview is drawn by the same layout as the
  canvas. The application's style is kept in `settings.json` in the app's
  data folder; a document's stays with its tab, as MOL and SD files hold the
  structure only. (PR #46) Per-atom and per-bond overrides are to come.
- **Reaction arrows.** The style also sets how a reaction arrow is drawn:
  its line's thickness (a bond's, unless set), its head's length and width,
  and how far the back of the head is drawn in towards its point - none
  draws a triangle, more a barbed head. An arrow can set any of these for
  itself, from *Arrow style…* in the menu a right-click on it opens: a panel
  beside the canvas, where a setting left alone follows the style. The
  canvas and the settings' preview draw the arrow from one outline
  (`lib/chem/reactionArrow.ts`).
- **Defaults.** ACS 1996, exactly, as a preset. The default is Meno's own
  style built on it: ACS 1996's proportions with round ends and joins and
  labels in IBM Plex Sans, which is also the app's own typeface - its
  capital I has serifs and its l a tail, so Cl never reads as CI. (PR #47)
- **Typefaces.** Any typeface on the computer: a label is placed and
  cleared by that typeface's own letter shapes, read from its file when it
  is first used (the app hands over one face of a collection, with its
  character map made plain). ASCII letters of Arial (Helvetica too) and IBM
  Plex Sans come from tables written ahead of time by
  `scripts/fonts/labelMetrics.ts`, so a label sits the same before a file
  is read and in tests. A character the typeface lacks - Japanese, above
  all - is set in IBM Plex Sans JP, which comes with Meno; a typeface that
  cannot be had or read is set in IBM Plex Sans. The baseline follows the
  typeface, so a capital sits on its atom as ACS 1996 sets Arial's. (PR #48)

**One way of drawing:**

- **The preview drawn by the resting code**: the model with the dragged atom
  moved, laid out by `layoutMolecule` and drawn by the same layers. Nothing
  about a drag is drawn any other way. (PR #38)
- `ExtendPreview2D` goes the same way. (PR #38)

### 3. RDKit in the sidecar

- A `uv` binary for macOS alongside `uv.exe`, and each platform's bundle
  carrying only its own (a Mac build currently ships the 57 MB `uv.exe`). (PR #42)
- The managed Python and uv's cache kept under the app's data directory, not
  the user's. (PR #42)
- A `chem` profile: RDKit and its dependencies, locked for every platform with
  hashes and installed with them checked; warmed up once after installing
  (the first import of RDKit takes about 15 s on a Mac, later ones 0.15 s).
  The download asks first and goes on the network's record like any other.
  (PR #52)
- A dedicated worker that answers a fixed set of requests (not the console's
  run-any-code worker) - SMILES in and out, and per atom and bond
  hydrogens, valence errors, aromaticity and CIP labels - kept off the
  network, and a typed, asynchronous client for it on the TS side. (PR #52)
- A MOL V3000 writer in TS. (PR #40)

### 4. Editing a chemist expects

All hover-based, as above.

- Delete an atom or a bond; delete a selection. (PR #54: the atom or bond
  under the pointer, by Delete or Backspace or from the menu a right-click
  opens there, one undo step each; a carbon left with no bonds goes too.
  PR #66: the selection, by the same keys or its menu, in one step.)
- Selection: by click, by adding to it, by box or lasso, a whole fragment;
  move, rotate and flip what is selected. (PR #66, as above.)
- Elements without typing; charges, radicals and isotopes, drawn as
  superscripts and carried through the model, the files and the hydrogen
  count. (PR #65: charges, radicals and isotopes read from files and
  SMILES, kept and written back; the H an atom carries follow its charge.
  Drawn as the maintainer has it: a charge of one in its circle (⊕, ⊖),
  larger ones plainly (2+), after the label and above the line or, where a
  bond runs there, beside it; a charged carbon a bare vertex with its
  charge beside it; a radical a dot; a mass number before the symbol.
  Circled or plain, and a charged carbon's C, are the style's. Set by
  typing - N+, NH3+, O-, Fe2+, 13C, or a charge alone - by + and - over
  an atom, or from its menu, which also gives or takes an unpaired
  electron.)
- Ring templates (3- to 8-membered, benzene), fused onto a bond or an atom;
  chains. (Chains: PR #57, a double-click on an atom that drags - taken out
  again for now, that gesture drawing one bond. Rings, when they come, grow
  out of the same dragging, not keys.)
- Every bond type from the pointer: wavy, bold, dashed, and the rest of what
  the cycle cannot reach today.
- Abbreviations (Me, Ph, Boc, OTBS …) that read correctly and can be expanded.
- Clean-up of a structure or a selection. (PR #53: the whole drawing from
  its button, or the structure under the pointer with Ctrl/Cmd+Shift+K, as
  one undo step; the structures a selection is in, PR #66. Since the layout engine,
  4a, it is the engine's drawing - turned the way the structure is usually
  drawn, not the way it was - each structure where it was.)
- Valence warnings, and R/S shown on request (RDKit). (PR #53: a ring round
  an atom with too many bonds, saying what is wrong under the pointer; R/S
  and E/Z from a button on the canvas; both in Settings › Chemistry, and
  never in an exported picture.)
- Everything a molfile, SDfile or Rxnfile can hold, read after CTfile Formats
  and drawn after IUPAC's recommendations: docs/CTFILE.md, step by step.
- Abbreviations: Meno's own, those put together by rule (OTBS, 2,6-diMeBz)
  and the user's own, from Settings › Dictionary or a selection's *Save
  as abbreviation…*: docs/CTFILE.md, "Atoms that are not elements".
- Reaction arrows, "+" and text: create, move, edit, delete. (An arrow or
  a "+" is added from the menu a right-click on empty space opens, where it
  was opened: the arrow pointing right, two and two-thirds of a bond long.
  Either is moved by dragging it and deleted by Delete or Backspace under
  the pointer, or from its menu. The arrow under the pointer shows a handle
  at each end: dragged, that end goes where the pointer goes and the other
  stays, its direction in steps of 15 degrees, as a bond's, or freely after
  a pause - one undo step. An arrow sets its own line and head, as above.
  They come from an RXN file too, and are saved - as an RXN file - copied
  and in an exported picture: docs/CTFILE.md, "Reaction schemes". Text is
  still to come.)
- Copy and paste, within Meno and between tabs. (PR #68, as above; and
  between Meno and other programs, through the system clipboard.)

### 4a. A layout engine of Meno's own

Agreed 2026-09-27: clean-up as it is (RDKit's layout laid over the drawing,
PR #53) falls well short - taxol comes out unrecognisable - and neither of
RDKit's layout engines is good enough to build on, so Meno gets its own,
written from scratch, used for clean-up and for structures that arrive
without coordinates (SMILES).

What it has to do, in the maintainer's words: rings drawn clean and regular,
ring bonds kept plain with stereo shown on the bonds out of them - adding an
H where a ring-fusion centre has no other - substituents that would clash
turned to where they fit, and stretched only if they still clash, and the
molecule turned the way it is usually drawn (taxol with its bridgehead
double bond level). Macrocycles, macrolides above all, must come out well
as a matter of course. Sugars, amino acids and peptides, nucleosides and
lipids each have their own way of being drawn, which it should know.

1. **A benchmark to judge it by**: some seventy molecules, each beside the
   structure its Wikipedia article shows, with numbers for what looks
   untidy and for how the drawing sits - square to the lattice, its chains
   level, read left to right (`scripts/layout`, `src/lib/layout/metrics.ts`).
   The numbers are general rules, not a record of particular molecules.
   RDKit's two engines are the baseline. (PR #58)
2. The engine itself (`src/lib/layout/engine.ts`, by the rules in
   `docs/LAYOUT-2D.md`): ring systems, chains, macrocycles, stereo display,
   clash removal and orientation, measured on the benchmark at each step.
   A first pass is in; on the benchmark it scores best or level on most of
   the molecules against RDKit's two engines.
3. Clean-up and SMILES import moved onto it: `chem/cleanUp.ts` and
   `chem/engineLayout.ts`, the engine in a worker of its own
   (`chem/layoutWorker.ts`), as a large structure takes it up to a second.
   - What the engine is given is read out of the drawing itself
     (`lib/layout/drawn.ts`): each centre's configuration from its wedges,
     read as RDKit reads them, and each double bond's from its sides. So
     Clean-up no longer needs RDKit, and works before it is set up.
   - An H drawn on a stereocentre is taken as the centre's own: kept if
     the engine draws one there, taken away if not, and one added where the
     engine draws an H the drawing had not.
   - A cage comes out in perspective, as the engine draws one: its atoms
     keep a depth (`Atom.z`), and a bond passing behind another is drawn
     broken there. Its stereocentres (`Atom.stereoCentre`) show their
     configuration by the drawing itself, with no wedges: it is read from
     where their bonds point, so a substituent drawn round to the other
     side turns its centre (agreed 2026-09-28). A file, the SMILES and R/S
     are given the wedges that say it (`chem/drawing.ts#forFlatReaders`);
     the depth itself is not saved, so a cage opened again is flat, its
     stereochemistry wedged.
   - The new drawing is read back before anything moves: if it would not
     say the stereochemistry the old one said, Clean-up refuses. So it does
     for a wedge it cannot carry - wedge and hashes drawn opposite each
     other, or on an atom whose fourth group is a lone pair (a sulfoxide's
     S), which the engine has no way to take - rather than lose it. A wedge
     that says nothing (on a CH2) goes, and a double bond in a ring of
     seven atoms or fewer says nothing either: its ring has it cis, however
     the ring is drawn.
   - A SMILES is still read by RDKit, whose drawing says what it means;
     the engine then draws it (RDKit's drawing stands, should the engine
     fail).
   - Clean-up writes by name the groups a chemist would write so
     (`lib/chem/contract.ts`, agreed 2026-10-02). Drawing a label out
     (*Expand abbreviation*) still draws all of it; what is shown by name
     is Clean-up's to decide, by what the group does and how much of the
     molecule it is:
     - a protecting, activating or leaving group (`role` in
       `abbreviations.ts`: TBS, Boc, Ts, Tf, MOM, Bpin...) is written by
       name wherever it does that work - on a heteroatom or a metal, TBS
       even on ethanol, or on a carbon by an atom not carbon (TMS, Bpin,
       Ts) - unless the rest of the molecule is one atom or none: TsCl,
       Boc2O, B2pin2 and TBSOH are the group's own reagents, and are drawn.
       On a carbon by a carbon it is something else - "Boc" so is a
       tert-butyl ester, "MOM" a methoxymethyl - and goes by the next rule;
     - any other named group of three atoms or more, hanging by one bond
       from a heteroatom or a metal, is written by name where it is under
       15% of the molecule's atoms: taxol's OAc and OBz, Pd(PPh3)4's
       phenyls, but not aspirin's acetyl, a quarter of it. Methyl and ethyl
       are always drawn;
     - a group written as its formula wherever it hangs - an atom and the
       halogens on it, two or more (CF3, CCl3, CHF2, SF5), and a nitro
       group, NO2 - is written so (agreed 2026-10-02), unless the rest of
       the molecule is one atom or none (CF3I; the Ruppert-Prakash
       reagent's CF3, beside its TMS). Acids, amides, nitriles and
       sulfonyl groups - CO2H, CONH2, CN, SO2Cl, SO2NH2, SO3H, PO3H2 -
       are drawn;
     - where the drawing still hides something - atoms on each other, or
       on a bond - the largest groups left, alike ones together, are
       written by name too, for as long as each time hides less;
     - a heteroatom hanging by one bond, everything else on it written by
       name, goes into the label with them: OTBS, NHBoc, PPh3, PPh2;
     - what the last edit drew out of a label stays drawn out for the
       Clean-up straight after it, and for that one only, so that nothing
       is left drawn out for good;
     - a group holding a wedge's stereocentre, or an atom with more to it
       than its element and charge (an isotope, a radical, an atom map), is
       drawn: its label would not say it.

     It is one undo step with the layout. The dictionary's pictures of
     reagents, complexes and counter-anions (BArF's CF3) follow the same
     rules; a group's or a ligand's own picture is drawn out.

Its code is Meno's own: nothing taken from other depiction code, nothing
traced from reference drawings.

### 5. Files, clipboard and export

- Save and Save As (MOL/SDF), Ctrl+S, and closing asks when there is
  something to lose. (PR #43)
- Import that keeps charges, isotopes, radicals, atom lists and S-groups, and
  V3000 reactions.
- SMILES in and out. (PR #52: a SMILES card on the canvas)
- SVG export, drawn exactly as on the canvas - with the drawing style it was
  drawn in - and PNG. The SVG export draws what the canvas draws (PR #36),
  at ACS 1996's own size, from a button beside Save (PR #43); PNG to come.
- The clipboard, for Word and PowerPoint: a vector picture in each platform's
  own form (EMF on Windows, PDF on macOS), PNG and MOL alongside it.
  Agreed 2026-09-29: the structure is re-edited from Office - on Windows by
  a double-click (an OLE object), and on either system by copying the
  picture back into Meno, so the structure travels inside the picture
  itself. Tried on a Mac with Word and PowerPoint (paste, save, reopen,
  copy the picture again): a PDF comes back byte for byte, and so does a
  PNG, inside Office's own clip format; an EMF that Meno writes, handed
  over in that clip format, is kept as it is, drawn as vectors, and chosen
  over a PDF or a PNG offered with it - and, stored as an EMF, it is what
  Windows draws too. Word rewrites an SVG and drops what it carries. The
  same trial on Windows (Microsoft 365, 2026-09-29) found the same: the
  EMF in Office's clip format is kept byte for byte and drawn as vectors,
  and it is only in that clip format that Office hands it back - the EMF
  it puts on the clipboard itself is drawn afresh, without the comment. With
  the clip format there, plain text beside it does not become a text box
  (on either system); a PDF from a Mac shows coarse on Windows (Office draws
  the bitmap stored with it). (PR #69: every copy carries these pictures;
  the double-click on Windows is still to come.) Office on Windows draws
  an EMF's lines and shapes without anti-aliasing - bonds and wedges come
  out as stairs on screen - so the EMF draws everything twice: in EMF+
  records, which Word and PowerPoint draw smooth, and in the EMF records
  as before, for any reader that knows nothing of EMF+. Both keep it byte
  for byte, as before (Windows, 2026-09-29; on a Mac, 2026-09-30, drawn
  smooth there too).
- On Windows, a structure copied from Meno goes into Word and PowerPoint as
  an object - a Meno structure, which a double-click opens in Meno - by a
  plain paste. Meno is the object's server (`src-tauri/src/ole.rs`): it
  offers the class to COM as it starts, so a double-click reaches a Meno
  already running; with none running, Windows starts one, unseen, which
  goes again once Office is done with its objects and nothing else is open
  (Office also starts one only to have a picture). The structure opens in a
  tab of its own; each change goes back into the document as it is drawn -
  Meno's record, and the same EMF (EMF+ and all) as the picture shown - and
  closing the tab, or the document, lets it go. Insert > Object makes a new
  one. The installers register the class (the NSIS hooks run
  `Meno.exe --register-ole` and `--unregister-ole`, for the user; the MSI
  writes the same keys for the machine), and so can a developer by hand.
  What decides a plain paste, found on Windows (Microsoft 365, 2026-09-30):
  Word pastes a PNG, and PowerPoint Office's clip format or any RTF, in
  preference to an object; a copy between Word and PowerPoint carries none
  of these, and pastes as an object in both. So where Meno serves its
  objects, a copy carries the object, through OLE's own clipboard, with an
  EMF and a bitmap (DIB) for Windows' other programs, and neither the clip
  format nor the PNG; elsewhere (a Mac, or Meno not registered) it carries
  the pictures as before. The object keeps Meno's EMF byte for byte in the
  saved document, and copied back into Meno it is the structure again.
  Its size is the drawing's own, through an edit, a save and a copy
  between Word and PowerPoint (to within 1%). That takes care: Office
  measures a picture it asks for (Word as it saves an edited object, and
  as it copies one) by taking the frame's hundredths of a millimetre to
  pixels by the screen's physical size and back by its logical DPI, which
  seldom agree - 0.98 on the 100% desktop screen this was found on, 1.59
  over Remote Desktop at 175% (both tried) - while a picture it is sent as
  the drawing changes it takes as it says. So Meno sends the EMF as it is,
  and hands what Office asks for drawn to that measure: the same picture,
  its frame and all it draws scaled together, so that it looks the same
  in any box and only its stated size changes. (OLE's own cache sizes an
  EMF the same way, and keeps it so in the document; nothing seen reads
  it. A metafile picture with its size stated would keep it exact, but
  Word takes an object's changes only as an EMF.) A Mac cannot serve
  objects: there a document's object shows its picture, and a picture
  pasted from a Mac is a picture on Windows too - copied into Meno and
  pasted back, it becomes an object.
- On a Mac (Word and PowerPoint for Mac, 2026-09-30), a document's object
  shows its picture - smooth, at its size - and survives being saved there
  byte for byte, moved or not. A double-click on it only says the server
  cannot be found: Office for Mac has no way to hand another program's
  object to it. To edit one there, copy it - or drag it - into Meno. Word
  and PowerPoint for Mac hand an object over as its storage (a compound
  file, `com.microsoft.Embedded-Object`), without Office's clip format;
  Meno reads its record out of the storage's `Meno` stream (or its picture,
  `MenoPicture`), `src/lib/binary/cfb.ts`. A drag is read as it comes over
  the drawing, not when it is dropped: by then Office has taken it back
  from the drag pasteboard. A copy on a Mac makes only what the clipboard
  there takes (`clipboard_takes`): no bitmap or object for Windows.
- Drops are routed to the part of the page they land on (`src/lib/drop.ts`):
  a part that takes them - the drawing now; a tab strip, a workflow's node
  or a 3D view in time - registers as a drop zone, which says what it
  takes, may start reading a drag as it comes over, and is handed the
  drop. Files from the Finder or Explorer come through the webview's own
  drag events on both platforms, as does everything on a Mac. On Windows,
  WebView2 takes every drop in a process of its own and hands the page
  only files and text, and Meno nothing, so a drag from another program
  that is not of files is taken from it where a zone takes such drags:
  Meno lays a window of its own over the zone, clear to the eye, which
  Windows hands the drag to from the next move on (`src-tauri/src/drop.rs`).
  It reads what the drag carries - Meno's record in Word's object (which
  Word writes into a storage Meno makes, `GetDataHere`), Office's clip
  format, a PNG, a MOL file - and tells the page where the drag goes and
  where it is dropped; `drag_read` reads what it read. It offers only a
  copy, so the object stays in its document, and goes as the drag leaves
  the zone or ends (or when no button is held and nothing came to it).
  Tried on Windows (2026-09-30): Word's object dragged onto the drawing
  arrives there, selected, and Word's document is unchanged; so does a
  picture Meno put in Word (Office's clip format), which Word hands over
  only when a block of memory is asked for, not "memory or a stream" -
  so each is asked for in turn; both at 100% and over Remote Desktop at
  175%. Files onto the drawing and onto a new tab open as before. What a
  drag carries is read again at the drop if nothing was to be had as it
  came. PowerPoint for Windows
  was not seen to let a shape be dragged out of its window at all (nothing
  reached a plain drop target either): from there, copy and paste.

### 6. Alongside

- One molecule type instead of four (audit A1), before charges are added to
  any of them.
- Dead code out of `Atoms2D` (the spring and snap block that
  `LIVE_MOVE_PREVIEW = false` switched off, about 300 of its 1000 lines),
  and unused store actions.
- Tests for vertical labels, rings and aromatic circles; a GUI harness
  scenario for every gesture as it lands, zoomed-in drags among them, and a
  pixel diff between a `before/` and an `after/` run.

## Open questions

- **Name to structure, and back**: part of a high-end editor, but outside
  RDKit.
