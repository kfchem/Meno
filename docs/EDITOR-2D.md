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
- **The mouse alone should be enough**, and it should travel as little as
  possible: what is done to an atom is done where the atom is, not from a
  toolbar across the window. Keys are shortcuts, never the only way.
- **Labels**: hydrogens go on the side away from the bonds, and on the right
  when the bonds are within 10 degrees of vertical (#24).

## Who does what

- **TypeScript** holds the model, the gestures and the drawing - everything
  that has to answer within a frame. No Python in the drawing path.
- **RDKit** decides chemistry: valence and implicit hydrogens with charges,
  aromaticity, SMILES, clean-up (2D coordinates), stereo perception and CIP
  labels. It runs in the Python
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
- **Defaults.** ACS 1996, exactly, as the preset the default starts from.
  The values used today are not quite it (line width is 5% of the bond
  length where ACS gives 0.6 pt of 14.4 pt, about 4.2%; double-bond spacing
  20% where ACS gives 18%), so switching to the style moves the picture
  slightly - on purpose.

**One way of drawing:**

- **The preview drawn by the resting code**: the model with the dragged atom
  moved, laid out by `layoutMolecule` and drawn by the same layers. Nothing
  about a drag is drawn any other way. (PR #38)
- `ExtendPreview2D` goes the same way. (PR #38)

### 3. RDKit in the sidecar

- A `uv` binary for macOS alongside `uv.exe`, and each platform's bundle
  carrying only its own (a Mac build currently ships the 57 MB `uv.exe`).
- The managed Python and uv's cache kept under the app's data directory, not
  the user's.
- A `chem` profile: RDKit and its dependencies, locked for every platform with
  hashes and installed with them checked; warmed up once after installing
  (the first import of RDKit takes about 15 s on a Mac, later ones 0.15 s).
- A dedicated worker that answers a fixed set of requests (not the console's
  run-any-code worker), and a typed, asynchronous client for it on the TS
  side.
- A MOL V3000 writer in TS.

### 4. Editing a chemist expects

All hover-based, as above.

- Delete an atom or a bond; delete a selection.
- Selection: by click, by adding to it, by box or lasso, a whole fragment;
  move, rotate and flip what is selected.
- Elements without typing; charges, radicals and isotopes, drawn as
  superscripts and carried through the model, the files and the hydrogen
  count.
- Ring templates (3- to 8-membered, benzene), fused onto a bond or an atom;
  chains.
- Every bond type from the pointer: wavy, bold, dashed, and the rest of what
  the cycle cannot reach today.
- Abbreviations (Me, Ph, Boc, OTBS …) that read correctly and can be expanded.
- Clean-up of a structure or a selection (RDKit).
- Valence warnings, and R/S shown on request (RDKit).
- Reaction arrows, "+" and text: create, move, edit, delete.
- Copy and paste, within Meno and between tabs.

### 5. Files, clipboard and export

- Save and Save As (MOL/SDF), Ctrl+S, and closing asks when there is
  something to lose.
- Import that keeps charges, isotopes, radicals, atom lists and S-groups, and
  V3000 reactions.
- SMILES in and out.
- SVG export, drawn exactly as on the canvas - with the drawing style it was
  drawn in - and PNG. The current SVG export is unmounted, and loses
  double-bond sides and wedge direction.
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
