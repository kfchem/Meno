# File input and output

What comes into Meno and what goes out of it - files, the clipboard,
Office - and where a *reader* stands among them. Written on 2026-10-06 at
the maintainer's request ("整理して、reader の位置づけを明確化"), from main
at #147 with the PySCF reader of #148. The first half is how things are;
the second is a proposal, its decisions the maintainer's.

## Words

- **Kind** - what a piece of data is: a molfile, an ORCA output, a cube
  file, a Meno record on the clipboard. Told by what it holds; a file's
  name is a hint.
- **Structure format** - a program-independent description of molecules
  or a drawing: MOL, SDF, RXN, XYZ, SMILES, and Meno's own (`.meno`, the
  record). Meno reads these itself.
- **Calculation output** - what a program wrote about a calculation:
  ORCA, Gaussian and xTB output, Gaussian's formatted checkpoint, Molden
  and cube files. Meno only reads these, through readers.
- **Reader** - what reads a kind of calculation output for Meno, under
  one contract (below).
- **Plugin** - a reader that is downloaded into an environment of its own
  and can be added and taken away (cclib; PySCF in #148).
- **Built-in reader** - a reader that comes with Meno, under the same
  contract (cube).
- **Writer** - what writes a kind. Only Meno writes; no plugin does.

## What comes in, as built

| Way in | Kind decided by | Read by, where | Becomes |
| --- | --- | --- | --- |
| **Open** (Cmd/Ctrl+O; `<input type=file>`, `App.tsx`) | `openedAs` (`ui/views/openFile.ts`) picks the tab - structure canvas or text - from the extension, `detectFormat` and `outputKindOf`; the canvas then decides again (`processFileContent`, `StructureEditor/utils/io.ts`) | see the formats below | a new tab |
| **A file dropped** on the canvas (`dropAppend`, `useStructureEvents.ts`) | the extension first (`STRUCTURE_FILE`), to know whether to look at the drag's clipboard flavours; then as Open | as Open; a `.meno` is pasted, not opened | added to the page |
| **An Office picture or object dragged** in | the drag's flavours, in order: Meno record or embedded object, Mac Office object, GVML, PNG, RXN, MOL (`fromClipboard.ts`); read by Rust (`drag_read`; on Windows an overlay window, `drop.rs`) | the record Meno put in it (EMF comment, PNG text chunk, OLE stream) | pasted |
| **Paste** (`clipboardActions.ts`) | the clipboard's flavours, in the order above, then plain text that looks like a molfile, then SMILES (`fromClipboard.ts`; Rust `clipboard_read`) | the record; CTfiles in TS; SMILES by RDKit (chem worker) | pasted |
| **Office re-edit** (Windows OLE: Word or PowerPoint opens Meno) | always a record; named `office.meno` to reach it (`App.tsx`) | `readRecord` | a tab linked to the object |
| **Calculation output**, through Open or a drop | `outputKindOf` (`lib/calc/catalog.ts`) - by content only, and only once `detectFormat` has found no structure format | every reader added that reads the kind (`readOutput`, `lib/calc/read.ts`) | a molecule in 3D with what the calculation found |
| **A promise asked for** (a list row chosen) | the result's key | the reader that gave the promise, sent the output again (`askFor`, `lib/calc/asks.ts`) | a grid, drawn as a surface |
| **`.meno`** (Open, drop) | the extension | `readWorkspace` (version 1 only); its results checked as a reader's answers are | the workspace, or pasted |
| **SMILES** typed or pasted | the panel; text that looks like SMILES | RDKit (chem worker), back as a molfile | added to the page |

### Structure formats

| Format | Read by, where | Written | Notes |
| --- | --- | --- | --- |
| MOL (V2000/V3000) | `readSDfile` (`lib/chem/ctfile.ts`) via `parseSDF`, main thread | Save, Copy (`molWriter.ts`) | 3D when it says so or spreads in depth |
| SDF | the same | Save (drawing as one record, each molecule in 3D as one) | |
| RXN (V2000/V3000) | `readRxnfile` via `buildEditorModelFromRXN` | Save, Copy | |
| XYZ, many frames | `parseXYZ` (`utils/structureParsers.ts`), main thread; bonds from covalent radii | never | each frame's energy from its comment line (`lib/calc/readers.ts`) |
| SMILES | RDKit (`chem` profile); abbreviations' SMILES by Meno's own `lib/chem/smiles.ts` | Copy as SMILES (RDKit) | |
| `.meno` | `readWorkspace` (`workspace.ts`) | Save | version 1, no migration |
| Meno record | `readRecord` (`utils/copyPaste.ts`) | Copy, Office | in the clipboard's own flavour, an EMF comment, a PNG text chunk, OLE streams |
| PDB, KET | not read | never | Open offers them and then says "not supported yet" |

### Calculation output

| Kind | Told by | Read by |
| --- | --- | --- |
| ORCA, Gaussian, xTB output; Gaussian formatted checkpoint | each program's banner (`OUTPUT_KINDS`) | cclib (plugin, uv); PySCF (plugin, pixi; not xTB) |
| Molden file | `[Molden Format]` | PySCF |
| Cube file | its layout: two comment lines, four lines of a count and three numbers (`CUBE_MARK`) | cube (built in, web worker) |

A reader is a process of its own - a Python sidecar for a plugin, a web
worker for a built-in - spoken to in JSON lines (`lib/calc/client.ts`,
`builtin.ts`). Every reader added that reads a kind reads it, and what each
finds is kept as its own (`combine`); Meno checks every answer (`checked`,
`readResults`) - the same checks a saved workspace's results go through.

## What goes out, as built

| Way out | Written by, where | Kinds | Carries |
| --- | --- | --- | --- |
| **Save, Save As** (`fileActions.ts`) | main thread, then the fs plugin | `.meno`; MOL, SDF, RXN - offered by what is on the page (3D molecules: `.meno` or SDF only) | `.meno` everything; the others the drawing, SDF each molecule in 3D at the frame shown |
| **Export as SVG** | main thread | SVG | the page as drawn; molecules in 3D as a picture; no record |
| **Copy, Cut** (`clipboardActions.ts`) | TS makes each flavour, Rust puts them on the clipboard (`clipboard.rs`) | Mac: the record, MOL, RXN, GVML (with EMF), PNG. Windows: the record, MDLCT and MOL, RXN, GVML, PNG, EMF, DIB, or an OLE object in place of GVML and PNG | the record carries molecules in 3D and their results; a surface promised stays a promise |
| **Copy as SMILES** | RDKit, then the clipboard as text | SMILES | the selection's structure |
| **Office live link** (Windows) | TS, then Rust `ole_update` | the record and EMF in the object | as `.meno` does, the surface shown included |

Never written: XYZ, PNG or EMF as files, anything printed or dragged out.
Plugins write nothing that leaves them (a temporary copy of the output,
deleted); the chemistry worker answers over its pipe.

A saved workspace keeps each molecule's results and, for a promise, the
output's name and SHA-256: the value of the one shown is kept; the others
are asked for again only once that output is opened in the session, by the
reader that gave them, added.

## What is unclear today

1. **"Reader" means two things.** `lib/calc/readers.ts` holds a
   `CalcReader` - two patterns for the energies CREST, xtb and ORCA write
   on an XYZ file's comment lines - and says these "are to become
   plugins"; `lib/calc/catalog.ts` holds the reader plugins. They share no
   code and meet only in `Molecule3D.energies`.
2. **What a file is, is decided in five places.**
   - `openedAs` decides the tab, from the extension, `detectFormat` and
     `outputKindOf`.
   - `processFileContent` decides again, and always asks `detectFormat`
     first: a calculation output that holds a `V2000`, a line ending
     `M  END`, or starts like an XYZ file is read as a structure.
   - The drop's `STRUCTURE_FILE` pattern decides by extension.
   - The clipboard's order decides by flavour.
   - Each reader detects again inside itself: cclib's `ccread`, and
     PySCF's own Molden test.

   The order goes by family - structure formats before outputs - not by
   how strong the evidence is: a program's banner is stronger than "the
   first line is a number".
3. **Built-in readers are listed twice:** in `READER_PLUGINS` and in
   `builtinWorker.ts`'s own map, kept in step by hand.
4. **A reader is found by its shown name.** Results keep `from` as
   "name version", and `asks.ts` and `sources.ts` find the plugin by the
   name's start; a renamed reader would lose its results' promises.
5. **The cube reader is listed in Settings beside the plugins**, as
   "Comes with Meno", with an overlap row of one choice - while MOL, SDF
   and XYZ, read by Meno as the cube is, are not.
6. **A calculation's geometries come in as XYZ text.** `calcResult` writes
   the reader's frames as an XYZ file (`xyzOf`) and reads it back, so that
   bonds are found as for any XYZ file.
7. **Gaps:**
   - XYZ text on the clipboard is not recognised.
   - An RXN cannot be dragged in on Windows (`drop.rs`'s kinds).
   - The EMF and DIB flavours are written but never read: only Meno's own
     pictures carry a structure.
   - PDB and KET are offered by Open and then refused.
   - A file opened has no path, so its first Save always asks.
   - ARCHITECTURE.md's format table lacks calculation outputs and the
     writers, and still calls `lib/calc` "energies, for now".

## Proposal

### The line

- **Meno reads and writes structure formats itself**, in its core: MOL,
  SDF, RXN, XYZ, SMILES, `.meno`, the record. These are never plugins and
  never listed in Settings. Reading and writing a format belong together;
  a format Meno writes, it reads back.
- **Calculation output is read by readers**, and only by readers. Meno's
  core knows no program's format - with the one exception agreed on
  2026-10-05: the energies CREST, xtb and ORCA write on an XYZ file's
  comment lines, which are part of reading XYZ and so of the core, not a
  reader.
- **Only Meno writes.** A reader gives data to Meno, and Meno decides what
  is saved, copied or exported.

### Readers, one contract

The same for every reader, plugin or built-in:

- **Known by its id.** It also has a version and a shown name, and it says
  which kinds it reads, by their ids in the table of kinds. Results keep
  the id and the version; the name is looked up only to show it. A
  workspace saved before keeps names, and they are read as ids.
- **Asked, never trusted to decide.** Meno decides the kind before any
  reader is asked, and sends it with each request. A reader may answer
  that it cannot read the file; it does not detect kinds for Meno.
- **Three requests**, one answer each, an error an answer:
  - `ping` - its name and version;
  - `read {kind, name, text}` - the molecule in Meno's own forms (atoms,
    geometries, each one's energy, what the calculation was), and results
    in the general form, any of them a promise;
  - `ask {kind, key, name, text}` - a promise's value.
- **Keeps nothing between requests**; the output is sent again.
- **Gives data, never code or markup**, in Meno's units, checked by Meno
  on the way in and again when a workspace is opened.
- **Runs apart from the page:** a plugin in its own process and
  environment, a built-in in a web worker; never on the main thread.
- **Several read one kind.** Each one's results are its own; where they
  overlap, the chemist's choice for that kind gives Meno's own forms and
  orders the results (the maintainer, 2026-10-05/06).

**Plugin or built-in** differ only in how a reader gets there:

- A plugin is downloaded into an environment from a lock Meno carries,
  with the network's consent. It is added and taken away in Settings.
- A built-in comes with Meno: nothing to add, nothing downloaded. It is
  not listed among the readers, and it appears only where it overlaps
  another reader, in that kind's row, named "Meno".
- Either can become the other, or be taken out, with nothing else in Meno
  changing; the built-in readers are listed once, and the worker that
  runs them reads that list.

### One table of kinds

- **One table** (`lib/io/kinds.ts`) holds every kind Meno takes in or
  gives out:
  - its id, name and marks;
  - its file extensions;
  - who reads it - Meno, or the readers - and whether Meno writes it.
- **Its users.** Open, drop and paste all ask this table, and so do Open's
  filter, Save's choices and ARCHITECTURE.md's format table.
- **Decided once, by content, strongest evidence first:**
  1. Meno's own records;
  2. a program's banner;
  3. CTfile and RXN markers;
  4. a cube's layout;
  5. an XYZ file's layout.

  The extension decides only where the content does not; where neither
  does, the file opens as text.
- **The way in decides only what it must.** The tab is decided by what
  the file is; a drop's extension no longer decides first; the
  clipboard's flavours stay an order of their own, since a flavour is
  already a kind.

### Smaller things, with it

- `lib/calc/readers.ts` becomes what it is - XYZ's comment-line energies,
  beside the XYZ reader - and "reader" is said of readers only.
- A calculation's geometries become molecules in 3D directly, with bonds
  found by the same function XYZ uses, not through XYZ text.
- The cube reader leaves Settings' list.
- The gaps above, each where it is cheap:
  - XYZ text on the clipboard;
  - RXN dragged in on Windows;
  - PDB and KET no longer offered by Open until something reads them.

## Decisions wanted

1. **The line**, as above: structure formats in Meno's core, calculation
   output through readers. The other way would make every format a reader
   under one contract, MOL and XYZ included. That is one path, but it
   would need bonds and drawings in the contract and a larger change for
   little gain now. Recommended: the line above.
2. **Built-in readers out of Settings' list**, shown only where they
   overlap a plugin. Recommended.
3. **What a file is, decided once, by content, strongest evidence first**;
   the extension only where the content does not decide. Recommended.
4. **Structure formats from plugins later** - PDB, mmCIF and the like.
   Not now. The contract stays open to it: an optional `bonds` field
   could be added without breaking a reader.

## In order, once agreed

1. This document.
2. The table of kinds and the one decision. This covers Open, drop,
   paste, Open's filter and Save's choices, with tests for the misread
   cases above.
3. Readers by id, with names in saved workspaces read as ids. In the same
   step: the kind sent with each request, the built-in readers listed
   once, the cube reader out of Settings' list, and `readers.ts` renamed.
4. A calculation's geometries without XYZ text; the cheap gaps.
5. ARCHITECTURE.md's format table drawn from the table of kinds.

Steps 2 to 5 depend on one another little. Each is a pull request from
main.
