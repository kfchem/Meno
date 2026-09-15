# Meno architecture

This document describes how Meno is put together today (pre-alpha). It is meant
as a map for contributors: where things live, which layer owns what, and how the
pieces talk to each other. For open problems and planned work see
[`AUDIT-2026-09.md`](./AUDIT-2026-09.md).

## Layers and responsibilities

| Layer | Location | Owns |
| --- | --- | --- |
| Tauri shell (Rust) | `src-tauri/src/lib.rs` | Window, plugins (`fs`, `os`, `opener`), and the only code that spawns OS processes: the bundled `uv` binary and the Python sidecar. No chemistry logic lives here. |
| App shell (React) | `src/App.tsx`, `src/lib/core/`, `src/ui/layouts/`, `src/ui/views/` | Tab model (open/close/reorder/rename), mapping a tab's `kind` to a view component. |
| Features (React) | `src/ui/features/*` | One folder per view: 2D structure editor, 3D molecule viewer, workflow editor, Python console, text editor, file loader, settings. |
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
  lib/chem/               acs.ts (ACS 1996 style ratios), layout2d.ts (2D depiction primitives)
  lib/pyEnv.ts            creates/validates the uv venv for a Python profile
  utils/structureParsers  parseSDF (V2000/V3000), parseXYZ (multi-frame, distance-based bonds)
  utils/importers         detectFormat, readMoleculesFromText, RXN grouping/layout, EditorModel conversion
  utils/atomUtils         element table (radii, colours)
  ui/layouts/TopBar       custom title bar: tabs, "New…" menu, window buttons
  ui/views/registry       TabKind -> { Component, create } table
  ui/views/Deck           renders every open tab, hides inactive ones with CSS
  ui/features/
    OmniHub/              "Open file / drop a file" start page; routes a file to a view
    StructureEditor/      2D editor (see below)
    MoleculeViewer/       3D ball-and-stick / CPK viewer with measurements and frame slider
    WorkflowEditor/       React Flow graph (prototype, not executable yet)
    PythonConsole/        UI for the Python sidecar
    TextEditor/           plain textarea with line numbers
    SettingsPanel/        placeholder
src-tauri/
  src/lib.rs              Tauri commands (see table below)
  capabilities/           permission sets for the main window
  resources/py/           uv.exe and requirements lock files per profile
  resources/workers/      Python worker scripts
```

## Tabs and views

`src/lib/core` holds a small reducer (`ADD_TAB`, `CLOSE_TAB`, `SELECT_TAB`,
`REORDER`, `SET_CONTENT`, `PATCH_DATA`, `RENAME_TAB`, `SET_DIRTY`). Each tab is
`{ meta: { id, label, dirty? }, content: { kind, data? } }`.

- `tabOrder` is the visual order in the title bar; `mountOrder` is the stable
  render order so reordering tabs never remounts a WebGL canvas.
- `Deck` renders **all** open tabs and hides the inactive ones; views receive an
  `active` flag and are expected to pause expensive work (e.g. set the R3F
  `frameloop` to `"never"`) while inactive.
- A new tab starts as `loader` (OmniHub). When a file is chosen, OmniHub calls
  `replaceContent({ kind, ...data, filename })` and the tab switches view.

## 2D structure editor (`ui/features/StructureEditor`)

- **State**: a Zustand store per canvas instance (`store/index.tsx`), composed
  from slices: `modelSlice` (atoms, bonds, arrows), `selectionSlice`,
  `hoverSlice`, `interactionSlice` (drag/extend/pan), `uiSlice` (label editing,
  aromatic circles, fit requests). `EditorProvider` creates the store;
  components read it with `useEditor(selector)`.
- **Rendering**: an orthographic react-three-fiber `<Canvas>`; each visual layer
  is its own component in `components/` (`Bonds2D`, `Atoms2D`, `Wedges2D`,
  `Labels2D`, previews, hover overlays, `PanZoom2D`, `FitToContent2D`, …).
- **Depiction**: `lib/chem/layout2d.ts` turns atoms/bonds into line segments,
  polygons, text and circles; `lib/chem/acs.ts` provides ACS-style proportions
  scaled to `NOMINAL_BOND_LENGTH` world units.
- **Import**: `utils/io.ts#processFileContent` → `utils/importers.ts`.

## 3D molecule viewer (`ui/features/MoleculeViewer`)

Perspective R3F canvas with trackball controls. Input is `Molecule[]` (frames of
one file) or `Molecule[][]` (several files, shown with an energy ladder). Atom
picking supports 2–4 atom distance/angle/dihedral measurements.

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

The venv lives under the app data dir at `uv/<profile>/venv`; a stamp file
(`uv/stamps/<profile>.json`) stores the lock-file hash so setup reruns only when
the lock or Python version changes.

### Tauri commands

| Command | Called from | Purpose |
| --- | --- | --- |
| `py_env_python_path_uv` | `lib/pyEnv.ts` | Resolve the venv's Python path under app data. |
| `py_env_setup_uv` | `lib/pyEnv.ts` | Create the venv and install the lock file with `uv`. |
| `ext_spawn_sidecar` | `PyConsole` | Spawn a process with piped stdio; returns an id. |
| `ext_stdin` | `PyConsole` | Write to a sidecar's stdin. |
| `ext_kill` | `PyConsole` | Kill a sidecar and emit `ext:exit`. |
| `greet` | — | Template leftover, unused. |

Events: `uv:log`, `uv:err` (plain strings); `ext:stdout`, `ext:stderr`,
`ext:exit` (JSON strings `{ id, line? }`). `ext:exit` is emitted exactly once
per sidecar, whether it exits by itself or through `ext_kill`.

### What the backend accepts

The webview is not trusted with process execution, so `lib.rs` validates every
path it is given:

- `py_env_*`: `uv` must be the bundled `resources/py/uv[.exe]`; `lockPath` must
  be a `.lock` file under `resources/py/`; `venvHome` must be under `uv/` in the
  app data dir; relative paths may not contain `..`, `.` or absolute/drive
  prefixes; `pythonVersion` must look like `3.12` or `3.12.4`.
- `ext_spawn_sidecar`: `entry` must be an absolute `python`/`python3`/`python.exe`
  inside `<app data>/uv/`; `args` may start with `-u` / `-B`, followed by an
  absolute `.py` script inside `resources/workers/`; later arguments go to the
  script unchanged.
- Sidecars are reaped when their stdout closes or on `ext_kill`, and all of
  them are killed when the app exits.

Adding a new worker or interpreter flag means extending these rules
(`PYTHON_FLAGS`, the workers directory) together with the unit tests in
`lib.rs`.

## File format support

| Format | Where it opens | Parser | Notes |
| --- | --- | --- | --- |
| MOL (V2000/V3000) | 2D editor | `parseSDF` | Stereo codes 1/6/4 → up/down/wavy. |
| SDF | 2D editor | `parseSDF` | All records merged into one canvas. |
| RXN (V2000) | 2D editor | `parseRXNGroups` + `buildEditorModelFromRXN` | Reactants → arrow → products, agents above the arrow. |
| XYZ (multi-frame) | 3D viewer | `parseXYZ` | Bonds inferred from covalent radii. |
| PDB, KET | — | none | Accepted by the file picker but not parsed yet. |
| Text files | Text editor | — | By extension, or anything that is not recognised. |

## Verification commands

See the README "Development" section. In short: `npm run typecheck`,
`npm run lint`, `npm test`, `npm run build` for the frontend, and
`cargo check` / `cargo clippy` / `cargo test` in `src-tauri/`.
