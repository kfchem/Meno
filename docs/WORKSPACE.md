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
- Opening: XYZ files, and 3D MOL and SD records, by Open, a drop or a new
  tab.
- Working them: as the pointer table has it, with the right-click menu.
- The old viewer: retired, and the workflow's 3D node is a canvas.

Left for later:
- pictures of molecules in 3D for Office;
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
  | A 3D molecule | turns it about its centre, with inertia | moves the view | zooms the page | on an atom, chooses it; elsewhere, selects the molecule |
  | Its rim | moves it on the page | moves the view | zooms the page | selects the molecule |
  | Empty page | moves the view | moves the view | zooms the page | chooses nothing |

  - **A 3D molecule's reach** follows its shape: its atoms, its bonds and
    within its rings, and a few pixels about them, so a drag between two
    atoms still turns it.
  - **Hovered, its outline lights up**, very faintly, and the atom under
    the pointer swells a little on a spring. No frame: the maintainer
    asked for a highlight along the outline, in a modern way, rather than
    a rectangle round it.
  - **The rim just outside its outline** moves the molecule on the page,
    its outline lighting up more as the pointer reaches it.
  - **A structure rising out of its drawing** ends beside it, not on top,
    so that the drawing can still be edited.
  - **A drawing and its 3D structure.** Turning the 3D structure leaves
    the drawing as drawn. Hovering an atom in one lights the same atom in
    the other. *Turn like the drawing* is in the menu.
  - **Several molecules chosen** turn together, each about its own centre.
- **What a 3D molecule looks like** starts from the 3D viewer's look:
  - atom size and colour, material and light, and the turn's inertia,
    near enough;
  - held as a style, as the 2D drawing's is, so that it can be set the
    same way later.

Taken while stage 1 was built, on 2026-10-03:

- **Choosing and selecting.**
  - A click on an atom of a 3D molecule chooses it, or lets it go. Atoms
    are chosen in order, up to four, as in the old viewer; one in another
    molecule starts afresh.
  - A click elsewhere on the molecule, or on its rim, selects the molecule
    whole. With Ctrl (⌘ on a Mac) it is taken into the selection or out
    of it.
  - A box, a lasso or select all takes 3D molecules by their centres,
    with the drawing.
  - Delete, Cut, Copy and Escape include them. A drag on any of what is
    selected moves all of it, drawing and molecules, as one step.
- **The right-click menu on a 3D molecule:**
  - a measurement of its chosen atoms (two, three or four);
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
  shows are not undone. They are kept by a copy and by the workspace file,
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
- **Office.** A copy of 3D molecules alone carries no picture yet, so
  Word and PowerPoint get nothing to show.
