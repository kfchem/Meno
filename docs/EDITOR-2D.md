# Finishing the 2D editor

What "finished" means for the 2D structure editor, how it is meant to be
worked, and what is left to do, in the order it should be done. Agreed with
the maintainer on 2026-09-25; judge it, like everything else, against
[PURPOSE.md](PURPOSE.md).

## What finished means

Everything up to, and not including, linking a structure to the 3D views.
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
  count.
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
- Reaction arrows, "+" and text: create, move, edit, delete.
- Copy and paste, within Meno and between tabs.

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
     that says nothing (on a CH2) goes.
   - A SMILES is still read by RDKit, whose drawing says what it means;
     the engine then draws it (RDKit's drawing stands, should the engine
     fail).

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

- **"As an object" in Word and PowerPoint**: a crisp vector picture, or one
  that opens back into Meno for editing? The second is an OLE server on
  Windows, and Office for Mac has nothing equivalent.
- **Name to structure, and back**: part of a high-end editor, but outside
  RDKit.
