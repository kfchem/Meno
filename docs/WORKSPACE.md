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
- **The 3D viewer** (`ui/features/MoleculeViewer`):
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
     saved in a file of Meno's own (`.meno`): the record the clipboard and
     Office already carry, extended. MOL, SDF and RXN stay for exchange.
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
| 3. Calculation output | Geometries, optimisation paths, energies, vibrations (modes animated) and charges read from ORCA, Gaussian, xTB and CREST, attached to their molecule; later orbitals and densities (cube files) as surfaces. | 2 |
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

Still to decide:

- **The camera.** Head-on perspective, or orthographic as today, decided
  on the spike's pictures.
- **Turning a molecule.** The left drag turns the molecule under the
  pointer, and on empty page it moves the view. This is proposed, and
  decided with the camera.

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
