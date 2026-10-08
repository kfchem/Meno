# PDFs in the workspace

A specification of stage 4 (WORKSPACE.md, *Stages*): a PDF held in the
workspace, its pages shown and its text read and searched, and its
figures cut out onto the page. Stage 5 - figures read as structures -
builds on it. Written on 2026-10-09, before anything is built, for the
maintainer to agree to or change; the questions at the end are theirs to
answer.

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
- **Sharp at any size.** Pages are drawn at the screen's resolution, and
  drawn again once the size stops changing; the sharper picture fades in
  over the softer one.
- **Only what is in view is drawn**, so a long thesis scrolls as a short
  paper does. Pages far out of view are let go, and drawn again when they
  come back.
- **Links in the PDF** work: one to a figure, a reference or a section
  goes there in the column, and back with the system's Back keys (⌘[ on
  a Mac, Alt+← on Windows) or the mouse's back button. One to a web page opens in the
  system's browser.
- **Nothing in a PDF runs.** Its scripts, forms and actions are not run,
  and nothing it names is fetched (*Safety*, below).

### Text

- **Selected as in any reader**: a drag over the text selects it, a
  double-click a word, a triple-click a line. ⌘C copies it. The
  right-click menu has *Copy*.
- Whatever the text says, Meno does nothing with it of itself. Reading a
  compound's name as a structure is a step for later (not stage 5).

### Search

- **⌘F**, with the column in front - or *Find in PDF…* in Meno's menu -
  opens a field at the column's top. Every place the words are found is
  marked on the pages and counted (*3 of 12*). Enter goes to the next,
  Shift+Enter to the one before, and Esc closes the field.
- **It searches the PDF shown** (question 5). Letters are matched
  without regard to case or accents, and across a line's end, as PDF
  readers match them.

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

- **pdf.js** (Mozilla, `pdfjs-dist`, Apache-2.0) reads and draws the PDF
  in Meno's own window, its parsing in a web worker so that the canvas
  never waits. It is part of Meno, not a plugin: it needs no Python and
  nothing fetched, and a PDF is a file any workspace may hold. It adds
  some megabytes to the app (to be measured; at most about 4 MB is
  expected).
- **What pdf.js needs besides, bundled** (question 6), each licence
  shipped in `resources/licenses` and credited in the README:
  - the CMaps (Adobe, BSD-3-Clause), for text in Chinese, Japanese and
    Korean that a PDF does not carry in full;
  - the standard fonts, for the fourteen fonts a PDF may name without
    carrying: Foxit's (PDFium, BSD-3-Clause) and Liberation Sans (SIL OFL
    1.1).
- **In the document**, as texts are:
  - `pdfs`: each PDF's name, the SHA-256 of its file, and where it was
    left;
  - `pictures`: each picture's file, place, size and source.

  Undo, saving, the clipboard's record and the workspace file all carry
  them.
- **The column** shows texts and PDFs alike, by name. A PDF's view is a
  component of its own beside the text editor.

### Safety

A PDF is a file from anywhere, and is treated as such.

- **pdf.js is set to run nothing**: no scripting, no evaluated code
  (`isEvalSupported: false`), and no forms or actions run.
- **Nothing a PDF names is fetched.** Its fonts and images are its own,
  read from the file; there is no remote content. A web link opens in
  the system's browser only when it is clicked.
- **Its text and pictures go no further than the column**, the page and
  the clipboard, as the chemist moves them.

### Platforms

- **The engines Meno runs in** are WebKit on macOS (the system's), WebView2
  (Chromium) on Windows and WebKitGTK on Linux. pdf.js's current build
  needs recent engines. Each system is checked before step 1 is merged,
  and pdf.js's build for older engines is used where one falls short.

## In order

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

1. **Where a PDF is read: in the column beside the canvas, by its name
   with the texts** (recommended), or its pages laid on the page itself,
   zoomed with the drawing? The column keeps a paper at a size it can be
   read at, whatever the canvas is zoomed to. The page is where its figures
   go, cut out.
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
6. **pdf.js's CMaps and standard fonts bundled** (recommended), under
   BSD-3-Clause and the OFL, their licences shipped? Without them, some PDFs
   show text in a system font, and some Chinese, Japanese or Korean text
   not at all. Or only the OFL fonts (Liberation)?
7. **No preview of a PDF on the page for now** (recommended)? Its name
   in the column, and its figures on the page, tie it to the work.
8. **Nothing more for notes in stage 4** (recommended)? Words on the
   page and the workspace's texts cover them.
