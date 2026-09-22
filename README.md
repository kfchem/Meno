# Meno

A lightweight, cross‑platform desktop app for chemical structure editing and viewing with a prototype workflow canvas. Built with Tauri v2 (Rust) and React/TypeScript.

— Status: Pre‑alpha. Interfaces and file formats may change without notice.

## Features

- 2D Structure Editor (subset, work in progress)
- 3D Molecule Viewer (ball‑and‑stick/CPK, basic measurements)
- Experimental Workflow/Graph Editor (early node set)
- Strict TypeScript + Vite + Tailwind v4
- Desktop app via Tauri v2

## Architecture (at a glance)

- App shell: Tauri v2 (Rust)
- UI: React + TypeScript
- Graphics: react‑three‑fiber / Three.js
- State and core types: `src/lib/core/`

## Development

Prerequisites:

- [Node.js](https://nodejs.org/) 20+ and npm
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain) for the Tauri backend
- Platform build tools required by Tauri v2 — see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

Setup and common commands:

```bash
npm install          # install frontend dependencies
npm run dev          # run the Vite dev server only (frontend, in a browser)
npm run tauri dev    # run the full desktop app (Rust + WebView)
npm run typecheck    # TypeScript typecheck only
npm run lint         # ESLint
npm test             # Vitest unit tests (parsers, tab reducer, editor store)
npm run check:tauri  # Tauri crate/npm versions must match (tauri build fails otherwise)
npm run build        # tsc typecheck + production frontend build
npm run tauri build  # produce a desktop app bundle
```

Unit tests live next to the code as `*.test.ts(x)` and run in Node; they cover
pure logic only, so GUI changes still need a manual check in `npm run tauri dev`.

Rust-side checks (run from `src-tauri/`):

```bash
cargo check   # typecheck the Tauri backend
cargo clippy  # lint the Tauri backend
cargo test    # run Rust tests
```

On Windows, compiling the Rust side also needs the MSVC build tools
("Desktop development with C++" in Visual Studio Build Tools).

CI (`.github/workflows/ci.yml`) runs all of the above on every pull request:
typecheck, lint, tests and build on Ubuntu, and `cargo check` / `clippy` /
`test` on Windows.

Further reading: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) (how the app
is structured, Tauri commands, supported file formats) and
[`docs/AUDIT-2026-09.md`](./docs/AUDIT-2026-09.md) (known issues and backlog).

Known limitations (pre-alpha):

- The embedded Python Console/Workflow sidecar (`src/lib/pyEnv.ts`, the `py_env_setup_uv` / `ext_spawn_sidecar` Tauri commands) depends on a bundled `uv` binary at `src-tauri/resources/py/`. Only the Windows binary (`uv.exe`) is currently checked in, so this feature does not work on macOS/Linux builds yet.
- Unit tests cover parsing and state logic only; there are no rendering or end-to-end tests yet.

## License

This repository is licensed under the **Apache License 2.0**. See [`LICENSE`](./LICENSE).

## Acknowledgments

Thanks to all contributors and users who provided feedback and ideas from related communities.
