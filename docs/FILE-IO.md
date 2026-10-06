# File input and output

What comes into Meno and what goes out of it - files, the clipboard,
Office - and who reads and writes each kind. Written on 2026-10-06 at the
maintainer's request ("整理して、reader の位置づけを明確化"), from main at
#147 with the PySCF reader of #148.

The first half is how things are. The second is the plan, along the
maintainer's answers of the same day, built step by step in the order at
its end. Plugins
beyond files - SMILES, R/S, conformers, what comes later - are in
[`PLUGINS.md`](./PLUGINS.md).

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
- **Reader, writer** - what reads or writes one kind for Meno, under one
  contract. Each is part of a plugin (cclib, PySCF) or one of Meno's own
  parts.
- **Plugin**, **Meno's own parts** - as in PLUGINS.md. A plugin is
  independent and added or removed; Meno's own parts come with Meno.
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

Each point is resolved by the plan below (see *Every point resolved*).

1. **"Reader" means two things.** `lib/calc/readers.ts` holds a
   `CalcReader`: two patterns for the energies CREST, xtb and ORCA write on
   an XYZ file's comment lines. It says these "are to become plugins".
   `lib/calc/catalog.ts` holds the reader plugins. The two share no code
   and meet only in `Molecule3D.energies`.
2. **What a file is, is decided in five places.**
   - `openedAs` decides the tab, from the extension, `detectFormat` and
     `outputKindOf`.
   - `processFileContent` decides again, and always asks `detectFormat`
     first. A calculation output that holds a `V2000`, a line ending
     `M  END`, or starts like an XYZ file is read as a structure.
   - The drop's `STRUCTURE_FILE` pattern decides by extension.
   - The clipboard's order decides by flavour.
   - Each reader detects again inside itself: cclib's `ccread`, and PySCF's
     own Molden test.

   The order goes by family - structure formats before outputs - not by
   how strong the evidence is.
3. **Built-in readers are listed twice:** in `READER_PLUGINS`, and in
   `builtinWorker.ts`'s own map, kept in step by hand.
4. **A reader is found by its shown name.** Results keep `from` as
   "name version", and `asks.ts` and `sources.ts` find the plugin by the
   name's start. A renamed reader would lose its results' promises.
5. **The cube reader is listed in Settings beside the plugins**, as
   "Comes with Meno", with an overlap row of one choice. MOL, SDF and XYZ,
   which Meno reads as it reads cube, are not listed.
6. **A calculation's geometries come in as XYZ text.** `calcResult` writes
   them as an XYZ file (`xyzOf`) and reads that back.
7. **Every reader added reads every output of its kind**, and opening
   waits for the slowest (`Promise.allSettled` in `readOutput`).
8. **A reader that fails is said only to the developer console.**
9. **Office's record reaches the canvas under a made-up name,
   `office.meno`**, so the `.meno` suffix stands for two formats.
10. **Open reads every file as text, through an `<input>`, and keeps no
    path.** As a result:
    - the first Save always asks for a name;
    - a saved workspace cannot find the output its promises came from
      (WORKSPACE.md planned to keep "where its output was");
    - a binary kind cannot be read.
11. **Closing a tab with unsaved changes offers no Save.**
    `ConfirmDiscard` still says that nothing can be saved yet.
12. **SMILES is copied two ways.** The menu goes through Meno's clipboard
    (Rust); the SMILES panel's button goes through the browser's.
13. **SMILES is parsed two ways.**
    - What the chemist types or pastes goes to RDKit.
    - The SMILES of abbreviations, ligands, reagents and counter-ions go to
      Meno's own parser (`lib/chem/smiles.ts`). It is a reader for part of
      OpenSMILES, made for the groups Meno's dictionary stands for:
      - the organic subset, and atoms in brackets (isotope, hydrogens,
        charge);
      - aromatic atoms, branches, ring closures and bonds;
      - `*`, and atom classes;
      - `@` and `@@` kept for the layout engine. Other stereo marks are
        read past.
    - The chemist's own abbreviations, typed in Settings, go to Meno's
      parser too.
    - Meno also writes SMILES itself, for an abbreviation made from a
      selection.
14. **The clipboard has gaps.** XYZ text is not recognised. The EMF and DIB
    flavours are written but never read.
15. **An RXN cannot be dragged in on Windows** (`drop.rs`'s kinds).
16. **PDB and KET are offered by Open and then refused.**
17. **Code no path reaches:** the RXN branch of `readMoleculesFromText`.
18. **Writing where the chemist chose relies on the dialog plugin** adding
    that path to the file scope. That is right, but it is said nowhere.
19. **ARCHITECTURE.md is out of date.** Its format table lacks
    calculation outputs and the writers, and it still calls `lib/calc`
    "energies, for now".

## The plan

### Decided by the maintainer, 2026-10-06

- **Meno is not a plugin.** Its own parts come with it. The Plugins tab
  lists plugins only, and a tab named for files holds who reads and
  writes each kind.
- **PDB and other formats are read too**, by a plugin or by Meno.
- **One reader reads a kind**, as assigned for that kind in a single
  table. Readers can still read together: others added for a kind read
  as well, and their results are combined.
- **A plugin's drawing comes in the record's form.** A writer's options
  are declared in a general form and drawn by Meno.
- **Save and Save As write `.meno` only.** Everything else is Export.
- **Meno's own readers sit behind the contract.** Whether they run in a
  worker or on the page is decided once, for all of them alike, after the
  maintainer has seen the measurements; a mix is not wanted (see
  *Response*).
- **RDKit is a plugin.** No plugin is kept running ahead of need: each
  starts when first needed and stays for the session, as RDKit does now
  (PLUGINS.md).

### The line

- **Meno's core keeps what is Meno's own.** That is:
  - the drawing, the molecules in 3D, what is known of them, and how
    they show;
  - `.meno` and the record;
  - the table of kinds;
  - putting answers together and checking them;
  - the files themselves: opening, saving, the clipboard, Office.
- **Every other format is read and written by a reader or a writer**, a
  plugin's or one of Meno's own parts, under one contract.
- **Only Meno touches files.** A reader is given a file's content, never
  its path. A writer gives back content, and Meno writes it where the
  chemist chose.

### The contract for files

PLUGINS.md's contract, with three requests for files:

- **`read {kind, name, data}`** gives any of:
  - **molecules in 3D** - atoms, geometries, each one's energy, and what
    the calculation was, with bonds where the file says them (an SDF's
    bond block, a PDB's `CONECT`). Where it does not, Meno finds the
    bonds as for an XYZ file;
  - **a drawing**, in the record's form, read by Meno's own record reader
    with its checks;
  - **results** in the general form, any of them a promise.
- **`ask {kind, key, name, data}`** gives a promise's value.
- **`write {kind, molecules, options}`** gives the file's content.

In each:

- **`data`** is text for a text kind and bytes for a binary one.
- **The kind is decided by Meno** before anyone is asked; a reader may
  answer that it cannot read the file.
- **Each reader and writer is known by its id.** Names in workspaces saved
  before are read as ids.

### Who reads and writes each kind

The tab named for files (PLUGINS.md, *Settings*) has a row for every kind
Meno knows of:

- **Read by:** one - Meno, or a plugin added that reads it.
- **Also read by:** none at first. The chemist may add any plugin that
  reads the kind; each then reads the file as well, and its results join
  under its name, as #147 keeps them. Example: a Gaussian output read by
  cclib, with PySCF added to draw its orbitals.
- **Written by:** one, where anything writes the kind.

How these behave:

- **Defaults.** A kind Meno reads stays Meno's when a plugin that reads it
  is added. A kind nothing read goes to the first plugin added that reads
  it.
- **Opening.**
  - The reader assigned reads the file, and what it gives shows as soon
    as it answers.
  - The others read alongside, and their results join as they come, so
    a slow one never holds the file up.
  - One that fails says so on the molecule, by name.
- **What Meno keeps one of** - the geometries, the drawing, what the
  calculation was - comes from the reader assigned. The others give
  results only.

### Open, drop, paste

- **One table of kinds** (`lib/io/kinds.ts`, built in #150) holds, for
  every kind:
  - its id, name and marks;
  - its extensions;
  - whether it is text or bytes.

  Readers and writers name kinds by these ids.
- **Kinds are registered, not only listed by Meno** (the maintainer,
  2026-10-06), so that a plugin can read a program Meno has never heard
  of:
  - **Meno registers its own kinds** by id: the workspace, the record,
    MOL, SDF, RXN, XYZ and cube. It also registers the well-known kinds of
    calculation output: ORCA, Gaussian, the formatted checkpoint, xTB,
    Molden.
  - **A plugin registers its kinds in its manifest.** That is data it
    carries beside its lock and its worker, and it lists the kinds the
    plugin reads and writes:
    - a well-known kind by its id;
    - a new kind with its id, name, extensions and marks.
  - **The manifest is read when the plugin is added**, never asked of the
    running plugin, so nothing is started to learn what a plugin reads.
    Its kinds join the table then, and leave it when the plugin is taken
    away, unless Meno or another plugin registered them too.
  - **Two plugins that register the same new id** give one kind, its marks
    put together, with both in its row in Files.
- **Marks are data.** A mark is text that a file's first 64 KiB holds,
  anywhere or at a line's start, with runs of spaces counted as one.
  - No code, and no regular expression, is taken from a plugin: a pattern
    can be written so that matching it never ends, and holds the page up.
  - **A kind told only by how it is laid out** is told by its plugin when
    asked: `probe {kind, name, head}`. Meno asks only where nothing
    stronger decided and the file's extension is one of the kind's.
    Asking starts the plugin, as opening the file needs it anyway.
  - **No plugin claims what is not its own.** When a plugin is added, each
    of its marks is tried on samples of Meno's own kinds, which Meno
    carries. A mark one of them would match is refused, and the plugin is
    added without it, as Settings says.
- **What a file is is decided once, by content, strongest evidence
  first:**
  1. Meno's own records;
  2. a program's banner, Meno's or a plugin's;
  3. CTfile and RXN markers;
  4. a PDB's records;
  5. a cube's layout;
  6. an XYZ file's layout;
  7. a plugin's `probe`.

  The extension decides only where the content does not; where neither
  does, the file opens as text. Open, a drop and pasted text all ask this
  one decision. The clipboard's flavours keep their own order, since a
  flavour is already a kind.
- **Open uses the system's dialog through Tauri**, so Meno has the file's
  path. It reads bytes, and decodes the text kinds. It offers `.meno`,
  text, and the kinds something reads: Meno, or a plugin Meno knows of,
  added or not. A file whose reader is not added says which plugin to
  add, as now.
- **Office's record is handed to the canvas as the record**, not under a
  made-up name.

### Save and Export

- **Save and Save As write `.meno`.**
  - A workspace opened from a `.meno` file is saved back to it.
  - Anything else asks for a name the first time, so the file it was
    opened from is never overwritten.
  - The workspace keeps, for each output, where it was as well as its
    SHA-256. A promise is asked for from there when the file is still
    there and unchanged, and Meno may still read it. Otherwise it asks
    for the file, as now.
- **Closing a tab with unsaved changes** offers Save, beside Keep and
  Discard.
- **Export…** offers every kind a writer added writes, each written by
  the one assigned:
  - MOL, SDF, RXN and SVG now;
  - PDB and a calculation's input later.

  The writer says what it takes: the page, the molecules, or one
  molecule. Meno asks which where it must, then shows the writer's
  options, then asks for the file's name.
- **Copy stays as it is**: the record and the clipboard's flavours, not
  Export. The SMILES panel copies through the same clipboard as the menu.

### Response

The maintainer's condition: Meno's own readers go behind the contract, in
a web worker, only if the response does not suffer - and all of them the
same way, never some in the worker and some on the page.

- **Measured first**, before and after, for four cases:
  - a small molfile (as from a paste);
  - an SDF of a thousand records;
  - an XYZ trajectory of two thousand frames;
  - a large calculation output.

  Two things are measured: the time from the file read to its first frame
  shown, and the longest the page is held up meanwhile.
- **Shown to the maintainer, then decided.**
  - The measurements are put before the maintainer, each case both ways.
  - The maintainer then chooses one way for all of Meno's readers and
    writers: the worker, or the page.
  - Either way they answer the same contract, so nothing else in Meno
    depends on the choice.

### Every point resolved

| # | Point | Resolved by | Step |
| --- | --- | --- | --- |
| 1 | "Reader" means two things | XYZ's comment-line energies become part of Meno's XYZ reader; `lib/calc/readers.ts` goes; "reader" means only a reader | 3 |
| 2 | Five places decide what a file is | one table of kinds, one decision by content, strongest evidence first, used by Open, drop and pasted text | 2 |
| 3 | Built-in readers listed twice | one list of Meno's readers and writers; the worker reads it | 3 |
| 4 | Readers found by name | known by id; names in old workspaces read as ids | 3 |
| 5 | Cube beside the plugins | Meno's parts show only in the tab for files, as "Meno"; the Plugins tab lists plugins only | 3 |
| 6 | Geometries through XYZ text | molecules in 3D made directly, bonds found by the function XYZ uses | 3 |
| 7 | Every reader reads; opening waits | one reader assigned per kind, others only where added; the first answer shows at once | 3 |
| 8 | Failures only in the console | said on the molecule, by the reader's name | 3 |
| 9 | `office.meno` | the record handed over as the record | 2 |
| 10 | Text only, no path | Open through Tauri's dialog: a path, bytes; Save back to an opened `.meno`; outputs found again by path and SHA-256 | 2, 5 |
| 11 | No Save when closing | Save offered beside Keep and Discard | 5 |
| 12 | SMILES copied two ways | one way, through Meno's clipboard | 5 |
| 13 | SMILES parsed two ways | what the chemist gives is read by the plugin chosen for SMILES (RDKit by default, PLUGINS.md). The dictionary's SMILES are Meno's own data and stay with Meno's own parser, which must answer while drawing. Both are said in the code and the docs | 6 |
| 14 | Clipboard gaps | pasted text asks the one decision, so XYZ is read. EMF and DIB stay written only, and are said to be: they are for programs that take only a metafile or a bitmap, and an EMF Office hands back is drawn afresh, without Meno's record in it (`clipboard.rs` reads none on purpose); the record comes back through GVML, PNG or Meno's own flavour | 2 |
| 15 | RXN not dragged in on Windows | `drop.rs` takes the RXN flavour | 2 |
| 16 | PDB, KET offered then refused | Open offers only kinds something reads; PDB comes with its reader | 2, 7 |
| 17 | Code no path reaches | removed | 2 |
| 18 | Write scope unsaid | said in ARCHITECTURE.md (*What the backend accepts*) and beside the capability | 5 |
| 19 | ARCHITECTURE.md out of date | its format table drawn from the table of kinds; the stale lines rewritten | 8 |

### Also decided

1. **The tab for files is named "Files"**, and every kind Meno knows of
   has a row in it, so who reads what can always be seen.
2. **The defaults when a plugin is added:** Meno keeps its kinds, and a
   kind nothing read goes to the new plugin.
3. **"Also read with…" for one file** - from the molecule's menu, without
   changing the kind's row - comes later, if it is wanted.

## In order

Each step is a pull request from main.

1. **These documents.**
2. **Kinds and Open:**
   - the table of kinds and the one decision;
   - Open through Tauri's dialog;
   - the record from Office as the record;
   - pasted text through the decision;
   - RXN dragged in on Windows;
   - Open offering only what is read;
   - the dead branch removed;
   - tests for each misread case.
3. **Readers by the table:**
   - kinds registered: Meno's own and the well-known ones, and each
     plugin's from its manifest; marks as data, tried on Meno's samples
     when a plugin is added; `probe`;
   - ids, and the kind sent with each request;
   - one list of Meno's parts;
   - the Files and Plugins tabs;
   - one reader per kind and the others added, the first answer shown at
     once;
   - failures said;
   - `readers.ts` into the XYZ reader, and geometries made directly.
4. **Response:** the measurements, shown to the maintainer. Then Meno's
   readers go behind the contract, all of them the way chosen.
5. **Save and Export:**
   - Save writing `.meno` only, back to the file it came from;
   - Save offered when closing;
   - Export with the writer's options;
   - Meno's writers behind the contract;
   - outputs found again by path;
   - one SMILES copy;
   - the write scope said.
6. **RDKit as a plugin** (PLUGINS.md), with SMILES read
   through it.
7. **New kinds:** reading PDB, and a first calculation's input. Which
   program, and whether Meno or a plugin reads PDB, are decided then.
8. **ARCHITECTURE.md** drawn from the table of kinds.
