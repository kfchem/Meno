# PDFs, pictures and texts on the page

A specification of stage 4 (WORKSPACE.md, *Stages*): a PDF, a picture
and a text each a thing on the page, as a molecule is. Each is read
where it lies or in the column beside the canvas, and its parts - words,
figures - are taken out onto the page. Stage 5 - figures read as
structures - builds on it.

Written on 2026-10-09, before anything is built, and revised the same
day with the maintainer's answers. What is left to decide is at the end.

Judge it against [PURPOSE.md](PURPOSE.md). A chemist reads a paper to
find a molecule, how it was made and what was found about it. Here the
paper lies on the page beside that molecule. A figure from it sits
beside the structure drawn from it, and later, in stage 5, is drawn as
that structure. Moving between a PDF reader, a text editor and Meno
stops being part of the work.

## Decided by the maintainer (2026-10-09)

1. **PDFium, not pdf.js.** PDFium is the engine Chrome reads PDFs with.
   The maintainer chose it for how fast and how faithfully it draws;
   viewers built on pdf.js, as some publishers' have been, left a poor
   impression. No way of changing engines is to be kept: Meno is built
   on PDFium, for the best it can give.
2. **The best of what drawing with WebGL allows, joined to the
   workspace.** A PDF's pages are drawn on the canvas, not beside it.
   - Zoomed into, what a page holds comes up out of its preview.
   - Movement has depth: pages lift and settle as molecules rise.
   - Words selected in a PDF and dragged come away from it, moving, and
     become words on the page.

   It all follows Meno's own design, not another app's.
3. **Every file the workspace holds is a thing on the page**, which
   shows what it holds and through which its content is reached:
   - a PDF, its pages;
   - a text, its sheet;
   - a picture, itself;
   - a calculation's output, the molecule in 3D it gave - as it is now.

   Texts are drawn with WebGL as well, if that serves them better than
   HTML (*Texts*, below).
4. The answers to the first draft's questions:
   - **A PDF is read on the page, and in the column**, both.
   - **A figure is cut out by a drag.**
   - **Pictures from anywhere go on the page**: image files, the
     clipboard, and figures out of a PDF.
   - **A picture is drawn as a structure is**, in the drawing, and is
     moved, scaled and turned.
   - **Search looks in the PDF shown or in every PDF**, which of the two
     being chosen at the search field.
   - **PDFium runs in a process of its own**, and **is carried in the
     app**.
   - **Previews are made.** Every part of the interface is joined to
     every other.

## What a thing on the page is

- **It lies on the page** with the drawing and the molecules, in the
  order things were put there, and is handled as they are:
  - moved by a drag;
  - selected by a click, a box or a lasso (its middle inside), or
    Ctrl/⌘ and a click;
  - deleted, copied, cut and pasted with the rest of a selection;
  - undone.
- **Its name lies under it**, as a file's name lies under its icon,
  in the drawing's type.
- **It shows more of itself the nearer it is seen.** Far off it is a
  small sheet with its name; nearer, its first page or first lines come
  up, softly, then sharp; near enough, it is read where it lies.
- **It is opened beside the canvas** by a double-click, or *Read* in its
  right-click menu. Its content goes into the column, rising from where
  it lies on the page and settling there. Closed, the column's content
  goes back to it.
- **The two are one thing**:
  - the page the column shows is the page on top of the PDF on the
    canvas;
  - what is selected in one is selected in the other;
  - hovering a page in the column lights the PDF it belongs to.

## A PDF

### On the page

- **A stack of its pages**, the first on top, the others just under it.
  The stack is a little thicker the more pages it has, up to a few
  sheets' worth.
- **Read where it lies**:
  - Zoomed into, the top page's text and figures come up, sharp at
    any zoom.
  - The wheel or two fingers over the stack go to the next page and the
    one before, the top page lifting off and going under (*Movement*,
    below).
  - The right-click menu has *Spread pages*. The pages lift off the
    stack one after another and lie side by side on the page, in rows,
    to be read and compared at once. *Gather pages* puts them back.
- **Its figures and words are taken out from here** as from the column
  (*Taking things out*, below).

### In the column

- **Its pages one under another**, as wide as the column, scrolled
  there. A page number shows as it scrolls (*3 / 12*); a click on it asks
  for a page to go to.
- **Larger or smaller** by a pinch over the column, or Ctrl/⌘ with the
  wheel there - the column's own, never the canvas's. *Fit width* comes
  back with a double-click on the number. The column is as wide as its
  edge is dragged.
- **Its name among the texts' names** along the column's top. Closing it
  there closes the column's view of it; the PDF stays on the page.
- **Links in the PDF** work:
  - one to a figure, a reference or a section goes there, in the column
    or on the stack, and back with the system's Back keys (⌘[ on a Mac,
    Alt+← on Windows) or the mouse's back button;
  - one to a web page opens in the system's browser when it is clicked.

### Quick, then sharp

- **A page shows at once**, from a small picture of it, and the parts in
  view are then drawn at the screen's resolution, in tiles that fade in
  over it.
- **While a pinch or a zoom goes on**, the tiles there are scaled on the
  graphics card, and drawn again sharper once it stops. Nothing waits
  for PDFium.
- **Only what is in view is drawn**, nearest first, then the pages next
  in the way the view is going. A tile no longer wanted is dropped, not
  finished. Pages far out of view are let go, and drawn again when they
  come back.

### Text

- **A drag that starts on text selects text**, as in any reader: a
  double-click selects a word, a triple-click a line. ⌘C copies it, and
  the right-click menu has *Copy*.
- **PDFium says where each letter is**, and Meno selects and marks by
  that, on the stack and in the column alike.

### Search

- **⌘F** with the column or a PDF in front, or *Find in PDF…* in Meno's
  menu, opens a field at the column's top. It has two choices beside it,
  *This PDF* and *All PDFs*.
- **What it finds**:
  - each place is marked on the pages, in the column and on the stacks;
  - the places are counted (*3 of 12*);
  - Enter goes to the next, Shift+Enter to the one before, and Esc
    closes the field.
- **With *All PDFs***, the places are listed under each PDF's name, and
  going to one shows that PDF.
- **How letters are matched**: by PDFium's own search, without regard to
  case. Whether a word broken across a line's end is found is measured in
  the trial (step 0), and made so if PDFium does not find it.

## Taking things out

- **Words**: a selection dragged lifts off the page, the words rising
  toward the viewer and following the pointer.
  - Let go on the canvas, they settle there as words on the page (as
    #177 made them), in the drawing's type.
  - Let go anywhere else, they go back.
  - The words keep where they came from: *Show in the PDF* in their
    right-click menu shows that place, marked for a moment.
- **A figure**: a drag that starts where there is no text - on a figure,
  or in a margin - draws a box (question 1). Let go, the box stays,
  outlined.
  - Dragged on, the box lifts off as a picture and follows the pointer,
    and settles where it is let go.
  - Its right-click menu has *Put on the page*, which places it beside
    what is in view, clear of what is there, as a new molecule in 3D is
    placed, and *Copy picture*.
  - Esc, or a click elsewhere, lets the box go.
- **A picture taken out is drawn from the PDF itself**, not from the
  screen, at the resolution Settings, *Files*, sets for copied pictures
  (600 dpi by default). It is as sharp as the figure was printed.
- **Tied to where it came from**: a picture keeps which PDF, which page
  and which box, and its right-click menu has *Show in the PDF*.

## A picture

- **From anywhere**: a figure taken out of a PDF, an image file (PNG,
  JPEG) opened or dropped, or a picture pasted from the clipboard, such
  as a screenshot.
- **Drawn as a structure is**: in the drawing, in the order things were
  put there. A picture is never drawn over a molecule in 3D.
- **Moved, scaled and turned.** It is selected as a structure is, and
  the selection's frame and handles scale and turn it. A picture keeps
  its proportions.
- **Saved** in the workspace as the file it is (`files/<sha256>`). The
  workspace keeps its place, size, turn and source.
- **Read as a structure in stage 5**, from its right-click menu.

## A text

- **A sheet on the page** with its first lines, in Meno's monospaced
  type, and its name under it. A text opened, dropped or made new
  (*New text*) lies on the page as well as being in the column. Seen
  nearer, more of it shows, and it is read where it lies.
- **A calculation's output keeps its molecule as its body**: the
  molecule's *Show <name>* opens the output in the column, rising from
  the molecule. No sheet is laid beside it.
- **Drawn with WebGL** (question 4): the column's text and the sheet's
  alike, so that a text can rise from the page into the column as a PDF
  does.
  - Only the lines in view are set, so a calculation's log of a hundred
    thousand lines scrolls as a short file does.
  - Typing, IME included, goes into a field kept out of sight, and
    Meno draws the text, the caret, the selection and what the IME is
    composing. (Words on the page are typed today in a field shown over
    the page, in HTML; they would be typed this way too.)
- **Coloured by what it is**, where that is known (question 3):
  - a Python script, JSON or XML by their usual grammars;
  - a calculation's input or output by what its plugin says of its kind
    - its keywords, its numbers, and its warnings and errors - so that
    Meno knows no program's format of itself.

## Movement

All movement follows Meno's rule: nothing jumps, and linked parts move
together, in short eased transitions.

- **Depth.** A page or a picture taken up rises toward the viewer, a
  little larger and with a soft shadow under it, and settles as it is
  let go. The same perspective is used for a moment as for a molecule
  rising out of the drawing (#174): only what rises is seen in
  perspective, and the page is not.
- **Turning a page** on the stack: the top page lifts at its corner,
  goes up and over, and lies under the others; or comes back.
- **Spreading and gathering**: the pages lift off one after another and
  go to their places in a short wave; gathered, they come back the same
  way.
- **Into the column and back**: a page or a sheet rises from where it
  lies and goes into the column as it opens, growing to the column's
  width; closed, it goes back down to its place.
- **Coming up into view**: zoomed into, a page's content fades up from
  the soft picture to the sharp one, tile by tile, never flickering.

## How it is built

### PDFium

- **PDFium** (the PDFium Authors, BSD-3-Clause, with some parts under
  Apache-2.0) reads and draws the PDF. It is part of Meno, not a plugin:
  it needs no Python and nothing fetched while Meno runs.
- **The build**: PDFium's own, as Chrome builds it, from the prebuilt
  libraries of `bblanchon/pdfium-binaries` (their build scripts MIT).
  It is built without JavaScript and without XFA forms
  (`pdf_enable_v8 = false`, `pdf_enable_xfa = false`). The release and
  each file's SHA-256 are pinned in Meno, and fetched and checked when
  Meno is built, never kept in the repository - as uv and pixi are
  pinned.
- **What PDFium carries within itself**: the fourteen standard fonts a
  PDF may name without carrying them, and the CMaps for Chinese,
  Japanese and Korean text. Nothing besides is bundled for it. A font a
  PDF names but does not carry is found among the system's, as Chrome
  finds it, and after them among Meno's own (IBM Plex Sans, Mono and
  Sans JP).
- **Reached from Rust** through `pdfium-render` (MIT or Apache-2.0).
- **What Meno asks of it**: a part of a page drawn at a scale, its text
  with where each letter is, search, links, and what a page is made of
  - paths, text and pictures - which stage 5 reads.

### Where it runs

- **In a process of its own**, as calculations' jobs are (`Meno --job`).
  Meno starts itself as a PDF reader, `Meno --pdf`, when a workspace
  first shows a PDF, and talks to it by its standard input and output.
- **A PDF that breaks PDFium breaks that process only.** The PDF says
  so on the page and in the column, with *Open again*; Meno, and the
  work not yet saved, go on. Chrome keeps PDFium apart for the same
  reason.
- **It draws on threads of its own**, a page at a time, each part in a
  way that can be stopped. A request no longer wanted is dropped.
- **Pictures come back as they are drawn**: the colours of each pixel,
  in the order a WebGL texture takes them (PDFium's
  `FPDF_REVERSE_BYTE_ORDER`), with no image format in between. They go
  to the window as bytes, not as text (Tauri's binary response).

### One canvas

- **The column is drawn on the canvas**: one WebGL canvas spans the
  workspace and the column, each with a view of its own (a camera, and
  the part of the canvas it draws in). A page or a text can then go from
  one to the other as one moving thing. The column's header - its names,
  its buttons - stays as it is, in HTML, in Meno's look.
- **A page is a sheet with textures**, its tiles. A text is set with the
  type the drawing's labels are set with (troika), line by line as it
  comes into view.
- **Selection, search and the caret** are drawn over them, from where
  PDFium says the letters are, or where the text's type sets them.
- **A picture is a texture on a sheet**. A figure at 600 dpi - a whole
  A4 page is about 5000 × 7000 pixels - fits within what the graphics
  card takes.
- **In the document**, as texts are:
  - `pdfs`: each PDF's name, the SHA-256 of its file, its place on the
    page, which page is on top or whether its pages are spread, and
    where the column was left;
  - `pictures`: each picture's file, place, size, turn and source;
  - each text, as now, with its place on the page.

  Undo, saving, the clipboard's record and the workspace file all carry
  them.

### Size

- **PDFium's library**: 7.3 MB on a Mac (Apple silicon), about 3.4 MB
  compressed (2.5 MB as the Windows installer compresses). For Windows
  and Linux, the prebuilt archives are 3.9 and 3.8 MB.
- **What it adds**: about 3 MB to each system's download (the Mac's
  disk image was 8.1 MB for 0.1.8, the Windows installer 6.6 MB), and
  about 7 MB once installed.
- **The text colouring** (question 3): some tens of kilobytes for each
  grammar.

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
- **Its text and pictures go no further than the page, the column and
  the clipboard**, as the chemist moves them.

### Platforms

- **The same PDFium on every system**: the library for macOS (Apple
  silicon), Windows (x64) and Linux (x64), from the same release.
- **Carried in the app**:
  - on a Mac, inside the app, signed with it;
  - on Windows, beside Meno's program, with a line in the installer's
    hook for when it is renamed or goes (RELEASING.md);
  - on Linux, beside it as well.

  The trial checks that a Mac app signed as Meno's is (ad hoc, with the
  hardened runtime) loads it.

## In order

0. **A trial, kept off main**, its numbers and a recording shown before
   step 1:
   - PDFium bound, in its own process, on the Mac and on Windows, and the
     Mac's signed app loading it;
   - how long a paper's first page, and a tile, take to show, and how
     fast pictures go from the process to the window;
   - one canvas drawing the workspace and the column, a page going from
     one to the other;
   - whether PDFium's search finds a word broken across a line's end.
1. **A PDF on the page**: opened, dropped or pasted, held and saved; its
   stack, coming up as it is zoomed into, its pages turned and spread.
2. **The column on the canvas**: a PDF read there, joined to its stack;
   its page number and links; texts still in HTML beside it until step 5.
3. **Text and search**: selecting and copying, on the stack and in the
   column; *This PDF* and *All PDFs*; words dragged out onto the page.
4. **Pictures**: from image files and the clipboard, and figures dragged
   out of a PDF; moved, scaled, turned, tied to their source.
5. **Texts drawn with WebGL**: a text's sheet on the page, the column's
   text and its typing drawn by Meno, and its colouring.

Each step is a pull request of its own, checked in the built app on the
Mac (and on Windows for steps 0, 1 and 5). Then stage 5: a picture read
as a structure (MolScribe or DECIMER, in the sidecar, with consent for
their weights), and the paths and text a PDF's vector figure is made of
read straight from PDFium, each drawn by Meno's engine beside it, tied
to it.

## Not yet

- **Pictures in Export and *Copy picture*** of the drawing. They come
  when it is clear how a picture should go into a picture of the
  drawing (EMF, SVG, PDF).
- **Annotating a PDF** (highlights, notes on its pages). Notes go on the
  page beside it instead.
- **Opening a PDF from the web**, by its address or its DOI.

## Questions

1. **A drag that starts on text selects text; one that starts where
   there is no text draws a box** - is that the drag meant for cutting
   out a figure? A figure's own labels (an *OH*, an *Me*) are text too:
   a drag that starts on one of them, inside a figure, selects it. To
   start a box there, the drag starts on the figure's lines or between
   its letters - or PDFium's knowledge of where a figure's paths and
   pictures are draws the box from anywhere inside it (recommended, to
   be tried in step 3).
2. **Words dragged out become words on the page** (recommended), the
   kind #177 made. Or a text of their own in the workspace, a sheet with
   them in it?
3. **Which colouring**: Lezer (MIT; the parsers CodeMirror is built
   on, which take up an edit without starting over; recommended), or
   Shiki (MIT; the grammars VS Code colours with, the closest to what a
   chemist sees in an editor, but larger and slower on very long files)?
   Either gives Meno the parts of the text and their kinds, which Meno
   draws itself.
4. **Texts drawn with WebGL** (recommended, step 5), as the first part
   of this answer asked? Or kept in HTML in the column, with only the
   sheet on the page in WebGL? Drawn by Meno, a text can rise from the
   page into the column as a PDF does, and a long log scrolls as fast as
   a short one; but Meno then draws the caret, the selection and what
   an IME is composing itself, which no part of Meno does yet.
