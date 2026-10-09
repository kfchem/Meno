# PDFs in the workspace

A specification of stage 4 (WORKSPACE.md, *Stages*): a PDF held in the
workspace, its pages shown and its text read and searched, and its
figures cut out onto the page. Stage 5 - figures read as structures -
builds on it. Written on 2026-10-09, before anything is built, for the
maintainer to agree to or change; the questions at the end are theirs to
answer.

**Decided by the maintainer (2026-10-09): PDFium, not pdf.js.** PDFium
is the engine Chrome reads PDFs with. The maintainer chose it for how
fast and how faithfully it draws; viewers built on pdf.js, as some
publishers' have been, left a poor impression. The reader is to feel as
quick as the best tablet PDF apps: what is under the hand answers at
once.

Judge it against [PURPOSE.md](PURPOSE.md). A chemist reads a paper to
find a molecule, how it was made and what was found about it. Here the
paper is open beside that molecule, in the same workspace. A figure from
the paper sits beside the structure drawn from it, and later, in stage
5, is drawn as that structure. Moving between a PDF reader and Meno
stops being part of the work.

## Where it starts from

- **Notes on the page are there already.** Stage 4's notes are built:
  - words on the page, for a reaction's reagents and conditions or
    anything else (#177);
  - texts held in the workspace and read in the column beside the canvas
    (#172).

  Nothing more is proposed for notes (question 8).
- **The column beside the canvas** shows the workspace's texts (#172): their
  names along its top, one shown, the column slid open and shut and as
  wide as its edge is dragged. A PDF joins them there (question 1).
- **The workspace file** keeps files as they were (`files/<sha256>`, a PDF
  stored, not deflated; FILE-IO.md, *The workspace file*), decided on
  2026-10-06 with PDFs in mind.
- **A small preview on the page** of each text and PDF was decided on
  2026-10-04. It was not made for texts, and is not proposed here for
  PDFs yet (question 7).

## What it does

### A PDF held in the workspace

- **Opened** (Meno's menu, *Open…*), **dropped** on the canvas, or
  **pasted** as a file, a PDF is held in the workspace in front, or in a
  new one where none is in front. Its name joins the texts' along the
  column's top, and it is shown there. The column opens if it was shut.
- **Saved with the workspace**, as it was: a PDF of 5 MB makes the
  `.meno` 5 MB larger. Opened again, it is shown where it was left - the
  same page, scrolled as far.
- **Closed** by its name's ×, it leaves the workspace; an undo brings it
  back. *Hide texts* keeps it, with the texts.
- **Nothing else is kept beside it**: no copy of its text, no pictures of
  its pages. These are worked out again from the PDF when needed.

### Reading

- **Its pages one under another**, as wide as the column, scrolled in
  the column. A page number shows as it scrolls (*3 / 12*); a click on it
  asks for a page to go to.
- **Larger or smaller** by a pinch over the column, or Ctrl/⌘ with the
  wheel there - the column's own, never the canvas's. *Fit width* comes
  back with a double-click on the number. The column can be dragged
  wider, as it is for texts. A page larger than the column is scrolled
  across as well.
- **Quick, then sharp.** A page shows at once, softly, from a small
  picture of it; the parts in view are then drawn at the screen's
  resolution, in tiles, and fade in over it. While a pinch goes on, the
  tiles there are scaled on the graphics card, and drawn again sharper
  once it stops - nothing waits for a page to be drawn.
- **Only what is in view is drawn**, nearest first, and the next pages
  ahead of the scroll. A tile no longer wanted is not finished, so a long
  thesis scrolls as a short paper does. Pages far out of view are let go,
  and drawn again when they come back.
- **Links in the PDF** work: one to a figure, a reference or a section
  goes there in the column, and back with the system's Back keys (⌘[ on
  a Mac, Alt+← on Windows) or the mouse's back button. One to a web page opens in the
  system's browser.
- **Nothing in a PDF runs.** Its scripts, forms and actions are not run,
  and nothing it names is fetched (*Safety*, below).

### Text

- **Selected as in any reader**: a drag over the text selects it, a
  double-click a word, a triple-click a line. ⌘C copies it. The
  right-click menu has *Copy*. PDFium says where each letter is on its
  page, and Meno selects and marks by that.
- Whatever the text says, Meno does nothing with it of itself. Reading a
  compound's name as a structure is a step for later (not stage 5).

### Search

- **⌘F**, with the column in front - or *Find in PDF…* in Meno's menu -
  opens a field at the column's top. Every place the words are found is
  marked on the pages and counted (*3 of 12*). Enter goes to the next,
  Shift+Enter to the one before, and Esc closes the field.
- **It searches the PDF shown** (question 5), by PDFium's own search,
  letters matched without regard to case. Whether words broken across a
  line's end are found is measured in step 0, and made so in step 2 if
  PDFium does not.

### Figures cut out onto the page

- **A long press then a drag** on a page draws a box, as a long press
  begins one on the canvas (question 2). A plain drag selects text, as
  above.
- **Let go, the box stays**, outlined. From there it can go two ways:
  - dragged out of the column onto the canvas, it becomes a picture where
    it is let go;
  - the box's right-click menu has *Put on the page* (beside what is in
    view, clear of what is there, as a new molecule in 3D is placed) and
    *Copy picture*.

  Esc, or a click elsewhere, lets the box go.
- **The picture is made from the PDF itself**, not from the screen, at
  the resolution Settings, *Files*, sets for copied pictures (600 dpi by
  default). It is as sharp as the figure was printed, however small the
  column was.
- **Tied to where it came from**: the picture keeps which PDF, which page
  and which box. Its right-click menu has *Show in the PDF*, which shows
  that page in the column with the box marked for a moment. If the PDF
  has been closed, the item is not offered.

### Pictures on the page

A new kind of thing on the page, which stage 5 will read as structures.

- **Where pictures come from**:
  - a figure cut out of a PDF, as above;
  - an image file (PNG, JPEG) opened or dropped;
  - a picture pasted from the clipboard, such as a screenshot (question 3).
- **Lying on the page, under the drawing** (question 4): a structure
  drawn over a figure, to trace or compare it, shows over it. A picture
  is never drawn over a molecule in 3D.
- **Handled as the drawing's parts are**:
  - moved by a drag;
  - selected by a click, a box or a lasso (its middle inside), or Ctrl/⌘
    and a click;
  - deleted, copied, cut and pasted with the rest of a selection;
  - undone.
- **Resized** by a drag on its corner, keeping its proportions (question 4).
- **Saved** in the workspace as the file it is (`files/<sha256>`); the
  workspace keeps its place, size and source.
- **Not in pictures of the drawing yet**: Export and *Copy picture* of
  structures leave pictures out for now (*Not yet*).

## How it is built

### PDFium

- **PDFium** (the PDFium Authors, BSD-3-Clause, with some parts under
  Apache-2.0) reads and draws the PDF. It is part of Meno, not a plugin:
  it needs no Python and nothing fetched while Meno runs, and a PDF is a
  file any workspace may hold.
- **The build**: PDFium's own, as Chrome builds it, from the prebuilt
  libraries of `bblanchon/pdfium-binaries` (their build scripts MIT).
  It is built without JavaScript and without XFA forms
  (`pdf_enable_v8 = false`, `pdf_enable_xfa = false`). The release and
  each file's SHA-256 are pinned in Meno, and fetched and checked when
  Meno is built, never kept in the repository - as uv and pixi are
  pinned.
- **What PDFium carries within itself**:
  - the fourteen standard fonts a PDF may name without carrying them;
  - the CMaps for Chinese, Japanese and Korean text.

  Nothing besides is bundled for it. A font a PDF names but does not
  carry is found among the system's, as Chrome finds it, and after them
  among Meno's own (IBM Plex Sans, Mono and Sans JP).
- **Reached from Rust** through `pdfium-render` (MIT or Apache-2.0),
  which binds the library when Meno first needs it.
- **A narrow seam**: the rest of Meno asks the PDF for no more than
  these things:
  - a part of a page drawn at a scale;
  - its text, with where each letter is;
  - a search, and its links;
  - what a page is made of: paths, text and pictures, for stage 5.

  An engine could be changed behind that seam without the column, the
  page or stage 5 knowing (*Questions*, 6).

### Where it runs

- **In a process of its own** (question 6), as calculations' jobs are
  (`Meno --job`): Meno starts itself as a PDF reader, `Meno --pdf`,
  when a workspace first shows a PDF, and talks to it by its standard
  input and output.
- **A PDF that breaks PDFium breaks that process only.** The PDF says
  so, with *Open again*; Meno, and the work not yet saved, go on. Chrome
  keeps PDFium apart for the same reason.
- **The reader draws on its own thread**, a page at a time, each part
  in a way that can be stopped. A request no longer wanted - a tile
  scrolled out of view - is dropped, not finished.
- **Pictures come back as they are drawn**: the colours of each pixel,
  in the order a WebGL texture takes them (PDFium's
  `FPDF_REVERSE_BYTE_ORDER`), with no image format in between. They go
  to the window as bytes, not as text (Tauri's binary response).

### On the screen

- **The column's pages are drawn with WebGL**, as the canvas is: each
  page a sheet, its tiles textures on it. The graphics card scales and
  moves them, so scrolling and pinching never wait on PDFium.
- **Selection and search are drawn over the pages** in the same way,
  from where PDFium says the letters are.
- **A picture on the page is a texture on the canvas**, as a molecule's
  picture is. A figure at 600 dpi - a whole A4 page is about
  5000 × 7000 pixels - fits within what the graphics card takes.
- **In the document**, as texts are:
  - `pdfs`: each PDF's name, the SHA-256 of its file, and where it was
    left;
  - `pictures`: each picture's file, place, size and source.

  Undo, saving, the clipboard's record and the workspace file all carry
  them.
- **The column** shows texts and PDFs alike, by name. A PDF's view is a
  component of its own beside the text editor.

### Size

- **The library is the size of PDFium**: 7.3 MB on a Mac (Apple
  silicon), about 3.4 MB compressed (2.5 MB as the Windows installer
  compresses). For Windows and Linux, the prebuilt archives are 3.9 and
  3.8 MB.
- **What it adds to a download** is about 3 MB on each system: the
  Mac's disk image (8.1 MB for 0.1.8) and the Windows installer (6.6 MB).
  Installed, Meno grows by about 7 MB.

### Licences

Checked on 2026-10-09 against the licences shipped with the prebuilt
PDFium (chromium/8086). All allow Meno to carry PDFium within an
Apache-2.0 app:

| Part | Licence |
| --- | --- |
| PDFium | BSD-3-Clause, some files Apache-2.0 |
| FreeType (fonts) | The FreeType Project License |
| HarfBuzz (text shaping) | "Old MIT" |
| ICU (Unicode) | Unicode License v3 |
| libjpeg-turbo | IJG License, BSD-3-Clause, zlib |
| OpenJPEG (JPEG 2000) | BSD-2-Clause |
| libpng | PNG Reference Library License v2 |
| zlib | zlib License |
| Little CMS (colour) | MIT |
| Abseil | Apache-2.0 |
| Anti-Grain Geometry 2.3 | its own permissive notice |
| dragonbox, LLVM's libc | Apache-2.0 with LLVM Exceptions (dragonbox also Boost) |
| fast_float, simdutf | MIT |
| pdfium-binaries' build scripts | MIT |
| pdfium-render (Rust) | MIT or Apache-2.0 |

- **No copyleft code is in the library.** GPL text appears only in
  ICU's notice, for build scripts (Autoconf's) that are not part of it,
  under Autoconf's exception.
- **What Meno must do**:
  - ship every one of these licences, in `resources/licenses/pdfium/`;
  - credit them in the README;
  - and, as two of them ask of a program shipped without its source,
    say in its documentation that it is "based in part on the work of
    the Independent JPEG Group" and that "portions of this software are
    copyright © The FreeType Project (www.freetype.org). All rights
    reserved."

### Safety

A PDF is a file from anywhere, and is treated as such.

- **Nothing in a PDF runs.** PDFium is built without JavaScript and XFA,
  and Meno runs no form, action or launch a PDF holds.
- **Nothing a PDF names is fetched.** Its fonts and images are its own,
  read from the file, or the system's; there is no remote content. A
  web link opens in the system's browser only when it is clicked.
- **PDFium runs apart** (*Where it runs*, above), so a PDF made to break
  it takes nothing else with it.
- **Its text and pictures go no further than the column**, the page and
  the clipboard, as the chemist moves them.

### Platforms

- **The same PDFium on every system**: the library for macOS (Apple
  silicon), Windows (x64) and Linux (x64), from the same release.
- **Carried in the app**:
  - on a Mac, inside the app, signed with it;
  - on Windows, beside Meno's program, with a line in the installer's
    hook for when it is renamed or goes (RELEASING.md);
  - on Linux, beside it as well.

  Step 0 checks that a Mac app signed as Meno's is (ad hoc, with the
  hardened runtime) loads it.

## In order

0. **A trial, kept off main**, its numbers shown before step 1:
   - PDFium bound, in its own process, on the Mac and on Windows;
   - the Mac's signed app loading it;
   - how long a paper's first page, and a tile, take to show;
   - how fast pictures go from the process to the window.
1. **A PDF in the column**:
   - opened, dropped or pasted, held in the workspace and saved with it;
   - its pages drawn and scrolled, larger and smaller;
   - the page number and its links.
2. **Text and search**: selection, copy, ⌘F.
3. **Pictures on the page**, from image files and the clipboard: moved,
   selected, resized, deleted, copied, saved.
4. **Figures cut out**: the box in the column, dragged onto the canvas or
   put on the page, tied to its source (*Show in the PDF*).

Each step is a pull request of its own, checked in the built app on the
Mac (and on Windows for step 1). Then stage 5: a picture read as a
structure (MolScribe or DECIMER, in the sidecar, with consent for their
weights), drawn by Meno's engine beside it, tied to it.

## Not yet

- **Pictures in Export and *Copy picture*** of the drawing. They come
  when it is clear how a picture should go into a picture of the drawing
  (EMF, SVG, PDF).
- **A small preview on the page** of a PDF or a text (question 7).
- **Annotating a PDF** (highlights, notes on its pages). Notes go on the
  page beside it instead.
- **Searching every PDF of the workspace at once** (question 5).
- **Opening a PDF from the web**, by its address or its DOI.

## Questions

(Question 6 of the first draft - which of pdf.js's fonts to bundle - went
with pdf.js. PDFium carries its own.)


1. **Where a PDF is read: in the column beside the canvas, by its name
   with the texts** (recommended), or its pages laid on the page itself,
   zoomed with the drawing? The column keeps a paper at a size it can be
   read at, whatever the canvas is zoomed to. The page is where its figures
   go, cut out. (Drawn with WebGL either way, the pages could later be
   laid on the page as well.)
2. **How a figure is cut out: a long press then a drag**, as a box begins
   on the canvas (recommended)? Or the box drawn with a key held (Alt, as
   the lasso is)? Or a mode chosen first? A plain drag stays for text,
   as in every reader.
3. **Pictures from image files and the clipboard too** (recommended), or
   only figures cut out of a PDF? A screenshot of a figure is often how a
   structure comes to hand, and stage 5 can read any picture.
4. **A picture lies under the drawing and is resized by its corner**
   (recommended)? Or over the drawing, at a fixed size?
5. **Search looks in the PDF shown** (recommended), or in every PDF
   the workspace holds, its hits listed by PDF?
6. **PDFium as a library in a process of its own** (recommended)? Or
   PDFium built for the web (WebAssembly, `pdfium.wasm`, 5.4 MB) in the
   window? In the window it needs no process, no signing and no bytes
   sent across, and it runs walled off as the page's code does. But it
   is slower - about one and a half to two times as slow - has no thread of its own,
   and finds no system font - Meno would have to give it every font.
7. **PDFium carried in the app** (recommended), about 3 MB more to
   download? Or fetched the first time a PDF is opened, as uv and pixi
   are, with the network's consent - a smaller download, but no PDF
   opens before it has been fetched?
8. **No preview of a PDF on the page for now** (recommended)? Its name
   in the column, and its figures on the page, tie it to the work.
9. **Nothing more for notes in stage 4** (recommended)? Words on the
   page and the workspace's texts cover them.
