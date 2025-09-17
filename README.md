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

## License

This repository is licensed under the **Apache License 2.0**. See [`LICENSE`](./LICENSE).

## Acknowledgments

Thanks to all contributors and users who provided feedback and ideas from related communities.
