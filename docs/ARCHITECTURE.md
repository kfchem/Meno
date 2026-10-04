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
| Features (React) | `src/ui/features/*` | One folder per view: the structure canvas (2D drawing and molecules in 3D), workflow editor, Python console, text editor, settings. |
| Chemistry helpers (TS) | `src/lib/chem/`, `src/utils/` | File parsing (MOL/SDF/RXN/XYZ), editor model conversion, 2D depiction layout (bond lines, wedges, labels) and ACS-style sizing. Pure functions — no React, no Tauri. |
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
                          SDfiles and Rxnfiles read as CTfile Formats has them: docs/CTFILE.md)
  lib/net/                network.ts: the network's record, consent, offline mode
  lib/settings/           appSettings.ts: the app's settings and their file
  lib/input/              wheel.ts: a mouse wheel told from two fingers on a trackpad
  lib/pyEnv.ts            creates/validates the uv venv for a Python profile
  lib/rdkit/              the chemistry worker: client, sidecar, the MOL blocks it is asked about
  lib/calc/               readers of calculation programs' output (to be plugins): energies, for now
  utils/structureParsers  parseSDF (V2000/V3000), parseXYZ (multi-frame, distance-based bonds)
  utils/importers         detectFormat, readMoleculesFromText, RXN grouping/layout, EditorModel conversion
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
    WorkflowEditor/       React Flow graph (prototype, not executable yet)
    PythonConsole/        UI for the Python sidecar
    TextEditor/           plain textarea with line numbers
    StyleEditor/          every drawing setting, with a preview
    SettingsPanel/        Settings: drawing style, chemistry, network
src-tauri/
  src/lib.rs              Tauri commands (see table below)
  src/fonts.rs            the system's typefaces
  src/net.rs              the network: tasks, the proxy, the record
  capabilities/           permission sets for the main window
  resources/py/           uv (macOS, Apple silicon) and uv.exe (Windows), uv
                          0.12.19, and requirements lock files per profile;
                          tauri.<platform>.conf.json bundles only that
                          platform's uv
  resources/workers/      Python worker scripts
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
  dialog and opens each in a tab of its own, by what it is
  (`ui/views/openFile`): in place of the tab in front if that is a canvas
  nothing is drawn on (`REPLACE_TAB`). A structure from an Office document
  opens the same way.
- **Closing the last tab quits Meno.**
- **Commands.** The canvas carries nothing but the drawing. Every command
  is in Meno's menu, which its logo opens, with its key; the app's own
  (Open…) and those the tab in front offers through `offerCommands`
  (`ui/layouts/commands.ts`), asked for as the menu opens. A structure
  canvas offers Save, Save As, Export as SVG, SMILES, Clean up all, Fit to
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

Adoption is incremental. The text view and the structure canvas, with its
molecules in 3D, are on documents; the workflow editor still keeps its
content in component state, and it is still lost when its tab closes.

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
  drawing and so starts as gently as it ends (`EASE_SLIDE`) - `TAU` for
  following a moving target, the spring, and motion's `FADE` and `RISE`.
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
  seen head-on by a perspective camera (`PageCamera`): it stands 60 world
  units off and sets its field of view from the canvas height, so that
  `camera.zoom` means what an orthographic camera's would - CSS pixels per
  world unit on the page - and the drawing comes out exactly as it would
  orthographically. What stands off the page is seen in depth. A point of
  the screen is taken to the page with `utils/page.ts#pageAt`, never by
  unprojecting alone. Page layers keep to the page (z within a few
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
- **Import**: `utils/io.ts#processFileContent` → `utils/importers.ts`.
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

## Workflow editor (`ui/features/WorkflowEditor`)

A React Flow canvas with a fixed demo pipeline (2D sketch → RDKit conformers →
filter → ORCA → filter → Gaussian → select → 3D). Node parameters are local
state only; nothing is executed yet.

## Python console and sidecar

```
PyConsole ──ensurePyEnv(profile)──▶ py_env_python_path_uv / py_env_setup_uv (Rust)
          │                          └─ runs resources/py/uv[.exe]: `uv venv`, `uv pip install -r <lock>`
          │                             stdout/stderr → events uv:log / uv:err
          └─ext_spawn_sidecar({ entry: <venv python>, args: ["-u", <worker.py>] }) → id
             ext_stdin(id, JSON line) ─▶ worker ─▶ events ext:stdout / ext:stderr / ext:exit
             ext_kill(id)
```

The chemistry worker (`resources/workers/chem_worker.py`) is a sidecar of
the `chem` profile, started by `lib/rdkit/worker.ts` and asked through
`lib/rdkit/client.ts`: JSON lines, a fixed set of requests (ping,
to_smiles, from_smiles, clean, analyse, and for 3D open_stereo,
conformers and drawing_of), MOL blocks in (written by
`lib/rdkit/molblock.ts`, a label that is not an element as `*`) and V3000
blocks or coordinates out. It runs no code it is sent, and the app keeps it
off the network. Its tests need RDKit and run by hand
(`scripts/chem/test_chem_worker.py`).

On the 2D canvas (`StructureEditor/chem/`), `analyse` feeds the marks -
valence problems, R/S and E/Z - which `ChemMarks2D` lays over the drawing
as HTML, outside the drawing and so outside any export; they run only
while RDKit is set up (`pyEnvReady`), so drawing never starts a download.
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
| `greet` | — | Template leftover, unused. |

Events: `uv:log`, `uv:err` (plain strings); `ext:stdout`, `ext:stderr`,
`ext:exit` (JSON strings `{ id, line? }`). `ext:exit` is emitted exactly once
per sidecar, whether it exits by itself or through `ext_kill`. `net:task` and
`net:connection` carry the network's record (see below); `update:state`, where
keeping Meno up to date is.

### What the backend accepts

The webview is not trusted with process execution, so `lib.rs` validates every
path it is given:

- `py_env_*`: `uv` must be the bundled `resources/py/uv[.exe]`; `lockPath` must
  be a `.lock` file under `resources/py/`; `venvHome` must be under `uv/` in the
  app data dir; relative paths may not contain `..`, `.` or absolute/drive
  prefixes; `pythonVersion` must look like `3.12` or `3.12.4`; `purpose` must
  be `python-env:<name>` - never a purpose that needs no asking.
- `ext_spawn_sidecar`: `entry` must be an absolute `python`/`python3`/`python.exe`
  inside `<app data>/uv/`; `args` may start with `-u` / `-B`, followed by an
  absolute `.py` script inside `resources/workers/`; later arguments go to the
  script unchanged.
- A sidecar running the console's worker is a `python-code` task on the
  network; any other worker is pointed at the proxy with no task, so what it
  reaches for is refused and on the record.
- A lock with hashes (`--hash=`) is installed with `--require-hashes`.
- Sidecars are reaped when their stdout closes or on `ext_kill`, and all of
  them are killed when the app exits.

Adding a new worker or interpreter flag means extending these rules
(`PYTHON_FLAGS`, the workers directory) together with the unit tests in
`lib.rs`.

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

| Format | Where it opens | Parser | Notes |
| --- | --- | --- | --- |
| MOL (V2000/V3000) | Structure canvas | `parseSDF` | Stereo codes 1/6/4 → up/down/wavy. A molfile that says it is 3D, or whose atoms spread in depth, stands in 3D. |
| SDF | Structure canvas | `parseSDF` | Flat records merged into one drawing; 3D records each a molecule in 3D beside it. Saved, each molecule in 3D is a 3D record. |
| RXN (V2000) | Structure canvas | `parseRXNGroups` + `buildEditorModelFromRXN` | Reactants → arrow → products, agents above the arrow. |
| XYZ (multi-frame) | Structure canvas, in 3D | `parseXYZ` | Bonds inferred from covalent radii. Frames kept; each frame's energy where a calculation reader (`lib/calc`) finds one on its comment line. |
| Meno workspace (`.meno`) | Structure canvas | `readWorkspace` | Everything on the canvas, as it was saved. |
| PDB, KET | — | none | Accepted by the file picker; the 2D editor reports "not supported yet". |
| Text files | Text editor | — | By extension, or anything that is not recognised. |

## Verification commands

See the README "Development" section. In short: `npm run typecheck`,
`npm run lint`, `npm test`, `npm run build` for the frontend, and
`cargo check` / `cargo clippy` / `cargo test` in `src-tauri/`.
