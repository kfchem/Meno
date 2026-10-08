# Workflows on the page

A specification of stage 6 (WORKSPACE.md, *Stages*): calculations built as
workflows and run, on the page itself. Written on 2026-10-08 at the
maintainer's request - *a detailed UI specification before anything is
built* - and revised the same day with their answers. Nothing here is
built yet. Judge it against [PURPOSE.md](PURPOSE.md): a procedure that
combines several methods, expressed in a form the chemist can read,
rearrange and run again, with its results beside the molecule it is about.

## Decided by the maintainer (2026-10-08)

1. **The workspace is the node editor.** There is no editor of its own: a
   molecule drawn on the page, boxed, is a workflow's input, and a
   calculation is a step added from Quick Add. *This is central to Meno's
   design from here on; it is specified in detail before it is built.*
2. **Meno is first a structure editor that is plain to use**; what more
   it does is reached as the chemist goes further. So Quick Add has **one
   button** for calculations, which opens to them; the drawing's four
   stay as they are.
3. **Meno defines the kinds of step; plugins fill them.** Plugins are to
   be fetched over the internet and made by anyone, and Meno cannot know
   all a plugin does. Only **plugins added** are shown: a step no plugin
   added fills is not offered.
4. **Conformers go through a workflow as ACCeL takes them** (the
   maintainer's own library, MIT): a box of entries, each a structure,
   worked through step after step. **Nothing becomes a conformer set by
   itself** (*Boxes of conformers*, below).
5. **What lies inside a box is what it holds**: a structure moved into it
   joins it, one moved out leaves it.
6. **xTB first.** Programs installed separately - ORCA, Gaussian and
   others - are to be run later, through the same kinds of step.
7. **This computer only**, for now. A cluster or a remote machine comes
   later, in a stage of its own; nothing here shuts it out.
8. **A calculation running when Meno closes goes on.** Opened again, the
   workspace picks it up.
9. **The proposals are kept** for: boxing from the selection's port;
   results in a box to the right of their step; menus, not keys, to run;
   2D made 3D by a step of its own; jobs' files in Meno's data folder.
10. **The Workflow Builder tab goes, and ReactFlow with it.** The
    workspace's editor is built anew: neither the tab nor ReactFlow's
    code is looked at (*Licences*).

Still open: *Questions*, at the end.

## Words

- **Workflow** - what is wired together on one page: boxes and the steps
  between them.
- **Box** - a frame on the page, and what lies inside it. An *input* box
  is drawn by the chemist round what is there; a *result* box is made by
  a step, round what it gave.
- **Entry** - one structure in a box: a drawing, or a molecule in 3D,
  with what has been found of it (its energy, its population...), of a
  molecule (*a*, *b*), and in play or set aside.
- **Step** - one kind of calculation done to a box's entries, of a kind
  Meno defines (*Kinds of step*), filled by a plugin or by Meno.
- **Port** - where a wire starts or ends: a box gives from its right
  edge; a step takes on its left edge and gives on its right; a result
  box takes on its left edge.
- **Wire** - a line from a port that gives to a port that takes.
- **Run** - one time a step was carried out, and what it gave; a step
  keeps its runs.
- **Job** - a program running for a run, on this computer, in a folder
  of its own, its log written as it goes.
- **Procedure** - a chain of steps without their data, saved to be put
  down again.

## What is on the page

![A workflow on the page](workflows/3-on-the-page.svg)

A workflow lives among everything else on the page - drawings, molecules
in 3D, arrows, text - and is made of three things:

- **Boxes.** A thin rounded frame, with its name on a tab at its top left
  - *Input*, or what a step made (*Conformers*, *Optimised*) - and how
  many entries it holds (*1 structure*, *81 conformers*, *23 of 81*). It
  gives from a port on its right edge, half-way down; a result box takes
  on its left edge too.
- **Steps.** A small card: an icon and what the step does (*Optimise*);
  below it, who does it and how (*xTB · GFN2-xTB*); a rule; and what it is
  doing (*Ready*, *Running 0:42*). It takes on its left edge and gives on
  its right.
- **Wires.** Curves from port to port, leaving and arriving level, in the
  frames' grey; while a step runs, the wire into it moves (a slow dash),
  and goes still when it is done.

They are page items, as an arrow or a molecule in 3D is: they lie on the
page, at the page's scale, zoom and pan with it, and are saved with it. A
step's words stay legible as it zooms: where they would be smaller than 9
px on the screen, the card shows its icon and its state's mark alone.

### How each looks

| Part | Look |
| --- | --- |
| Box | 1.2 px line, `#8c959f`, radius 10 px at 100 %; no fill. Its tab: white, the same line, radius 10 px; the name in 11.5 px semibold, the count in grey. |
| Box, under the pointer | lit from behind in the highlight's blue at 7 %, as anything under the pointer is (EDITOR-2D.md, *Hover, then act*) |
| Box, selected | its line in the highlight's blue |
| Step | white card, 1 px `gh-line`, radius 12 px, the frames chip's soft shadow; 160 to 250 px wide at 100 %; title 13.5 px semibold, who and how 11.5 px grey, state 11.5 px in the state's colour (*States*), the log's last line 10.5 px monospaced |
| Port | 11 px circle, white, 1.6 px line in the frames' grey; filled with the highlight's blue while a wire is drawn from it, and on the ports that would take it |
| Wire | 1.6 px, the frames' grey; running: the highlight's blue, a dash moving along it at about 20 px a second; failed: the attention colour |

Everything comes and goes as Meno's things do (theme/motion): a box, a
step and a wire fade in where they are put; a state changes its words
and colour in a short ease; nothing jumps. Moved, they move as the
pointer does; put back by an undo, they glide back.

## Making a workflow

### An input: boxing molecules

![Boxing a molecule as an input](workflows/1-boxing.svg)

1. **Box the molecules** with the gesture that selects today: a long
   press on empty space and a drag (or Ctrl/⌘ and a drag).
2. **A port shows on the selection's right edge** while it holds whole
   structures or molecules in 3D (a few atoms of a structure make no
   input). It fades in once the box is drawn; nothing else of the
   selection changes, and a chemist who never pulls it never meets a
   workflow.
3. **Pull a wire out of the port.** The selection's frame stays, as an
   *Input* box; a wire follows the pointer.
   - Let go on empty space: Quick Add opens there, at the kinds of step
     that take what the box gives. A step chosen is put down there, wired.
   - Let go on a step's port: wired to it.
   - Let go where nothing takes it, or Escape: the wire goes, and the box
     stays.
4. **Or from the menu**: right-click the selection, *Box as input*.

**What a box holds is what lies inside its frame** (decided):

- a structure or a molecule in 3D whose middle is inside the frame is in
  the box; dragged in, it joins; dragged out, it leaves;
- the frame is the box's own: its tab drags it, with all it holds; its
  edges and corners drag to size it;
- drawn on, a structure stays in it, and the frame grows to keep it
  inside if it would reach past it;
- *Delete box* (right-click its tab) takes the frame away and leaves what
  it held; a box left empty stays, empty, until it is deleted.

A box's entries are its structures and molecules in 3D, in the order they
lie (top to bottom, left to right). Each is an entry of its own molecule
(*a*, *b*...), unless the box was made by a step that says otherwise
(*Boxes of conformers*).

### Kinds of step

Meno defines the kinds of step - what each takes, what it gives, and how
it is shown - so that steps join whoever fills them; plugins fill them,
each with its own options. A plugin cannot bring a kind of its own; a
new kind comes with Meno, as a new role does (PLUGINS.md, *Roles*).

| Kind | Icon | Takes | Gives |
| --- | --- | --- | --- |
| 3D structure | a cube | structures | molecules in 3D |
| Conformers | three rings, stacked | molecules in 3D | each molecule's conformers |
| Optimise | a curve down to its lowest point | molecules in 3D | each optimised, its path as frames |
| Energy | E and a level | molecules in 3D | each with its energy |
| Frequencies | a wave | molecules in 3D | each with its vibrations and thermal corrections |
| Energy window | a band | entries with energies | those within it of their molecule's lowest; the rest set aside |
| Duplicates | two rings, one dashed | molecules in 3D | each unlike the others kept; the rest set aside |
| Populations | falling bars | entries with energies | each with its Boltzmann population within its molecule |

The first five run a program; the last three work on a box's entries
alone, and are filled by Meno's own part, or a plugin's (*Questions*,
ACCeL). More kinds come with Meno as they are needed - a free energy from
an energy and its corrections, the lowest of each molecule, a template
input written out - each specified before it is built.

### A step: from Quick Add

![Quick Add with one button for calculations](workflows/2-quick-add.svg)

- **Quick Add keeps its four** - bond, text, reaction arrow, "+" - and
  gains **one button**: *Calculations*, a small graph of two joined
  boxes, after a thin rule.
- **Pressed, it opens** a panel below the row, of the kinds of step,
  each an icon, named on hover with who fills it (*Optimise · xTB*):
  first those that run a program, then those that work on entries.
- **Only what something added fills is there.** With no plugin that runs
  a program added, the panel shows the kinds Meno fills itself; a kind
  nothing fills is not shown, and nothing is shown of plugins not added.
- **A wire let go on empty space** opens Quick Add already at
  *Calculations*, showing only the kinds that take what the wire
  carries.
- **Who fills a kind** where more than one plugin added can is chosen in
  the step (*Its options*); Settings says who by default, as *Molecules
  in 3D* does for conformers today.

### Wires

- **Drawn** from a port that gives to one that takes, or the other way: a
  press on a port and a drag. While it is drawn, the ports that would
  take it are lit, the others dimmed.
- **What may join**: what a port gives to a port that takes it (*Kinds of
  step*). Nothing is converted on the way: a box of structures does not
  go into *Optimise* - a *3D structure* step goes between, on the page.
- **One port may feed several steps**; a port that takes, one wire. A
  wire drawn to a port that has one replaces it.
- **Deleted** by Delete or Backspace with the pointer on it, or its menu;
  dragging its end off a port and letting go on nothing deletes it too.

### Its options

![A step's options](workflows/4-options.svg)

A click on a step opens it, in place, to its options - as a molecule's
frames chip opens to its slider:

- the plugin's own options, drawn in Meno's general form (`lib/options`,
  as Export draws a writer's): for xTB, its method (GFN2-xTB, GFN1-xTB,
  GFN-FF), solvent, optimisation level; for *Energy window*, the window
  (3 kcal/mol);
- the charge and the unpaired electrons, read from each entry as Export
  reads them, and changeable;
- who fills it, where more than one added can;
- *Show log* and *Show files* once it has run.

Another click on its title, Escape, or a press elsewhere closes it. The
last options chosen for each kind are what a new step starts with.

## Boxes of conformers

![A box of conformers through a workflow](workflows/7-conformers.svg)

Conformers go through a workflow as ACCeL's `Box` takes them (decided):

- **A box holds entries**, each a structure, **of a molecule** (*a*,
  *b*...) - as ACCeL's labels group a molecule's conformers - with what
  has been found of it: energies, corrections, populations.
- **Steps work entry by entry**, or molecule by molecule where the kind
  says so: *Optimise* each entry; *Energy window* within each molecule;
  *Populations* within each molecule.
- **What a step sets aside is kept**, struck through in its box, not
  deleted - as ACCeL's entries are switched off - so that a window made
  wider brings it back on the next run.
- **Nothing becomes a conformer set by itself** (decided): entries are
  conformers of one molecule only where a step that makes conformers says
  so (*Conformers*), or the chemist does (*These are conformers of one
  molecule*, on a box's menu). Two structures boxed together are two
  molecules, however alike; a file of many geometries read is not a
  conformer set because it has many; a box is never merged into one
  molecule with frames unless a step makes it so.
- **On the page**, a box's entries of one molecule that are its
  conformers are shown as that molecule in 3D with its conformers as
  frames - the conformer set Meno draws today, its chip saying the
  entry, its energy and population; entries set aside are not among its
  frames, and are listed, struck through, in its box. Entries of
  different molecules are separate molecules in the box.

## Running

### Starting and stopping

| From | What |
| --- | --- |
| A step's menu (right-click) | *Run* - this step, and first any step before it that has not run or has changed |
| | *Run from here* - this step and every step after it |
| | *Stop* - while it is waiting or running |
| | *Show log*, *Show files*, *Options…*, *Delete step* |
| Meno's menu | *Run all* - every step on the page that has not run or has changed, in order |
| | *Stop all* |

No key starts a run (decided: menus, at first). Steps run in the order
their wires give; steps that do not depend on one another may run at
once (*Several at once*).

### States

![A step's states](workflows/5-states.svg)

| State | Mark and colour | What the card says |
| --- | --- | --- |
| Ready | ○ grey | *Ready* |
| Waiting | ◔ grey | *Waiting · 2nd* - its place in the queue |
| Running | ● the highlight's blue | *Running 1:12*, or *Running · 7 of 81*; the log's last line under it; a thin bar where the program says how far it is |
| Done | ✓ the accent | *2:03 · −42.10871 Eh*, or *81 of 81*, or *23 kept* - how long, and the number the step is for |
| Failed | ! the attention colour | *Failed* - and the line of the log that says why; *3 of 81 failed* where some entries did |
| Stopped | ■ grey | *Stopped after 0:31* |
| Changed | ↻ grey, the card dimmed | *Changed · run again* - its options, or what comes into it, changed since its run; its results stay, dimmed |

### The log

*Show log* opens the job's log in the workspace's column of texts (PR
#172), updating while the job runs - its last lines kept in view unless
the chemist scrolled up. A step of many entries has a log for each,
named for the entry. A log is a text of the workspace like any other.

### Results

![A step's results and its log](workflows/6-results.svg)

When a run is done, what it gave comes in as a result box to the right
of the step, wired from it (decided):

- **Optimise**: each entry as optimised, its path as frames, the energy
  of each frame - what an optimisation read from a file shows today;
- **Conformers**: each molecule's conformers, as entries of that
  molecule (*Boxes of conformers*);
- **Energy**, **Frequencies**: the entries, each with its energy, or its
  vibrations and thermal corrections;
- **Energy window**, **Duplicates**, **Populations**: the same entries,
  some set aside, or with their populations.

They are calculation results as Meno knows them: the frames chip,
pointing at atoms, the lists. The box's port feeds the next step.

Run again, a step replaces its result box's entries with the new run's,
gliding to where they now are; earlier runs are kept in the step (*Runs*,
under its options: when, with what options, how long, the number it
gave), and one can be shown again.

### Several at once

- By default **one job runs at a time** on this computer; others wait,
  in the order they were started. Settings, *Calculations*: how many at
  once, and how many cores each may use.
- A step on many entries makes one job for each, queued as above - each
  with its own log, a failure its own (*Questions*, 2).

### When Meno closes

- **Jobs go on** (decided). Closing with jobs waiting or running says how
  many will go on, and asks nothing else; those waiting start in turn,
  without Meno.
- **Opened again**, a workspace looks at its jobs: done - their results
  come in, as if Meno had been open; still running - shown running, with
  the time since they started; gone without finishing (the computer was
  restarted, say) - *Stopped*, with their logs.
- A workspace never saved keeps its jobs with the unsaved workspace Meno
  reopens; closed without saving, its jobs are stopped - said in the
  dialog that asks about saving.

### Undo

- Making a workflow is editing the page: a box, a step, a wire, options -
  each an undo step, as anything drawn.
- A run is not undone. Its results coming in is one step: an undo takes
  them away (the step shows its earlier run, or none), a redo brings them
  back. The job's files stay until the step is deleted.
- Deleting a step that is running asks first; it stops it.

## Saving and sharing

- **The workspace keeps it all** (`.meno`, FILE-IO.md, *The workspace
  file*): boxes, steps, wires, options; each run - when, with what
  options, which program and version, how it ended; logs and outputs, as
  files kept by their SHA-256; results as entries on the page.
- **Shared, a workspace is the procedure with its results**: opened
  elsewhere, everything is there to read, and runs again where the same
  plugins are added.
- **A procedure** - steps without their data - is made from a selection
  of steps: right-click, *Save as procedure…*, named. Procedures are
  listed in Quick Add's *Calculations* after the kinds, one icon each;
  put down, the chain comes, wired, ready for an input. Shared as a file
  of their own (later in order).

## Programs and plugins

- **xTB**: a plugin whose environment is made by pixi from conda-forge -
  xtb 6.7.1, LGPL-3.0, for macOS (Apple silicon and Intel), Windows and
  Linux. It fills *Optimise*, *Energy* and *Frequencies*, and reads its
  own outputs back.
- **CREST**: *Conformers*, by a plugin made the same way - crest 3.0.2,
  LGPL-3.0, on conda-forge for macOS and Linux only. On Windows it cannot
  be added, and *Conformers* is filled by RDKit alone there.
- **Programs installed separately** (ORCA, Gaussian): never fetched by
  Meno - their licences do not allow it. A plugin's manifest says which
  program it needs and how to know it (its name, and the line its version
  is read from); Meno looks for it where the system finds programs, and
  Settings, *Plugins*, shows where - or *Not found - Locate…*. A step
  whose program is not found says so on its card, and its *Run* opens
  that place.

### What changes in the contract

- **The manifest says which kinds of step a plugin fills** (`steps`): for
  each, the kind (one of Meno's), its options in the general form, and
  the programs it needs. Meno shows a kind only where something added
  fills it.
- **Two new requests** (PLUGINS.md, *The contract*):
  - `prepare {step, entries, options}` - each job's files and the command
    that runs it;
  - `collect {step, files}` - what a job gave, read from its files, in
    Meno's own forms.
- **Meno runs the jobs, not the plugin**: its own executable in a job
  mode, started apart from Meno so that it outlives it, runs the command
  in the job's folder - in the plugin's environment, or with the program
  found - writes the log, and records how it ended. Every job is
  started, stopped and logged the same way, whoever prepared it; *Stop*
  stops the program and everything it started (a process group on macOS
  and Linux, a job object on Windows).
- **Steps on entries alone** (*Energy window*...) are a plain request,
  `run {step, entries, options}`, answered at once, no job made.
- **Jobs reach no network**, as the plugins' workers do not.
- **A job's folder** is in Meno's data folder (`jobs/<id>/`; decided):
  its input, its log, its outputs, Meno's record of it. *Show files*
  opens it. Its outputs are kept in the workspace when they come in; the
  folder goes when its step is deleted, or by *Settings, Calculations,
  Clear finished jobs' files*.

## Licences

- **The editor is Meno's own.** Boxes, steps, wires, ports and their
  drawing on the page are written for Meno, from this specification,
  with no code taken or read from ReactFlow, the Workflow Builder tab, or
  any other node editor (the maintainer, 2026-10-08). ReactFlow
  (`@xyflow/react`) leaves Meno's dependencies with the tab.
- **Programs are run, not linked**: xTB and CREST (LGPL-3.0) are
  separate programs in their plugins' environments, fetched from
  conda-forge with the chemist's consent; their licences are shown in
  Settings, *Plugins*, as each plugin's is.
- **Programs installed separately** are found, never fetched or shipped.
- **ACCeL** (MIT), if it fills kinds of step, is a plugin fetched from
  PyPI like any other, its notice shown with it; its ideas are the
  maintainer's to take into Meno's own part, its code is not copied
  without its notice (Meno is Apache-2.0).
- **Figures and icons** here and in the app are Meno's own.

## Where this leaves what is there

- **The Workflow Builder tab** and ReactFlow go (decided), once boxes and
  steps are on the page - or before; nothing here uses them.
- **Export** keeps writing a calculation's input (Gaussian's, through
  its plugin) for a chemist who runs it elsewhere.
- **Opening an output** keeps working as now; an output read is a
  molecule like any other, and can be boxed.
- **RDKit's conformers** (*3D structures*) stay as they are; in a
  workflow, RDKit fills *3D structure* and *Conformers*.

## In order

1. **Boxes, steps and wires on the page**, none run: the document's new
   items, their drawing, boxing from the selection, wires, Quick Add's
   *Calculations*, menus, undo, saving; Meno's own *Energy window*,
   *Duplicates* and *Populations* - the first steps that do something,
   on entries read from files. The Workflow Builder tab and ReactFlow
   removed.
2. **The job runner**: Meno's job mode, started apart; logs; *Stop*;
   picking jobs up when a workspace is opened; Settings, *Calculations*.
3. **xTB**: its plugin; *Optimise*, *Energy*, *Frequencies*; results
   coming in. The first workflow that runs: input → 3D structure →
   optimise.
4. **Chains**: running in order, *Run from here*, *Run all*, *Changed*,
   runs kept, several at once.
5. **Conformers**: RDKit's in a step, then CREST (macOS and Linux).
6. **Programs installed separately**: ORCA and Gaussian - finding them,
   their steps, reading their outputs.
7. **Procedures**: saved, put down again, shared as a file.

Each is a PR of its own, checked on the Mac; Windows is asked only where
something is Windows' own (the job object; xTB's Windows build).

## Questions

1. **ACCeL as the back end** of the steps on entries (*Energy window*,
   *Duplicates*, *Populations*, and more of `Box`'s methods later) - or
   Meno's own part?
   - *ACCeL, as a plugin*: the maintainer's own, tried on real ensembles,
     and its RMSD with symmetry (`calc_symm`, `map_numbers`) is the hard
     part of *Duplicates*; it grows with ACCeL. But every step starts
     Python, its `Box` works from files, and entries go to it and back as
     data.
   - *Meno's own*: the window and populations are a few lines, at once,
     with no process; *Duplicates* needs an RMSD that knows symmetric
     atoms, written for Meno from a published method.
   - *Both*: Meno defines the kinds, ACCeL fills them first as a plugin,
     and Meno fills the light ones itself where waiting for Python would
     be felt. (My recommendation.)
2. **One job for each entry, or one for all.** A step on 81 conformers
   can run its program 81 times - 81 jobs, each its own log, a failure
   its own, run several at once (proposed) - or once, for all 81, where
   the program takes a file of many (`crest --mdopt` optimises an
   ensemble in one run; ORCA can chain jobs in one input): one start,
   one log, all or nothing. The plugin could say which its program does
   best.
3. **Conformers of one molecule, said by the chemist.** *These are
   conformers of one molecule* on a box's menu (proposed), for entries
   read from files - or only steps make conformers?
