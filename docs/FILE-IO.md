# File input and output

What comes into Meno and what goes out of it - files, the clipboard,
Office - and where readers, writers and plugins stand among them. Written
on 2026-10-06 at the maintainer's request ("整理して、reader の位置づけを
明確化"), from main at #147 with the PySCF reader of #148. The first half
is how things are. The second is a proposal along the maintainer's
direction of the same day; its open points are the maintainer's to decide,
and nothing in it is built yet.

## Words

- **Kind** - what a piece of data is: a molfile, an ORCA output, a cube
  file, a Meno record on the clipboard. Told by what it holds; a file's
  name is a hint.
- **Structure format** - a program-independent description of molecules
  or a drawing: MOL, SDF, RXN, XYZ, PDB, SMILES.
- **Calculation output** - what a program wrote about a calculation:
  ORCA, Gaussian and xTB output, Gaussian's formatted checkpoint, Molden
  and cube files. **Calculation input** - what a program is given to run
  one.
- **Plugin** (as proposed) - what reads or writes kinds for Meno, under
  one contract. Some are downloaded into an environment of their own
  (cclib, PySCF); Meno is one too, the one that comes with it.
- **Reader, writer** - what a plugin does for one kind.
- **Meno's own formats** - `.meno` and the record (on the clipboard, in a
  picture, in an Office object): Meno's alone, never a plugin's.

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

The maintainer's direction (2026-10-06):

- PDB and other formats are to be read too, by a plugin or by Meno.
- Plugins write as well, a calculation's input among the rest.
- Settings has one place for plugins and Meno, not only for
  calculations. cclib reads XYZ as Meno does, so whether Meno's parser or
  cclib reads an XYZ file is the chemist's to choose.

### The line

- **Meno's core keeps what is Meno's own.** That is:
  - the drawing, the molecules in 3D, and what is known of them;
  - how these show;
  - `.meno` and the record;
  - the table of kinds;
  - putting plugins' answers together and checking them;
  - the files themselves: opening, saving, the clipboard, Office.
- **Every other format is read and written by plugins**, structure
  formats and calculation output alike, and Meno is one of those plugins.
  - Meno's own reading of MOL, SDF, RXN, XYZ, SMILES and cube comes with
    Meno under the same contract as cclib and PySCF.
  - So does its writing of MOL, SDF, RXN and SVG.
- **The chemist chooses, for each kind**, among the plugins that read it -
  for XYZ, Meno or cclib - and among those that write it.
- **Only Meno touches files.** A writer gives a file's content, and Meno
  writes it where the chemist chose. A reader is given a file's content
  and never its path.

### One contract

The same for every plugin, Meno's included:

- **Known by its id.** It also has a version and a shown name. It says,
  by their ids in the table of kinds, which kinds it reads and which it
  writes, and each writer's options (below). Results keep the plugin's id
  and version; the name is looked up only to show it. Names in
  workspaces saved before are read as ids.
- **Meno decides the kind** before any plugin is asked, and sends it with
  each request. A plugin may answer that it cannot read a file; it does
  not detect kinds for Meno.
- **Four requests**, one answer each, an error an answer:
  - `ping` - its name and version;
  - `read {kind, name, text}` - what the file holds (below);
  - `ask {kind, key, name, text}` - a promise's value;
  - `write {kind, molecules, options}` - the file's content.
- **What `read` gives**, any of:
  - **molecules in 3D** - atoms, geometries, each one's energy, what the
    calculation was, as now, and bonds where the file says them (an SDF's
    bond block, a PDB's `CONECT`). Where it does not say them, Meno finds
    them as for an XYZ file;
  - **a drawing**, in the record's form - atoms, bonds, arrows, pluses -
    read by Meno's own record reader with its checks;
  - **results** in the general form, any of them a promise.
- **What `write` is given:**
  - the molecules chosen, in Meno's forms: atoms, bonds, the geometry
    shown, charge and multiplicity, and what a calculation was, where
    known;
  - the chemist's options.

  It gives back text, or bytes for a binary kind.
- **A writer's options** are declared in a general form, as results are:
  a choice, a number, a text or a switch, each with a label and a
  default. Meno draws them as a form - a calculation's input: program
  keywords, method, basis, charge, multiplicity, the job. It fills them
  from what is known, a molecule's calculation conditions among them, so
  that a calculation can be run again as it was. It remembers the
  chemist's last choices for each writer.
- **Keeps nothing between requests.** A file is sent again each time.
- **Gives data, never code or markup**, in Meno's units, checked by Meno
  on the way in and again when a workspace is opened.
- **Runs apart from the page:**
  - a downloaded plugin in its own process and environment;
  - Meno's in a web worker, and SMILES in its chemistry worker, as now.

  Never on the main thread.

### Meno among the plugins

- **Meno's readers and writers answer the same requests** with the same
  forms; nothing in Meno's core calls a parser or a writer directly. A
  kind can move from Meno to a plugin, or the other way, with nothing
  else changing.
- **Meno is listed with the plugins:** first, as the one that comes with
  Meno, with nothing to add or take away.
- **What is Meno's alone** is never offered to plugins: `.meno` and the
  record, however they arrive.

### Several plugins for one kind

- **Reading,** as calculation outputs are read now:
  - every plugin added that reads the kind reads the file;
  - each one's results are its own;
  - the one chosen gives Meno's own forms: the geometries, the drawing,
    what the calculation was.
- **The one chosen shows as soon as it answers**, and the others' results
  join it as they come, so that a slow plugin never holds up a file
  opening. Today an output waits for every reader.
- **Writing:** only the one chosen writes.

### Settings: one place

- **One tab** for plugins and Meno together, named for neither reading
  nor calculations ("Plugins" proposed).
- **Its list:** Meno first, then each plugin, added or not. Each says
  what it reads and what it writes, by kind.
- **Below the list, a row for each kind that two or more read or write.**
  The row says who reads it and who writes it, with the chemist's choice
  for each; a kind only one reads or writes has no row.
- **What, never how** (the maintainer's rule): nothing in it says how a
  file is read.

### Saving and exporting

- **Save and Save As** offer `.meno` and the kinds that are written and
  read back by the plugins added: MOL, SDF, RXN, and PDB once a plugin
  does both. A file saved opens again as it is.
- **Export** offers the kinds that are only written: SVG, a calculation's
  input.
- **The writer's options**, where it has any, come between the choice of
  kind and the file's name.

### One table of kinds

- **One table** (`lib/io/kinds.ts`) holds every kind any plugin reads or
  writes:
  - its id, name and marks;
  - its file extensions.

  Plugins name kinds by their ids. A kind a new plugin brings comes into
  the table with the plugin: Meno's own list, for now. A list fetched
  online later needs its marks checked as data too, so that no pattern
  can hold the page up.
- **Its users.** Open, drop and paste ask this table, and so do Open's
  filter, Save's and Export's choices and ARCHITECTURE.md's format table.
- **Decided once, by content, strongest evidence first:**
  1. Meno's own records;
  2. a program's banner;
  3. CTfile and RXN markers;
  4. a PDB's records;
  5. a cube's layout;
  6. an XYZ file's layout.

  The extension decides only where the content does not; where neither
  does, the file opens as text. The clipboard's flavours stay an order of
  their own, since a flavour is already a kind.

### Smaller things, with it

- `lib/calc/readers.ts` - the energies CREST, xtb and ORCA write on an XYZ
  file's comment lines - becomes part of Meno's XYZ reader.
- A calculation's geometries become molecules in 3D directly, without
  passing through XYZ text.
- The cube reader is Meno's, like the rest, and no longer a plugin of its
  own in Settings.
- The gaps above, where they are cheap: XYZ text on the clipboard, an RXN
  dragged in on Windows, and PDB and KET no longer offered by Open until
  something reads them.

## Decisions wanted

Decided by the maintainer on 2026-10-06:

- Structure formats too are read by plugins, Meno one of them, and the
  chemist chooses who reads each kind.
- Plugins write, a calculation's input among the rest.
- Settings has one place for plugins and Meno.

Still to decide, each with what is recommended:

1. **The tab's name:** "Plugins", Meno first in its list.
2. **Several readers of one kind:** all read, the chosen one shown at
   once, the others' results joining as they come. The other way - only
   the chosen one reads - is cheaper: opening an XYZ file would not start
   cclib. But it gives up what one reader adds to another's, as an NBO
   plugin to cclib. Recommended: all read.
3. **A plugin's drawing** comes in the record's form. Recommended.
4. **A writer's options** are declared in a general form, drawn by Meno
   and filled from a molecule's calculation conditions. Recommended.
5. **Save As and Export:** Save As offers what is read back as well, and
   Export what is only written. Recommended.
6. **Meno's readers and writers behind the contract**, in a worker,
   nothing calling a parser directly. Recommended.
7. **RDKit's place:** part of Meno for now, SMILES being one of Meno's
   kinds. It could become a plugin of its own later, reading and writing
   what RDKit does. Recommended: part of Meno for now.

## In order, once agreed

Nothing is started until the maintainer says so.

1. This document.
2. The contract and the table of kinds:
   - `read` with bonds and drawings, `write` with options;
   - Meno's readers (MOL, SDF, RXN, XYZ, SMILES, cube) behind the
     contract, in a worker, with tests that each reads as before;
   - one decision of what a file is, for Open, drop and paste.
3. Plugins by id, with the kind sent in each request. Settings gets its
   one place, and the one chosen shows first.
4. Writers behind the contract: Meno's MOL, SDF, RXN and SVG, with
   Save As and Export drawn from the table.
5. The first new plugin kinds: reading PDB, and a calculation's input
   written for one program. Which program, and whether Meno or a plugin
   reads PDB, are decided then.
6. ARCHITECTURE.md's format table drawn from the table of kinds.

Each is a pull request from main.
