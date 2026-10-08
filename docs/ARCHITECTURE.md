# Meno architecture

This document describes how Meno is put together today (pre-alpha). It is meant
as a map for contributors: where things live, which layer owns what, and how the
pieces talk to each other. For open problems and planned work see
[`AUDIT-2026-09.md`](./AUDIT-2026-09.md); for where the 2D canvas goes next -
a workspace holding 2D and 3D together - see [`WORKSPACE.md`](./WORKSPACE.md).

## Layers and responsibilities

| Layer | Location | Owns |
| --- | --- | --- |
| Tauri shell (Rust) | `src-tauri/src/lib.rs` | Window, plugins (`fs`, `os`, `opener`), and the only code that spawns OS processes: the bundled `uv` binary and the Python sidecar. No chemistry logic lives here. |
| App shell (React) | `src/App.tsx`, `src/lib/core/`, `src/ui/layouts/`, `src/ui/views/` | Tab model (open/close/reorder/rename), mapping a tab's `kind` to a view component. |
| Features (React) | `src/ui/features/*` | One folder per view: the structure canvas (2D drawing and molecules in 3D), Python console, text editor, settings. |
| Chemistry helpers (TS) | `src/lib/chem/`, `src/utils/` | File parsing (MOL/SDF/RXN/XYZ/PDB), editor model conversion, 2D depiction layout (bond lines, wedges, labels) and ACS-style sizing. Pure functions — no React, no Tauri. |
| Python worker | `src-tauri/resources/workers/interactive_worker.py` | Line-delimited JSON REPL run inside a `uv`-managed venv. |

Rule of thumb: parsing and geometry are pure TypeScript (testable with Vitest),
rendering is React + react-three-fiber, and anything touching processes goes
through a Tauri command.

## Directory map

```
src/
  App.tsx                 tab reducer wiring, TopBar + Deck
  lib/core/               tab state: types.ts (TabKind, State, Action), state.ts (reducer)
  lib/chem/               layout2d.ts (2D depiction primitives), style.ts / styleFields.ts (drawing style),
                          labelFonts.ts (label typefaces, letter by letter), ctfile.ts (molfiles,
                          SDfiles and Rxnfiles read as CTfile Formats has them: docs/CTFILE.md),
                          pdb.ts (PDB files read and written as the wwPDB's format v3.3 has them)
  lib/net/                network.ts: the network's record, consent, offline mode
  lib/io/                 kinds.ts: every kind of file Meno takes in, and what a file is - one
                          decision, by content, for Open, a drop and pasted text (docs/FILE-IO.md);
                          structures.ts: Meno's own reading of MOL, SD, RXN, XYZ and PDB files, run in
                          its worker, and the page's checks of what comes back; writers.ts: who
                          writes each kind Export offers - Meno, or a plugin added - and what a
                          plugin's writer is given (`WrittenMolecule`, `knownOf`)
  lib/settings/           appSettings.ts: the app's settings and their file
  lib/input/              wheel.ts: a mouse wheel told from two fingers on a trackpad
  lib/pyEnv.ts            creates/validates the uv venv for a Python profile
  lib/options.ts          options in a general form: drawn by Meno, declared by Meno or a plugin
  lib/doc/                documents and undo; savers.ts; menoFile.ts: the workspace file, a zip
                          (mimetype, workspace.json, files kept by SHA-256), written off the page
                          (menoFileWorker.ts) - docs/FILE-IO.md, *The workspace file*
  lib/roles/              the roles' workers (RDKit's, for now): client, sidecar, the MOL blocks they are asked about
  lib/calc/               readers of calculation output: the catalog, reading, promises, Meno's own reading
  lib/plugins/            plugins' manifests (data), read and checked; the plugins Meno carries, found in their folders
  lib/jobs.ts             jobs: programs run for a workflow's steps, apart from Meno (src-tauri/src/jobs.rs)
  utils/structureParsers  parseSDF (V2000/V3000), parseXYZ (multi-frame, distance-based bonds)
  utils/importers         readMoleculesFromText, RXN grouping/layout, EditorModel conversion
  utils/atomUtils         element table (radii, colours)
  samples/                textbook structures and reactions for the tests and the workflow's 3D node
                          (see samples/README.md)
  ui/layouts/TopBar       custom title bar: Meno's menu (its logo), tabs, "New…" menu, online/offline, Settings, window buttons
  ui/layouts/MenoMenu     the logo's menu: the app's commands and those the tab in front offers (commands.ts)
  ui/fonts/               the typefaces labels are drawn in, read from their files
  ui/network/             consent dialog, activity cards, Settings › Network
  ui/views/registry       TabKind -> { Component, create } table
  ui/views/Deck           renders every open tab, hides inactive ones with CSS
  ui/views/openFile       a file to the tab it opens in: Open (Ctrl/Cmd+O)
  ui/features/
    StructureEditor/      2D editor (see below)
    PythonConsole/        UI for the Python sidecar
    TextEditor/           plain textarea with line numbers
    StyleEditor/          every drawing setting, with a preview
    SettingsPanel/        Settings: drawing style, molecules in 3D, chemistry, files, calculations
                          and their jobs, plugins, dictionary, network
src-tauri/
  src/lib.rs              Tauri commands (see table below)
  src/fonts.rs            the system's typefaces
  src/net.rs              the network: tasks, the proxy, the record
  src/jobs.rs             jobs: Meno's job mode (`--job <folder>`), the queue, logs, stopping
  capabilities/           permission sets for the main window
  resources/py/           the lock files of Meno's own Python profiles (the console's, workflows');
                          uv and pixi are not bundled but fetched the first time an environment
                          needs one, pinned by version and SHA-256 (src/tools.rs)
  resources/workers/      Meno's own Python worker scripts
  resources/plugins/<id>/ a plugin, a folder of its own: manifest.json, its worker, its lock
                          (uv's requirements.lock, or pixi's pixi.toml and pixi.lock);
                          Meno names none of them (docs/PLUGINS.md)
```

## Tabs and views

`src/lib/core` holds a small reducer (`ADD_TAB`, `CLOSE_TAB`, `REPLACE_TAB`,
`SELECT_TAB`, `REORDER`, `SET_CONTENT`, `PATCH_DATA`, `RENAME_TAB`, `SET_DIRTY`). Each tab is
`{ meta: { id, label, dirty? }, content: { kind, data? } }`.

- `tabOrder` is the visual order in the title bar; `mountOrder` is the stable
  render order so reordering tabs never remounts a WebGL canvas.
- `Deck` renders **all** open tabs and hides the inactive ones; views receive an
  `active` flag and are expected to pause expensive work (e.g. set the R3F
  `frameloop` to `"never"`) while inactive. Workflow tabs pass the same flag to
  the canvases embedded in their nodes through `NodeActiveContext`.
- Because every live canvas holds a WebGL context and browsers keep only about
  16, `lib/core/limits.ts` budgets them: a 2D or structure tab costs one, a
  workflow tab two, and opening past the limit is refused with a notice rather
  than silently blanking the oldest view.
- Meno starts on a structure canvas, and "+" makes another: the canvas is
  the workspace (docs/WORKSPACE.md), so there is no start page.
- **Open** (Ctrl/Cmd+O, or the menu) reads the files picked in the system's
  dialog - Tauri's, which gives their paths - and opens each in a tab of its
  own, by what it is (`ui/views/openFile`, `lib/io/kinds`), told to the tab
  so that it is not asked again: in place of the tab in front if that is a
  canvas nothing is drawn on (`REPLACE_TAB`). A structure from an Office
  document opens the same way, as Meno's own record.
- **Closing the last tab quits Meno.**
- **Commands.** The canvas carries nothing but the drawing. Every command
  is in Meno's menu, which its logo opens, with its key; the app's own
  (Open…) and those the tab in front offers through `offerCommands`
  (`ui/layouts/commands.ts`), asked for as the menu opens. A structure
  canvas offers Save, Save As, Export, SMILES, Clean up all, Fit to
  content (Ctrl/Cmd+1), R and S, and Drawing style, and puts the same on its
  right-click menu on empty space. The system's own menu bar is left as the
  system has it.

## Documents and undo (`lib/doc`, being adopted)

A tab's content is a **document**: undoable, saveable, and readable by anything
holding the tab. Everything else a view needs - hover, drag previews, camera,
edit buffers - is **ephemeral**: owned by the view, never undone, never saved.
Drawing that line is what makes one undo mechanism work for every view, lets a
2D and a 3D view share one molecule, and keeps a new view to a small amount of
wiring.

`createDocument(initial)` returns a store with `edit(label, updater)`, `undo`,
`redo`, `reset`, `markSaved` and `history()`. History is snapshots: updates are
immutable, so untouched parts are shared rather than copied. Each document has
its own history (Ctrl+Z belongs to the active tab, not the whole app), edits
sharing a `coalesceKey` inside a short window collapse into one step (a drag
must not need one undo per frame), and the stack is capped.
`subscribe` matches React's `useSyncExternalStore`; nothing in `lib/doc`
imports React.

Adoption is incremental. The structure canvas, with its molecules in 3D
and the texts in its column, is on a document.

## How things move

Nothing on screen changes at a jump (asked for by the maintainer, for all
of Meno): a highlight eases in and out, a menu, a card or a mark comes into
view and goes out of it, and the drawing and the view go where they are
sent rather than appear there. Short and understated; what belongs together
moves together, in the same time and the same way.

- **One place** for how long and how: `ui/theme/motion.ts` - `DURATION`
  (quick 0.12 s for colours and highlights, base 0.16 s for things coming
  and going, move 0.22 s for the drawing and the view), one easing (CSS's
  `--ease-meno`) - save a panel sliding beside the canvas, which moves the
  drawing and so starts as gently as it ends (`EASE_SLIDE`), and anything
  going out of view, which starts as gently too (`EASE_LEAVE`, CSS's
  `--ease-meno-leave`: quick out of the start, a closing menu was half
  gone in its first frame and read as gone at once) - `TAU` for following
  a moving target, the spring, and motion's `FADE` and `RISE`, whose exits
  go with `LEAVE`.
- **The page's elements**: motion's `AnimatePresence` for what mounts and
  unmounts (menus, dialogs, notices, cards, panels, tabs); CSS
  `meno-fade-in` for what comes into view as a class goes on, and
  `meno-fade-out` with `ui/theme/presence.ts#usePresence` for what has just
  gone; every button's colours ease (one rule in `App.css`).
- **The canvas**: each layer eases its own parts in `useFrame` - each
  part its own way in and out, so one can go while the next comes - and
  invalidates only while something moves (see *Frame loop*). The drawing
  itself goes from shape to shape in `DrawnLayout` (`utils/glide.ts`), and
  a fit goes there through `components/viewGoal.ts`.

## Pointers

Meno draws its own pointers wherever it shows one other than the plain
arrow (asked for by the maintainer, 2026-10-07: the system's hands looked
poor, and on a Windows machine the dragging hand showed white). Each says
what a drag there does, not what grabs it, and none is a hand:

| Pointer | Where | The system's behind it |
| --- | --- | --- |
| `turn`, a ring with its arrowhead | over a molecule in 3D, which a drag turns | `grab` |
| `turning`, the same in Meno's accent | while it turns | `grabbing` |
| `move`, four arrowheads | over a molecule in 3D selected, which a drag moves, and while it moves | `move` |
| `sideways`, a double arrowhead | a slider, and a chip's bars, dragged along | `ew-resize` |

- **One place**: `ui/theme/cursors.ts` draws each as SVG on a 24-pixel
  grid, dark with a white edge to be seen on anything, its spot in the
  middle, and writes their rules once as Meno starts (`installCursors`).
  An element asks for one with `data-cursor` (`setCursor`).
- **Sharp on any screen**: each rule gives the SVG at 1x, then
  `-webkit-image-set` at 1x, 2x and 3x, which WebKit and Chromium read;
  the system's pointer stands behind it.
- **The arrow and the text cursor stay the system's**, as the chemist has
  set them up (size, colour). Clickable rows and buttons show the arrow,
  as a desktop program's do, not a pointing hand.

## 2D structure editor (`ui/features/StructureEditor`)

What is left before the editor counts as finished, and in what order, is in
[`EDITOR-2D.md`](./EDITOR-2D.md).

- **State**: the structure itself - atoms, bonds, arrows, aromatic circles and
  the id counters - lives in the tab's document (`document.ts`), which is what
  undo, redo and saving act on. A Zustand store per canvas (`store/index.tsx`)
  holds the ephemeral half (hover, drag and extend gestures, fit requests, the
  label edit buffer) **and mirrors the document**, so components keep reading
  `model` and `arrows` from the store with `useEditor(selector)`.
  `connectStoreToDocument` maintains that mirror; the slices never write model
  state directly, they call `document.edit()` with the pure operations from
  `document.ts`. A gesture is one undo step: extending a bond adds the atom and
  its bond together, an import replaces the model in one go, and repeated moves
  of one atom coalesce.
- **Rendering**: a react-three-fiber `<Canvas>` whose page is the plane z = 0,
  seen straight from above by an orthographic camera (since 2026-10-05):
  `camera.zoom` is CSS pixels per world unit on the page, and a molecule in
  3D is seen as large as it is, however high it stands. What sees molecules
  - picking, a fit, the selection's handle, where made molecules come to
  rest, pictures - follows the camera's eye (`utils/page.ts#eyeOf`, none
  for an orthographic camera; `seenAt`), so a view that is to show depth
  can have a perspective camera instead (`PageCamera`, which keeps
  `camera.zoom`'s meaning on the page). A point of the screen is taken to
  the page with `utils/page.ts#pageAt`, never by unprojecting alone. Page layers keep to the page (z within a few
  thousandths) and are ordered by drawing order. Each visual layer
  is its own component in `components/` (`Bonds2D`, `Atoms2D`, `Wedges2D`,
  `Labels2D`, previews, hover overlays, `PanZoom2D`, `FitToContent2D`, …).
  `DrawnLayoutProvider` lays the drawing out once - the model, with an atom
  being dragged or a bond being drawn out where the gesture has them - and
  the drawing layers read that one layout (`useDrawnLayout`). The move and
  extend previews only work out where the atom goes and publish it
  (`moveDrag.preview`, `extend.preview`); they draw nothing of the molecule
  themselves, so a gesture looks exactly as its result will. Model bonds
  reach the layout through `layoutBond(s)` in `layoutOptions.ts`.
  A drawing of tens of thousands of atoms - an SD file of a thousand
  records - has to come up in well under a second, so nothing in the
  layout or the layers goes over every atom or bond for each atom or bond:
  rings are found ring system by ring system (`lib/layout/rings.ts`), a
  bond's neighbours from its atoms' own bonds. A zoom does not lay the
  drawing out again while the layout made at the zoom it was laid out at
  is the same drawing at this one (`sameAtZooms`: world units, lines wider
  than the least they are kept at, a wave's turns in as many steps). The
  round caps are one instanced mesh; the hit areas of atoms and bonds are
  never drawn (picking does not ask whether a material is); the ring
  circles the canvas offers are found without a second layout
  (`ringCircles`), when the pointer looks for one; R, S, E and Z are placed
  against what is near them (`MarkObstacles`) and shown in one HTML layer.
- **Depiction**: `lib/chem/layout2d.ts` turns atoms/bonds into line segments,
  polygons, text and circles. How big everything is comes from a drawing
  style (`lib/chem/style.ts`): each length in points or as a fraction of the
  bond length, layered from a default up, with ACS 1996 as the preset.
  `lib/chem/acs.ts` turns that preset into layout options at
  `NOMINAL_BOND_LENGTH` world units. Labels are set in Arial, as ACS 1996
  has them: `lib/chem/arial.ts` holds its advance widths and the outline of
  each letter, so `placeLabel` places every run and bonds stop the label
  margin clear of the letters without measuring anything at run time. The
  canvas draws the runs where `placeLabel` puts them, in the system's own
  Arial (`label_font`); the SVG names Arial.
- **Hover, then act**: `hovered.atomId` / `hovered.bondId` is the subject
  of a key (Delete, the clean-up key) and of the menu a right-click opens at
  the pointer (`PartMenu.tsx`), which offers the same actions to the mouse
  alone. Only the main button works atoms and bonds; the other is the
  menu's. Over a button or a card nothing counts as hovered.
- **Strokes**: bonds drawn in one gesture are a stroke (`utils/stroke.ts`,
  with the angles in `utils/extendSnap.ts`) - a bond, or a chain - held in
  `extend.stroke` while it is drawn. A chain walks a honeycomb
  (`utils/honeycomb.ts`, `utils/chain.ts`) and may start on empty space
  (`NEW_ATOM`) or be traced with the button up (`extend.tracing`,
  `ChainGuide2D`). The store, `ExtendPreview2D`, `SnapArc2D` and the drawn
  layout all read the same stroke, so what is shown is what is added;
  `addStroke` (or `addStrokeAt`) adds it in one edit when it ends.
- **Long presses**: a press held still is `pressHold` in the store, which
  `HoldProgress2D` shows; `Atoms2D`, `BondsPick2D` and `Selection2D` time it
  (`LONG_PRESS_MS`) and select the structure, or begin a box.
- **Import**: what a file is, `lib/io/kinds.ts#kindOf` (once, by whoever
  takes it in) → `utils/io.ts#processFileContent` → `utils/importers.ts`, or
  the calculation readers (`lib/calc`).
- **Chemistry**: RDKit's marks on the structure, in `chem/` and
  `ChemMarks2D` (see the chemistry worker below); clean-up and a SMILES's
  layout by Meno's own engine (`src/lib/layout`), run in a web worker
  (`chem/layoutWorker.ts`), what it is given read out of the drawing
  (`chem/engineLayout.ts`, `lib/layout/drawn.ts`).
- **Frame loop**: the canvas runs `frameloop="demand"` at a fixed `CANVAS_DPR`
  (2x). React commits (store changes) request a frame automatically; anything
  that animates or mutates the scene imperatively must call `invalidate()`
  while it is still moving — see `PanZoom2D` (inertia), the hover layers and
  the drag/extend previews. A new animated layer that forgets this will appear
  frozen; a layer that invalidates unconditionally brings back the old
  always-on loop.

- **Molecules in 3D** (`Molecules3D`, `Molecule3DView`, `Frames3D`,
  `utils/molecule3d.ts`, `utils/measure3d.ts`):
  - What they are: the document's `molecules3d`. Each has its atoms in
    ångströms, its other frames and their energies, its look (ball and
    stick or space-filling), its measurements, and where on the page its
    centre stands. How each is turned and which frame it shows are the
    store's (`turns3d`, `frames3d`), not the document's, and so are what
    is selected of them (`sel3d`) and the atoms and bonds chosen in one
    (`chosen3d`). A turn of several as one body moves them, so it is the
    document's too: `store/turnJournal.ts` keeps the turns with that undo
    step, which stays one step however long the hand pauses in it. A turn
    by the selection's handle where they stand moves nothing, but is a
    step all the same (`keepTurns3d`), for the turns to go with.
  - How they are drawn: a molecule stands as high as it reaches, so no
    turn takes it behind the page - or where a turn of several as one body
    put it (`at.z`). It is instanced, lit, drawn after the
    page and depth-tested; double and triple bonds are two and three
    lines. Another frame, another look, or a place set by an undo is gone
    over to, not jumped to. Its look is a style (`lib/chem/style3d.ts`):
    presets, the old 3D viewer's first, and a choice of one with changes,
    kept in the app's settings (`style3d`) and edited in Settings by
    `StyleEditor/Style3DEditor`; the canvas reads it through
    `StructureEditor/style3d.ts`. A 1.5 Å bond is as long as a drawn one.
  - The pointer: hovered, its outline lights up faintly and the atom under
    the pointer swells on a spring. A drag on it - its atoms, bonds or
    within its rings - turns it, with inertia; on one selected, it moves
    it and all that is selected. A long press selects it, the outline
    spreading from the atom pressed on; a click chooses an atom or a
    bond. The selection's handle (`Selection2D`) turns molecules alone as
    one body in 3D, and with a drawing in its plane.
  - The rest: measurements, made from its menu, are measured afresh in
    whatever frame is shown. Its frames are a chip under it that opens to
    a slider, with each frame's energy as a bar.
  - See [`WORKSPACE.md`](./WORKSPACE.md).
- **The workspace file** (`utils/workspace.ts`, `.meno`): everything on the
  canvas as JSON (`meno-workspace`), the molecules in 3D turned and shown
  as they are, and the document's own style. With molecules in 3D on the
  canvas, Save offers only it or an SD file, which holds each as a 3D
  record.

## Workflows

Calculations built as workflows are on the page itself - the workspace is
the node editor - as [`WORKFLOWS.md`](./WORKFLOWS.md) specifies (stage 6).
The Workflow Builder tab, a prototype on React Flow, was removed with
React Flow on 2026-10-08: the workspace's editor is written anew, its code
not taken from either.

- **The document holds it** (`StructureEditor/document.ts`): `sets`,
  `steps` and `wires`, numbered from `nextWorkflowId`; each change is an
  edit (`workflow/model.ts`), so undo takes it back and the workspace file
  keeps it (`utils/workspace.ts`, read back by `workflow/saved.ts`).
- **What a set holds is what lies inside its frame** (`workflow/entries.ts`):
  never a list of ids, so moving a molecule in or out is all it takes, and
  a workspace opened again needs no ids mapped. A set the chemist makes is
  a compound set; a set a step made says what it holds (`made.holds`).
- **How parts join** (`workflow/flow.ts`): what a port gives, what may be
  wired to what (`canWire`), what comes into a step, and its state - the
  key of what it ran on, kept with the run, tells *Changed*.
- **Kinds and who does them** (`workflow/kinds.ts`, `workflow/doers.ts`):
  Meno's table of kinds; Meno does the steps on entries alone
  (`workflow/meno.ts`, the RMSD in `workflow/rmsd.ts`), and a run
  (`workflow/run.ts`) puts what it gave in a result set to the right of
  its step, in one edit.
- **Drawn** by `components/Workflow2D.tsx`: wires are the canvas's own
  ribbons; sets, step cards (`workflow/SetFrame.tsx`, `StepCard.tsx`) and
  ports are HTML on **one** layer laid on the page at its scale (drei's
  `Html` in transform mode, `workflow/look.ts` `PX`). One layer, not one
  per part: WebKit finds what is under the pointer among layers in their
  order, and a part's layer covered the parts on the layers below it.
  Lines are a hair on the screen at any zoom: the layer's `--hair` is set
  each frame from the zoom, and wires are made as wide on the screen for
  it. Colours, cards and icons are Meno's own (WORKFLOWS.md, *How it
  looks*): its palette, its cards' hairline borders, Heroicons' outline
  icons (`workflow/icons.tsx`).
- **Who does a step** (`workflow/doers.ts`): a step is a plugin's - or
  Meno's, which stands among them for the steps on entries alone - and
  of one of the kinds its manifest's `steps` fill (`kindsOf`); who does
  it says what options it takes (`optionsFor`); their defaults are set in
  Settings alone, by plugin and kind (`step:<who>:<kind>`), and a step
  starts with them, its own changes never written back. Quick Add offers
  the plugins added, each with its kinds (`workflow/offered.ts`).
- **Running** (`store/slices/stepRuns.ts`): the steps to run - those
  asked for, and before each those that have not run or have changed -
  each started once the step before it has ended well, those that do not
  wait on one another at once (`runSteps`; *Run from here* adds the steps
  after, *Run all* every step not done); each run - Meno's at once, as
  one edit; a plugin's in its worker (RDKit's 3D structure, through the
  roles' `conformers`); a plugin's step on entries alone at once, `run`
  asked of its worker and the entries it kept brought in, the rest set
  aside (RDKit's *Duplicates*); a plugin's
  program as jobs: `prepare` asked of its worker, a job started for each
  (lib/jobs), the run kept in the document as `running` - amended in, so
  that undo does not take a run back, but the workspace is unsaved until
  saved, and saved keeps it - its jobs looked at each second while there
  are any (Workflow2D), and, all ended, `collect` asked for each and the
  results brought in as one edit - a conformer search's as a conformer
  set, each geometry it gave a conformer of its entry's compound, and on
  a conformer set one job for each compound (`jobEntries`,
  `conformersWorked`). A workspace opened with steps running
  is looked at the same way, and picks them up. What a plugin sends and
  reads back is checked as data (`workflow/programs.ts`). A step keeps
  its earlier runs, with what each gave (`keepRun`, `showRun` in
  `workflow/run.ts`), as a new run's results come in.
- Settings, Calculations, is `SettingsPanel/CalculationSettings.tsx` - by
  plugin, each with its kinds' options - and its jobs
  `SettingsPanel/JobSettings.tsx`.

### Jobs

A program a step runs - xTB's, say - runs as a job (`src-tauri/src/jobs.rs`,
`lib/jobs.ts`): in a folder of its own, `<app data>/jobs/<id>/`, apart from
Meno, so that it goes on when Meno closes (WORKFLOWS.md, *When Meno
closes*).

- **Meno's own executable runs it.** `job_start` writes the job's folder -
  `job.json` (the program, its arguments, its environment), its input in
  `work/` - and starts Meno's executable as its runner, `Meno --job
  <folder>`: `run()` hands that to `jobs::job_mode` before anything else, so
  it opens no window and needs no webview. The runner is started in a
  process group of its own (detached, on Windows) and nothing of Meno's
  waits on it.
- **Jobs wait their turn.** A runner takes its turn under `jobs/.queue.lock`
  (`File::lock`): the earliest asked for among those waiting starts when
  fewer are running than it allows (`slots`, Settings' *Jobs at once* when
  it was asked for).
- **Its program** runs in `work/`, its output and errors in `log.txt`, in a
  process group of its own (macOS, Linux) or a job object that kills what
  is in it when it closes (Windows), so that *Stop* - a `stop` file the
  runner looks for - stops it and everything it started: asked, then made
  to after 3 s (macOS, Linux); at once (Windows). The runner writes how it
  ended in `state.json`, whole each time (written beside it, then renamed).
- **Gone is told by a lock, not a process id.** The runner holds
  `runner.lock` for as long as it is there; a record that says waiting or
  running whose lock nobody holds was left by a runner that went without
  saying how it ended - the computer restarted - and reads as *gone*. A
  process id would be another program's after a restart.

## Python console and sidecar

```
PyConsole ──ensurePyEnv(profile)──▶ py_env_python_path_uv / py_env_setup_uv (Rust)
          │                          ├─ tools::ensure(Uv): <data>/tools/uv/<version>/uv[.exe], fetched once
          │                          └─ runs it: `uv venv`, `uv pip install -r <lock>`
          │                             stdout/stderr → events uv:log / uv:err
          └─ext_spawn_sidecar({ entry: <venv python>, args: ["-u", <worker.py>] }) → id
             ext_stdin(id, JSON line) ─▶ worker ─▶ events ext:stdout / ext:stderr / ext:exit
             ext_kill(id)
```

The chemistry roles (`lib/plugins/roles.ts`: SMILES, the checks, R and S,
stereoisomers, conformers, a formula of a molecule in 3D) are filled by a
plugin that says so in its manifest - RDKit, for now, a folder of its own
like any plugin (`resources/plugins/rdkit/`, its environment
`plugin-rdkit`). Its worker is a sidecar, started by `lib/roles/worker.ts`
(`chemWorker(role)`: the plugin chosen for the role in Settings, else the
first that fills it) and asked through `lib/roles/client.ts`: JSON lines, a
fixed set of requests (ping, to_smiles, from_smiles, analyse, and for 3D
open_stereo, conformers and drawing_of), MOL blocks in (written by
`lib/roles/molblock.ts`, a label that is not an element as `*`) and V3000
blocks or coordinates out. It is set up the first time a role it fills is
needed, asking first, unless the chemist took it away in Settings, Plugins
(`plugins.removed` in the settings); then the role says to add it. It runs
no code it is sent, and the app keeps it off the network. Its tests need
RDKit and run by hand (`scripts/chem/test_chem_worker.py`).

Reader plugins (docs/FILE-IO.md, docs/PLUGINS.md) are sidecars too, one
profile each, named `plugin-<id>` as every plugin's is. Each is a folder
of its own, `resources/plugins/<id>/`, and stands alone: it knows of no
other plugin, and Meno names none of them. Its manifest (`lib/plugins/manifest.ts`;
the folders found by `lib/plugins/known.ts`, the plugins Meno carries for
now) is data saying what it is, its lock and worker in its folder, the
kinds it brings - each told by marks, text, never a pattern - and the kinds
it reads by id, its own or Meno's; it is checked as data however it came.
`lib/calc/catalog.ts` makes the readers of the manifests, with Meno's own
reading (`MENO`) first. Meno's core knows no program (the maintainer,
2026-10-06): `lib/io/kinds.ts` knows Meno's own kinds only, and registers
the kinds of the plugins added - while they are added (`lib/calc/workers.ts`)
- refusing a mark that one of Meno's own sample files holds. The kinds of
the plugins on offer, added or not (`OFFERED`), are looked at only to say
which plugin would read a file no plugin added reads
(`lib/calc/probe.ts` `kindOfFile`).
- A plugin is added in Settings, *Plugins*: `ensurePyEnv`, with the
  network's consent under `python-env:plugin-<id>`. It is taken away there
  too: `py_env_remove`, which removes only its own folder.
- *Files* in Settings says who reads each kind: one reader (`readerFor`:
  the one chosen, else Meno where Meno reads it, else the first added), and
  the readers chosen to read it as well (`alsoReadersFor`), kept as
  `files` in the settings.
- `lib/calc/workers.ts` starts a reader's worker the first time it is asked
  to read, as `lib/roles/worker.ts` does, and asks it through
  `lib/calc/client.ts`: `{"op": "read", "kind", "name", "text"}` - Meno has
  told the kind already; the file's text, never a path - and back Meno's
  own plain data (`lib/calc/output.ts` `ReaderOutput`); `ask` for a
  promise, `probe` for a kind its plugin tells itself (`lib/calc/probe.ts`).
  Like the chemistry worker, it runs no code it is sent and is kept off the
  network. A reader is known by its id: a molecule keeps its readers as
  "id version" (`readerIdOfLine`), its results their reader's id.
- A plugin that writes a kind declares it in its manifest's `writes` (the
  kind, its files' extensions, what it takes, its options as data, checked
  by `acceptOptions`). Export offers it while the plugin is added, for
  molecules in 3D: the molecules chosen become one `WrittenMolecule`
  (`StructureEditor/utils/written.ts`; several as they stand on the page),
  the worker is asked `{"op": "write", "kind", "name", "molecules",
  "options"}` through the same client, and the text it gives back is
  written where the chemist chose. The first is Gaussian's input
  (`resources/plugins/gaussian-input/`, Python alone; its tests,
  `scripts/calc/test_writer_gaussian_input.py`, run in CI).
- Where the line is between a plugin and Meno: a plugin knows the file,
  Meno where and how what it found shows, and what can be done with it.
  What Meno does something with has a form of its own in `ReaderOutput` -
  the atoms, each geometry, each one's energy in hartrees, and what the
  calculation was (program, method, basis, charge, multiplicity). Every
  thing else is a result, in one general form (`lib/calc/results.ts`): it
  belongs to the molecule, each frame, each atom, pairs of atoms or a list;
  it has a group and a name; and its values are numbers or texts, each as a
  quantity Meno knows - an energy in hartrees, a charge, a wavenumber (an
  imaginary one negative), a length, an angle, a dipole - or with its own
  unit. `readResults` keeps those that read as results for the molecule
  (the right count, indices it has, no markup), and `valueText` writes
  them, the same whoever gave them. A list's row can be of atoms, a frame or
  a motion; a molecule's result can rank for the chip's line (`chipLine`).
- One reader reads a kind (`lib/calc/read.ts` `readOutput`): the molecule
  stands on the page as soon as it answers, with its geometries and what
  the calculation was. The readers chosen to read it as well read it
  alongside; what each finds - or that it could not read it - is put out by
  the output's SHA-256 (`lib/calc/readings.ts`) and joined to each molecule
  read from that output wherever it stands (`withReadings`, applied by the
  document's `amend`: learnt of the document, not done to it, so nothing
  to undo), a reader that could not read it said in the chip's card.
  `combine` puts findings together as they are joined: the geometries are
  the reader's, a reader whose atoms are not those is left out, and every
  reader's results are kept, each with the reader it came from: a result is
  known by its reader and its name with that reader (`resultKey`), and
  names are never matched across readers. Where two
  readers' results stand in one place, each reader's are under its name
  (`lib/calc/sources.ts`: `cardGroupsOf` for cards and the chip's details,
  `titled` for the menu's lists); the chip's line is the first's that
  ranked any. Where none is added, opening the file says which plugin to add.
- An opened file that is no structure file but a kind of output
  (`openedAs`, `processFileContent`) is read so, and its geometries come in
  as an XYZ file's frames do (`calcResult`), its last shown; what the
  calculation was, the readers that read it and its results are kept on
  the molecule (`calc`, saved in `.meno` and read back by `readCalc` as a
  plugin's are), so that they show as they were where no reader is
  added.
- Where results show (3c), as the look stays as it is: the molecule's -
  and the frame's shown - above the frames chip, as its text is pointed at,
  its line saying the ranked ones (`Frames3D`); an atom's, or a bond's, on a
  card beside it once it has been pointed at a moment (`PointedCard3D`,
  placed each frame by `Molecule3DView`); and each list from the
  molecule's menu, under it (`CalcList3D`; the view's `lists3d`, by
  molecule, with the row chosen and the row pointed at). Opened with too
  little room below it, a list asks for room, and the view glides - zooming
  out, where it must - until the molecule and the list are both seen. A
  row pointed at outlines its atoms; one chosen shows its frame or moves the
  molecule. No colouring (the maintainer).
- Vibrations (3b) are a list whose rows move the molecule: one chosen, its
  atoms move in it each frame (`Molecule3DView`): what the motion added is taken
  off the atoms' places before the frame is placed and put on again after
  (`utils/vibration3d` `vibrationOffsets`), so frames, measurements and
  labels follow as for any motion; its swing eases in and out, and another
  chosen waits for the one moving to come to rest. The atom that moves most
  goes 0.3 Å, once every 1.2 s, whatever the frequency. No arrows and no
  spectrum (the maintainer).
- The first reader is cclib's (`resources/plugins/cclib/worker.py`), cclib
  used as a library, its version pinned in its folder's
  `requirements.lock` (1.9rc1: 1.8.1 does not read ORCA 6). Its manifest
  brings every program cclib reads, each told by its own banner as cclib
  tells it. Its tests read sample outputs from `calc-samples/`, which
  git ignores - no program's output is committed - and run by hand
  (`scripts/calc/test_reader_cclib.py`); the app's side is tested with the
  plain data written by hand.
- The PySCF reader (`resources/plugins/pyscf/worker.py`, in a pixi
  environment: PySCF from conda-forge, which has it for Windows; cclib
  from PyPI) is a plugin of its own, sharing no code with another
  (the maintainer, 2026-10-06). It gives the molecule - read with cclib as
  a library, or a Molden file with PySCF - and its orbitals and densities;
  charges, vibrations and the like it leaves to other readers. Where an output
  holds the basis set and the orbitals' coefficients, cclib writes them as
  a Molden file (each p shell's functions put in x, y, z order, as ORCA's
  are not) for PySCF to read back, and the orbitals are checked
  orthonormal in their basis before any surface is promised - where they
  are not, it says to open a Molden file the program wrote. Its lists'
  rows promise each orbital's surface and the densities' (`orbital:<spin>:
  <index>`, `density:total`, `density:spin`); asked for, it works the grid
  out from the file sent again: 4 Å past the atoms, points 0.2 Å apart (at
  most 90 to a side), the basis functions' values a chunk of points at a
  time. Its tests (`scripts/calc/test_reader_pyscf.py`) run by hand in an
  environment made from its lock.
- Meno's own reading under the same contract (`MENO` in the catalog,
  `lib/calc/menoReads.ts`, the one list of what it reads so) is asked as a
  plugin's worker is - the same `Reader`: what it makes of a file, and a
  promise it gave - but runs in the app, in a web worker of its own
  (`lib/calc/builtin.ts`, `builtinWorker.ts`, which reads that list): always
  there, nothing downloaded. It reads every file Meno reads but its own
  workspace and record, which are Meno's core's (docs/FILE-IO.md, step 4):
  - MOL, SD, RXN, XYZ and PDB files (`lib/io/structures.ts`): what each holds -
    the drawing, laid out, a reaction's arrow and "+" signs, and the
    molecules in 3D with their frames and energies - as `structures` in its
    answer. The page checks it (`checkedStructures`) as it would a plugin's.
  - The cube (`lib/calc/cube.ts`), from the layout Gaussian's documentation
    gives: a cube's molecule, in ångströms, and its grids as a list, each a
    promise, shown as it comes (a list's `shown`, opened by `shownLists` as
    a file is opened).

  Its answers come back with their runs of numbers - frames, atoms'
  coordinates - in buffers handed over, not copied (`lib/calc/packed.ts`),
  as measured (docs/FILE-IO.md, *Response*). Where there is no worker - the
  tests - it answers in place, carried the same way. The worker has the
  label typefaces' ASCII tables only, not those the page reads from font
  files: an RXN file's reaction laid out round a label of other letters is
  spaced by a capital's box for them.
- Promises (stage 3d): a row's motion or surface may be `{ "ask": key }`.
  Chosen, it is asked for of the reader that gave it (`lib/calc/asks.ts`
  `askFor`), the output's text and kind sent again - each opened output is
  kept for the session by its SHA-256, which the molecule keeps, with its
  name and kind, as its `source` -
  and kept once given; a promise whose output is not open says to open it
  again. A workspace saves the shown row's promise given, as what it came
  to (`calcShowing`, from `carriedOf`), and the open list - its row and its
  surface's value - with the molecule (`Carried3D.list`).
- Surfaces (stage 3d): a grid (`lib/calc/results.ts` `Grid`) is an origin,
  three axes and counts in ångströms, and its values as little-endian
  32-bit floats in base 64; `signed`, drawn at the value and at its
  negative. `Surface3D`, in its molecule, asks the surfaces' worker
  (`utils/surfaces.ts`, `surfaceWorker.ts`) for the surface at the value:
  marching cubes over axes that may lean (`utils/isosurface.ts`, three.js's
  tables), each point's normal down the values' slope; the grid sent once,
  the value as often as it changes, one at a time, the last value asked
  for winning. Placed about the shown frame's centre, as the atoms are; in
  the 3D style's two colours (`surfacePlus`, `surfaceMinus`; at first a
  muted blue and orange), seen through, fading in and out. The value is
  set by a slider under the list (from 0.0001 to 0.5, by its logarithm),
  kept in `lists3d` as `iso`.

On the 2D canvas (`StructureEditor/chem/`), `analyse` feeds the marks -
valence problems, R/S and E/Z - which `ChemMarks2D` lays over the drawing
as HTML, outside the drawing and so outside any export; they run only
while RDKit is set up (`pyEnvReady`), so drawing never starts a download.
`analyse` makes sense of each fragment on its own only where something is
wrong somewhere; otherwise of the whole at once, which comes out the same:
RDKit takes fragments out of a molecule by removing atoms one at a time,
and for a thousand records that ran on for most of an hour.
`clean` lays each fragment out afresh and then over the drawing - turned,
turned over, and its chains turned over their single bonds, whichever
lies closest - keeping the drawn wedges when they still say the same
stereochemistry and otherwise giving RDKit's; the editor applies it as one
undo step.

A drawn structure made in 3D (`StructureEditor/chem/make3d.ts`, stage 2 of
docs/WORKSPACE.md): `open_stereo` says what its drawing leaves open, which
Meno asks about first; `conformers` makes each stereoisomer asked for
(ETKDG, then MMFF94 or UFF, on every core; the same shape twice kept once;
lowest first, each laid over the first, with every centre's CIP label; of
two enantiomers, the one whose SMILES comes first is made and the other is
its mirror image). Both take `like`, a molecule in 3D made before from the
drawing - where it has the block's atoms - so that what the drawing leaves
open is made as it was (*Make again*). The molecule in 3D that comes of it
keeps which drawing atom each of its atoms is and what the drawing was (`drawnFrom`, `drawnAs`;
`utils/drawnLink`), so that hover is shared and a changed drawing is seen.
`drawing_of` goes the other way: a molecule in 3D's heavy atoms in their
order, wedged as they are in 3D, its bonds' orders found where a file of
coordinates gave none, for Meno's engine to draw. These take as long as
they take (`CONFORMERS_MS`, five minutes at most).

The venv lives under the app data dir at `uv/<profile>/venv`; a stamp file
(`uv/stamps/<profile>.json`) stores the lock-file hash so setup reruns only when
the lock or Python version changes. uv runs with its Python downloads
(`uv/python`) and cache (`uv/cache`) under the app data dir too, only
uv-managed Pythons, and no user uv configuration (`uv_command` in `lib.rs`):
nothing of Meno's environments lands in the user's own directories.

### Tauri commands

| Command | Called from | Purpose |
| --- | --- | --- |
| `py_env_python_path_uv` | `lib/pyEnv.ts` | Resolve the venv's Python path under app data. |
| `py_env_setup_uv` | `lib/pyEnv.ts` | Create the venv and install the lock file with `uv`. |
| `ext_spawn_sidecar` | `PyConsole` | Spawn a process with piped stdio; returns an id. |
| `ext_stdin` | `PyConsole` | Write to a sidecar's stdin. |
| `ext_kill` | `PyConsole` | Kill a sidecar and emit `ext:exit`. |
| `font_families` | `ui/fonts/typefaces.ts` | Every typeface installed (fontdb), for the label typeface picker. |
| `font_file` | `ui/fonts/typefaces.ts` | One family's regular face as a font file of its own - out of its collection, its character map made plain (`fonts.rs`). |
| `net_state` | `lib/net/network.ts` | Offline or not, what is allowed, tasks under way, recent connections. |
| `net_set_offline`, `net_grant`, `net_revoke` | `lib/net/network.ts` | Offline mode; a purpose's leave to use the network, given or withdrawn. |
| `net_note_blocked` | `lib/net/network.ts` | Records a connection the window was kept from making. |
| `update_state`, `update_check`, `update_restart_after_quit` | `lib/update.ts` | Where keeping Meno up to date is; a look (and download) through the proxy; a restart into the update downloaded. |
| `job_start` | `lib/jobs.ts` | A job's folder made, its input written, its runner started; returns its id. |
| `job_state`, `jobs_list` | `lib/jobs.ts` | A job's record, or every job's - *gone* where its runner went without saying how it ended. |
| `job_log`, `job_files`, `job_read`, `job_folder` | `lib/jobs.ts` | A job's log from a byte on; the files in its folder, one read; where they are. |
| `job_stop`, `job_remove`, `jobs_clear_finished` | `lib/jobs.ts` | A job asked to stop; a finished job's folder taken away, or every finished one's. |
| `greet` | — | Template leftover, unused. |

Events: `uv:log`, `uv:err` (plain strings); `ext:stdout`, `ext:stderr`,
`ext:exit` (JSON strings `{ id, line? }`). `ext:exit` is emitted exactly once
per sidecar, whether it exits by itself or through `ext_kill`. `net:task` and
`net:connection` carry the network's record (see below); `update:state`, where
keeping Meno up to date is.

The tools that make the environments - uv, and pixi for those that need
conda-forge - are not bundled (docs/WORKSPACE.md, stage 3d): `tools.rs`
pins each one's version and its archive's SHA-256 for every computer Meno is
built for, and fetches it the first time an environment needs it - through
that environment's network task, under its consent - checks the archive
against the hash, and keeps the program in `<data>/tools/<tool>/<version>/`,
taking away a version no longer pinned. uv comes from Astral's host
(releases.astral.sh), as the Pythons it installs do; pixi from its releases
on GitHub. A new pin is a change to `tools.rs`, its hashes the release's
own, checked against the archives (`cargo test -- --ignored` fetches and
runs both for the computer it runs on).

An environment pixi makes (`pixienv.rs`, `py_env_setup_pixi`) comes from the
manifest and the lock in a plugin's folder, `resources/plugins/<id>/pixi.toml`
and `pixi.lock` - every package for every platform pinned by its SHA-256 -
copied into `<data>/pixi/plugin-<id>/`, where `pixi install --frozen` makes it
(`.pixi/envs/default`). pixi keeps its cache and home under `<data>/pixi/`
and reads no configuration of the user's (`PIXI_NO_CONFIG`). A conda
environment expects to be activated - on Windows its libraries are found
only on the PATH activation sets - so what activation sets is asked of
pixi once, as the environment is made (`shell-hook --json`, a mark put
before the PATH), and kept beside it (`activation.json`): a worker
started in it (`ext_spawn_sidecar`, which takes an interpreter of
`<data>/uv` or `<data>/pixi`) is given the variables, and the folders before
its PATH. The consent says what the lock downloads on the computer - its
packages, and their size (`lib/pixiLock.ts`) - and from where: pixi, the
first time, from GitHub; conda-forge (conda.anaconda.org); PyPI. A reader
plugin says it is made so by `env: "pixi"`; its record of being set up is
`pixi/stamps/<profile>.json`, and taking it away removes `pixi/<profile>` -
and, with the last environment pixi made, its cache and home, which nothing
else uses (pixi itself stays, in `tools/`).

### What the backend accepts

The webview is not trusted with process execution, so `lib.rs` validates every
path it is given:

- `py_env_*`: the webview names no tool - uv is the one `tools.rs` pins;
  `lockPath` must be a `.lock` file under `resources/py/`, or in a plugin's
  folder, `resources/plugins/<id>/` - for pixi, that folder's `pixi.lock`,
  made in `<app data>/pixi/plugin-<id>`; `venvHome` must be under `uv/` in the
  app data dir; relative paths may not contain `..`, `.` or absolute/drive
  prefixes; `pythonVersion` must look like `3.12` or `3.12.4`; `purpose` must
  be `python-env:<name>` - never a purpose that needs no asking.
- `ext_spawn_sidecar`: `entry` must be an absolute `python`/`python3`/`python.exe`
  inside `<app data>/uv/` or `<app data>/pixi/`; `args` may start with `-u` / `-B`, followed by an
  absolute `.py` script inside `resources/workers/` or `resources/plugins/`; later arguments go to the
  script unchanged.
- A sidecar running the console's worker is a `python-code` task on the
  network; any other worker is pointed at the proxy with no task, so what it
  reaches for is refused and on the record.
- `job_start`: the webview names a plugin and a program, not a path. The
  program must be one the plugin's manifest names (`steps[].programs`),
  never a shell or an interpreter that takes code in its arguments, found
  in that plugin's environment only - the folders its activation puts on
  the PATH (pixi), or its venv's `bin`/`Scripts` (uv) - and, where it is
  Python, with the rules of `ext_spawn_sidecar`, a script in the plugin's
  folder. Its input files must lie inside its folder; it is given its
  environment's activation, and is pointed at the proxy with no task, as
  a worker is. A job's id must be one of Meno's (a UUID) whose folder holds
  a `job.json`; a file read from it must lie inside it.
- A lock with hashes (`--hash=`) is installed with `--require-hashes`.
- Sidecars are reaped when their stdout closes or on `ext_kill`, and all of
  them are killed when the app exits.

Adding a new worker or interpreter flag means extending these rules
(`PYTHON_FLAGS`, the workers directory) together with the unit tests in
`lib.rs`.

Files the chemist's own: the webview's file scope (`capabilities/main.json`)
reaches only the app's data and resources. A file is written elsewhere only
where the system's save dialog was answered - Save, Save As, Export - since
the dialog plugin adds the path it gives back to the file scope, for that
path alone and for the session; nothing else outside the app's own folders
can be written.

## The network

Every connection Meno makes is seen, recorded and answerable for. It is a
research tool: what it sends out, and when, has to be knowable, and it has
to be able to work with nothing going out at all.

- **The window reaches nothing.** Its content security policy
  (`tauri.conf.json`) keeps it to the app: fonts, workers and pictures come
  from the app or from blobs it made. Anything it is kept from reaching is
  put on the record (`securitypolicyviolation`), and so are characters no
  font of Meno's has, which the canvas's text renderer would otherwise look
  for on its CDN.
- **Everything else goes through the app's proxy** (`src-tauri/src/net.rs`),
  on the loopback address. A child process that may use the network - uv
  setting up Python, a Python sidecar - is begun as a *task* with a
  *purpose* (`python-env:console`, `python-code`) and pointed at the proxy
  with the task's token in its proxy credentials. The proxy carries a
  connection only for a task under way, only for a purpose the user has
  allowed (`python-code`, the user's own code, needs no asking), only over
  HTTPS, and never in offline mode. Each connection - host, bytes each way,
  times, outcome - goes to the window as it happens (`net:connection`, every
  half second while open) and to `network-log.jsonl` in the app's data
  folder when it ends. A child that may not use the network - another
  worker, or the console while Meno is offline - is pointed at the proxy
  with no task, so whatever it reaches for is refused and on the record.
  The proxy is bound, and offline mode and the purposes allowed are read
  from the saved settings, as the app starts: before the window has loaded,
  nothing can be started that would go out on its own.
- **The proxy holds what honours proxy variables** - uv, pip, Python's
  `urllib`, `requests`. Code in the console that opens a socket of its own,
  or ignores those variables, is not held by it: Meno does not sandbox the
  console.
- **The window asks and shows** (`lib/net/network.ts`, `ui/network/`): a
  purpose's first use of the network waits on the user's yes
  (`askToConnect`, remembered in the settings until withdrawn); each task
  has a card in the corner while it runs; the top bar switches offline mode;
  Settings › Network holds the allowed purposes and the record.

- **Meno keeping itself up to date** (`src-tauri/src/update.rs`,
  `lib/update.ts`) is such a task, of its own: its requests - latest.json
  on the project's GitHub Releases, then the update itself - are the
  app's own (tauri-plugin-updater), sent through the proxy with the task's
  token (`TaskHandle::proxy_url`). Its purpose, `app-update`, is asked for
  once of Meno's own accord (remembered as `updates.asked` in the settings)
  and after that only when the user turns it on in Settings › Network. The
  update is checked against the updater's public key (`tauri.conf.json`)
  before it is installed, which is as Meno quits; a development build, and
  a Meno Windows started for Office, neither look nor install. On Windows
  the installer is left in a folder of the temporary directory
  (`Meno-<version>-updater-…`), which Meno takes away as it starts once it
  is some minutes old (`tidy_after_updates`). Releases:
  `docs/RELEASING.md`.

Anything new that needs the network begins a task in `net.rs` and routes
its process, or its own requests, through the proxy; nothing may reach the
network another way.

## File format support

Every way into Meno and out of it - files, the clipboard, Office - and
who reads and writes each kind: [`FILE-IO.md`](./FILE-IO.md); what plugins
do beyond files, and which are kept running: [`PLUGINS.md`](./PLUGINS.md).

The kinds, as the table of kinds has them (`lib/io/kinds.ts`, `MENO_KINDS`),
with the kinds Meno writes (`lib/io/writers.ts`, `WRITERS`) and those the
plugins Meno carries bring and write (their manifests,
`src-tauri/resources/plugins/*/manifest.json`). A plugin's kinds are
registered only while it is added. `src/lib/io/architecture.test.ts` checks
that every kind of these is in this table, by its id, and no other.

| Kind | Id | Files | Told by | Read by | Written by | Becomes |
| --- | --- | --- | --- | --- | --- | --- |
| Meno workspace | `meno-workspace` | `.meno` | a zip whose first entry is its mimetype (`isMenoFile`) | Meno's core (`readMenoFile`, `readWorkspace`) | Save, Save As (`menoFileWorker.ts`) | the workspace, outputs it keeps held for the session |
| Meno structure | `meno-record` | none: the clipboard, a picture, an Office object | its JSON's `format` | Meno's core (`readRecord`) | Copy, Office | pasted |
| RXN file | `rxn` | `.rxn` | `$RXN` | Meno, in its worker (`readStructures`) | Export (`reactionFileText`), Copy | a drawing with its arrow and "+" signs |
| MOL file | `mol` | `.mol` | `V2000` / `V3000`, `M  END` | Meno, in its worker | Export, Copy (`molWriter.ts`) | a drawing; a molecule in 3D where it says it is 3D or spreads in depth |
| SD file | `sdf` | `.sdf` | the same, and its name | Meno, in its worker | Export: the drawing as one record, each molecule in 3D as one, or each frame | a drawing, and each 3D record a molecule in 3D beside it |
| XYZ file | `xyz` | `.xyz` | its layout: an atom count, a comment, atoms | Meno, in its worker | never | a molecule in 3D, its frames and their energies (`utils/xyzEnergies.ts`); bonds from covalent radii (`bondsByDistance`), frame by frame - forming and breaking as the frames go (`frameBondsOf`) |
| PDB file | `pdb` | `.pdb` | its records (`RECORD_NAMES`), an atom's coordinates in their columns | Meno, in its worker (`lib/chem/pdb.ts`) | Export: molecules in 3D as HETATM and CONECT records, a MODEL for each frame where asked | a molecule in 3D: every atom, MODELs as frames, bonds from CONECT and distances (FILE-IO.md, *As step 7 was built*) |
| Cube file | `cube` | `.cube`, `.cub` | its layout (`CUBE_MARK`) | Meno, under the readers' contract, in its worker (`lib/calc/cube.ts`) | never | a molecule in 3D, its grids promises drawn as surfaces |
| SVG picture | `svg` | `.svg` | - | never | Export (`drawingSvg`) | - |
| Calculation programs' outputs (cclib's) | `adf`, `cfour`, `dalton`, `gamess`, `gamess-uk`, `gaussian`, `gaussian-fchk`, `jaguar`, `molcas`, `molpro`, `mopac`, `nwchem`, `orca`, `psi4`, `qchem`, `turbomole`, `xtb` | each its own: `.out`, `.log`, `.fchk`... | each program's banner, as cclib's manifest brings it | cclib (plugin, uv); `orca`, `gaussian` and `gaussian-fchk` also PySCF | never | a molecule in 3D, each geometry a frame - its bonds by distance, frame by frame - and what the calculation found |
| Molden file | `molden` | `.molden`, `.mld` | `[Molden Format]`, as PySCF's manifest brings it | PySCF (plugin, pixi) | never | a molecule in 3D, its orbitals and densities promises |
| Gaussian input | `gaussian-input` | `.gjf`, `.com` | - | never | Export, by the Gaussian input plugin (uv, Python alone) | - |
| KET | - | `.ket` | - | not read | never | Open does not offer it; one dropped says "not supported yet" |
| Text | - | anything not told otherwise | its name, or nothing else telling it; dropped, no NUL in its start (`opensAsText`) | the workspace, as it is | Export, from the column of texts (`TextColumn.tsx`) | a text the workspace holds, in its column; saved in `.meno` |

## Verification commands

See the README "Development" section. In short: `npm run typecheck`,
`npm run lint`, `npm test`, `npm run build` for the frontend, and
`cargo check` / `cargo clippy` / `cargo test` in `src-tauri/`.
