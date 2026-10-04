# The workspace

Where Meno goes after the 2D editor: the 2D canvas becomes a workspace in
which everything about a molecule and the work on it is laid out together.
Agreed with the maintainer on 2026-10-03; judge it, like everything else,
against [PURPOSE.md](PURPOSE.md).

## What the workspace is for

One place, built on today's 2D canvas, where an organic chemist works
without changing tools:

- a structure drawn in 2D becomes its 3D structure, and back;
- 3D structures from calculations come in and sit beside the drawing;
- text, and the PDF of a paper, its pages shown and its content read;
- structures read out of a PDF's figures and drawn by Meno, editable;
- procedures built as workflows and run, their results coming back as
  molecules in the same space;
- and what a 3D library makes possible that a structure editor has not
  offered: a 3D structure rising out of the flat formula where it is
  drawn, groups of molecules arranged in depth.

All of it should be easy for anyone to use. The ways of working agreed for
the 2D editor stay: hover, then act; the mouse alone is enough; the same
hands do the same things in 2D and 3D (`EDITOR-2D.md`, *Pointer and keys*);
the interface says what things are, not how Meno reads them.

## Where it starts from

Both views already draw with react-three-fiber, which is why one canvas can
hold both.

- **The 2D canvas** (`ui/features/StructureEditor`):
  - an orthographic camera, drawn only when something changes;
  - instanced bonds and pick targets, troika text, unlit materials;
  - its structure is the tab's document, with undo and saving: one flat
    model with no notion of separate molecules;
  - atoms carry a depth (`Atom.z`) only for cages Clean-up draws in
    perspective.
- **The 3D viewer** (`ui/features/MoleculeViewer`, retired in stage 1):
  - a perspective camera with trackball controls, redrawn continuously
    while shown;
  - one mesh per atom and per bond, and every bond drawn single;
  - ball-and-stick or space-filling, 2 to 4 atoms measured (distance,
    angle, dihedral), a slider through a file's frames, and a ladder of
    several files by energy (nothing supplies the energies yet);
  - its state is the component's own: nothing is saved, and it is lost
    when the tab closes.
- **3D coordinates.** Nothing makes them from a drawing: the chemistry
  worker gives 2D coordinates only. A MOL or SDF file's z is dropped as it
  opens in 2D, and only XYZ files reach the 3D viewer.
- **Graphics contexts.** Every canvas is one, and only about 16 can be
  live (`lib/core/limits.ts`). A workspace is one canvas.

The 3D viewer is simple enough that the canvas gets its own 3D layers,
built the way the 2D layers are, rather than the viewer moved in as it is.

## Principles

1. **One space.** The canvas is a 3D space whose page is the plane z = 0.
   - A 2D drawing lies on the page; a 3D molecule is an object in the
     space beside it.
   - A drawing can also be a card set in front of the page or behind it.
   - The camera is to look straight at the page in perspective. Head-on,
     a plane is drawn exactly as an orthographic camera draws it, so the
     2D drawing looks as it does today. What has depth - a 3D molecule, a
     set of molecules at different depths - is seen in true perspective.
     (To be confirmed by the first spike, below.)
2. **The molecule relates everything.** A structure's 2D drawing, its 3D
   structures, its conformers and the results of its calculations are
   tied by which atom is which (a 2D atom's id, a 3D atom's index).
   - Any of them can be taken up from any view.
   - Hovering or choosing atoms in one shows the same atoms in the others.
3. **The workspace is a document.**
   - What is on the page - drawings, 3D molecules, text, PDFs, workflow
     steps - are items of one document. Each item has a place, and a 3D
     item an orientation.
   - Undo, saving and the clipboard work through it, as they do for the
     2D structure today (`lib/doc`).
   - 3D structures and PDFs do not fit in a molfile, so the workspace is
     saved in a file of Meno's own (`.meno`). It holds what the clipboard's
     record holds, and the document's own style and how each 3D molecule
     is turned and shown. MOL, SDF and RXN stay for exchange.
4. **One canvas, drawn only when needed.**
   - A 3D molecule's turning, with its inertia, requests frames while it
     moves, as panning does.
   - Atoms and bonds are instanced, so that a hundred conformers overlaid
     stay smooth.
5. **The rules already in place hold.**
   - Anything fetched from the network - models, programs - is a task of
     Meno's network, asked for and shown (`ARCHITECTURE.md`, *The
     network*).
   - Outside tools run in the sidecar, their licences checked one by one;
     no code is taken from other chemistry toolkits.

## Stages

| Stage | What | Needs |
| --- | --- | --- |
| 0. Groundwork | One molecule type (audit A1: bonds are still by id in the editor and by index elsewhere); typed tab data (A2); 3D files keep their z. | - |
| 1. 3D in the canvas | 3D molecules on the canvas, with everything the 3D viewer does, in the document and saved; the 3D tab retired. | 0, in part |
| 2. 2D and 3D joined | A drawing to 3D (RDKit's ETKDG and MMFF, the drawn stereochemistry kept); the 3D structure rising out of the drawing where it is, turned to match it, and back; hover and choice shared; a 3D structure drawn as a formula by Meno's engine; conformer sets (overlaid, by energy, Boltzmann weights). | 1 |
| 3. Calculation output | Geometries, optimisation paths, energies, vibrations (modes animated) and charges read from ORCA, Gaussian, xTB and CREST, attached to their molecule; later orbitals and densities (cube files) as surfaces. Each program's reader a plugin, added and removed online. | 2 |
| 4. Text and PDF | Notes on the page; a PDF on the page (pdf.js): its pages, its text searched, its figures cut out. | can run beside 3 |
| 5. Structures from PDFs | Figures read as structures (candidates: MolScribe, DECIMER) in the sidecar, their weights fetched with consent; drawn by Meno's engine, tied to the figure they came from, for the chemist to check and correct. | 4 |
| 6. Workflows that run | Workflow steps as items on the page, tied to molecules: RDKit conformers, xTB, CREST, and ORCA or Gaussian where installed. Jobs started, stopped and logged by the app. Procedures saved and shared with their results. | 2, 3 |
| 7. Depth | Analogue series, conformers and reaction steps arranged in depth; detail that changes with zoom. Tried as prototypes and shown before anything is settled. | 1 on |

## Stage 1, in order

1. **A spike, not merged.**
   - The 2D canvas with the head-on perspective camera, compared pixel for
     pixel with today's orthographic one.
   - One 3D molecule on the same canvas, beside a drawing.
   - Shown to the maintainer as pictures; the camera and the turning
     gesture are decided on them.
2. **3D layers.**
   - Instanced spheres and cylinders, with double and triple bonds drawn
     as such.
   - Light that reaches the 3D layers only (the 2D layers are unlit, so
     they do not change).
   - Drawn on demand; atoms picked.
3. **In the document.** A 3D molecule's place, orientation, frames,
   energies and measurements, with undo, the clipboard and the workspace
   file.
4. **Opening.** XYZ files, and MOL or SDF files with real 3D coordinates,
   open as 3D molecules on the canvas, by the Open button or a drop.
5. **Working them.**
   - Turn, move, zoom and choose, as the pointer table has it.
   - Measurements from the right-click menu, holding across frames.
   - The frame slider and the energy ladder beside their molecule.
   - Ball-and-stick and space-filling.
6. **The old viewer retired.** Once everything it does is matched, the
   `3d` tab goes, and the workflow's 3D node uses the canvas's layers.

Steps 2 to 6 depend on each other, so they go in one pull request, a commit
for each topic (one pull request per dependent chain).

**Where it stands** (#112): every step is done.
- 3D layers: instanced, double and triple bonds as two and three lines,
  light of their own, drawn on demand.
- In the document: place, look, frames, energies and measurements, undone;
  the clipboard and the workspace file.
- Pictures: in a copy's EMF, SVG and PNG, molecules in 3D are drawn as the
  canvas draws them - lit, in depth - each seen from straight above its
  centre, a bitmap at 300 dpi. A structure opened from Word or PowerPoint
  goes back with its molecules in 3D, turned as they are, and one holding
  only molecules in 3D is updated too.
- Opening: XYZ files, and 3D MOL and SD records, by Open, a drop or a new
  tab.
- Working them: as the pointer table has it, with the right-click menu.
- The old viewer: retired, and the workflow's 3D node is a canvas.

Left for later:
- values of measurements that overlap each other;
- energies only from XYZ comment lines, until stage 3's readers.

## Decisions

Taken on 2026-10-03:

- **3D molecules are objects on the page**, not a switch of the whole
  canvas between 2D and 3D. A drawing and its 3D structure sit side by
  side, which is also what lets the 3D structure rise out of the drawing
  later.
- **The 3D tab is retired** once the canvas does everything it does.
- **MOL and SDF files with 3D coordinates open as 3D molecules**; XYZ
  files too.
- **The workspace has a file of Meno's own**, `.meno`.

- **The camera looks at the page head-on, in perspective** (agreed on the
  spike's pictures). The spike compared the page pixel for pixel with
  today's orthographic camera:
  - identical at four zooms, and for taxol 8 pixels out by 1/255;
  - only the selection shading, which lies 0.04 behind the page, moved,
    by under a pixel at its edges, so every page layer is to lie on the
    page and be ordered by drawing order alone.

  The camera stands 60 bond-units from the page and keeps today's zoom:
  CSS pixels per world unit on the page.
- **Each 3D molecule turns by itself; the page never tilts.** With a
  drawing and its 3D structure side by side, turning the view would show
  the drawing askew. So what is under the pointer decides:

  | Under the pointer | Left drag | Right or middle drag | Wheel, pinch | Click |
  |---|---|---|---|---|
  | A 2D drawing | as today | moves the view | zooms the page | as today |
  | A 3D molecule | turns it about its centre, with inertia; selected, moves it and all that is selected with it | moves the view | zooms the page | on an atom or a bond, chooses it |
  | Empty page | moves the view | moves the view | zooms the page | chooses nothing |

  - **A 3D molecule's reach** follows its shape: its atoms, its bonds and
    within its rings, and a few pixels about them, so a drag between two
    atoms still turns it.
  - **Hovered, its outline lights up**, very faintly, and the atom under
    the pointer swells a little on a spring. No frame: the maintainer
    asked for a highlight along the outline, in a modern way, rather than
    a rectangle round it.
  - **Held still, a press selects the molecule** (0.4 s, as in 2D), the
    selection's outline spreading out from the atom pressed on as it is
    held; a drag from there moves it. A molecule selected moves when
    dragged, with all that is selected; one not selected turns. (Agreed
    on 2026-10-03, in place of a rim outside the outline that moved it:
    the maintainer expected to select and drag by reflex.)
  - **A structure rising out of its drawing** ends beside it, not on top,
    so that the drawing can still be edited.
  - **A drawing and its 3D structure.** Turning the 3D structure leaves
    the drawing as drawn. Hovering an atom in one lights the same atom in
    the other. *Turn like the drawing* is in the menu.
  - **The selection's handle turns molecules in 3D** (agreed 2026-10-03):
    - selected alone, as one body about their common centre, in 3D - as a
      drag on one turns it - so that molecules placed together, a complex
      say, stay as they are to one another. That moves them, so it is one
      undo step, and the undo puts their turns back too. Afterwards each
      stands as high as the turn left it, the whole resting on the page;
    - selected with a drawing, everything in the page's plane, the
      molecules carried round and turned with it;
    - with Shift, each molecule about its own centre, the drawing staying.

    Every turn by the handle is one undo step, Shift's and one molecule's
    alone too (agreed 2026-10-04), and the undo puts the turns back; a
    drag on a molecule itself turns only the view.
- **What a 3D molecule looks like** starts from the 3D viewer's look:
  - atom size and colour, material and light, and the turn's inertia,
    near enough;
  - held as a style, as the 2D drawing's is, so that it can be set the
    same way later.

Taken while stage 1 was built, on 2026-10-03:

- **Choosing and selecting.**
  - A click on an atom or a bond of a 3D molecule chooses it, or lets it
    go. Atoms are chosen in order, up to four, as in the old viewer, and
    bonds up to three; one in another molecule starts afresh. What is
    chosen makes a measurement: atoms in the order chosen, or along the
    bonds - one bond's length, two bonds' angle, three in a row their
    torsion angle - an atom besides going on from an end it is bonded to.
  - A long press selects the molecule whole. A click with Ctrl (⌘ on a
    Mac) takes it into the selection or out of it.
  - A box, a lasso or select all takes 3D molecules by their centres,
    with the drawing.
  - Delete, Cut, Copy and Escape include them. A drag on any of what is
    selected moves all of it, drawing and molecules, as one step.
- **The right-click menu on a 3D molecule:**
  - a measurement of what is chosen of it (two, three or four atoms);
  - ball and stick or space-filling, for that molecule;
  - reset orientation;
  - cut, copy and delete.
- **Measurements** are the document's:
  - a dashed line for a distance, or an arc and a faint fan for an angle
    or a torsion angle (IUPAC's sign), with the value beside;
  - measured afresh in whatever frame is shown;
  - the pointer goes through a value to the molecule, but the menu and
    Delete over it are the measurement's.
- **Frames.**
  - A molecule with frames has a chip under it: which frame, of how many.
    Hovered or selected, the chip opens to a slider.
  - The old viewer's ladder of energies became bars above the slider:
    each frame as high as it is above the lowest, and the chip says by
    how much in kcal/mol. One control serves both a trajectory and a
    conformer set.
  - Its atoms go over to another frame rather than jump.
- **What is the view's.** How a molecule is turned and which frame it
  shows are not undone, save a turn by the selection's handle. They are kept by a copy and by the workspace file,
  so that what is pasted or opened looks as it did.
- **Saving.**
  - `.meno` is JSON (`meno-workspace`, version 1).
  - An SD file holds each 3D molecule as a record in 3D beside the
    drawing.
  - With 3D molecules on the canvas, Save offers only what keeps them: a
    workspace or an SD file.
- **Calculation readers** (the maintainer): reading what calculation
  programs write is to be plugins, added and removed online. Meno itself
  reads geometry. The one reader so far, energies on an XYZ file's comment
  lines (CREST, xtb, ORCA), lives apart in `lib/calc`, and what it finds
  is plain data on the molecule.

## Stage 2, as built (agent/workspace-2d3d, after #112)

- **A drawing to 3D.** A structure's right-click menu, or a selection's,
  has *3D structure*. Stereo drawn without a configuration is ringed on
  the drawing while Meno asks what to make: every stereoisomer it gives,
  one, or none for now. Each is made as a conformer set (RDKit's ETKDG,
  then MMFF94) and comes onto the page as a molecule in 3D, its frames the
  conformers, lowest first. Of two enantiomers, one is made as the other's
  mirror image, so the two have the same conformers and shares.
- **Rising out of the drawing.** Turned to lie over the drawing (Horn's
  quaternion, `utils/align3d`), its atoms grow on the drawing's, go over
  to their places in 3D as it comes up off the page, and it moves to rest
  beside the drawing: to its right, its left, below or above - the first
  that is in view as it is seen - the view taking it in where none is.
  Several rise one after another, in a row.
- **Told apart.** A stereoisomer's centres that were left open carry
  their R and S always, every centre's while R and S are shown. They are
  as large as the drawing's R and S, set clear of their atom in the widest
  gap between its bonds as it is seen, and clear of each other.
- **Tied to the drawing.** An atom hovered in either lights in the other.
  Drawn otherwise since - atoms, bonds or wedges, not where they are - the
  molecule stays as it is and says so under its frames, with *Make
  again*, made where it stood. What the drawing leaves open is made as
  the molecule had it (so an (S) stays (S)), and Meno asks only about
  stereo that is new. An undo brings the molecule back as it was turned.
  *Turn like the drawing* is in its menu.
  Pasted with its drawing, it is tied to the pasted drawing.
- **And back.** *Draw as formula*: a molecule in 3D with no drawing is
  drawn by Meno's engine, wedged as it is in 3D, its bonds' orders found
  where a file of coordinates gave none, and tied to it.
- **Conformer sets.** Each conformer's share at room temperature
  (Boltzmann) stands beside its energy; *Show all conformers* draws the
  others over the one shown, each as dark as it is likely.

Taken on 2026-10-04, for stage 2:

- *3D structure* is on a structure's right-click menu and in Meno's menu
  (the latter once #119 is in).
- A drawing changed after its molecule in 3D was made: the molecule stays,
  and is made again only when asked.
- What is made is a conformer set from the first.
- Stereo left open is asked about before anything is made, and *all the
  stereoisomers* is one of the answers.

## Risks

- **The 2D drawing changing.** The thinnest lines and the place of every
  letter must stay as they are: checked by comparing pictures pixel for
  pixel.
- **The page and 3D objects overlapping.** The page's layers are ordered
  by drawing order, not by depth, so what is in front of the page and
  what is behind it needs ordering of its own.
- **Size.** Conformer sets run to thousands of atoms: everything 3D is
  instanced from the start.
- **Testing.** The GUI harness sees a WebGL canvas only while its window
  is on screen.
