# Plugins

What Meno does through plugins and what it does itself, how the chemist
chooses which plugin does what, and when plugins run. This is a plan,
written on 2026-10-06 with the maintainer, and its decisions are made. How files come in and go out under it is in
[`FILE-IO.md`](./FILE-IO.md).

## The maintainer's direction (2026-10-06)

- **Plugins are not only about files.** They will add features too:
  running calculations, connecting to structure search, and more. Meno
  itself is not a plugin; it comes with its own parts.
- **The chemist chooses the program.** Which program reads a kind of file
  - Meno's own parser or cclib for XYZ - and which parses SMILES, assigns
  R/S, or searches conformers.
- **RDKit is a plugin of its own**, independent like the others.
- **Nothing is kept running ahead of need.** Every plugin starts when it
  is first needed and stays for the session, as RDKit does now. More
  plugins kept running would only take more memory.
- **A fingerprint might lead into a workflow**, and so might other such
  results.
- **Plugins are completely independent, and Meno builds only a general
  place to take them in** (the maintainer, 2026-10-06, not for the first
  time). Plugins will be distributed and fetched over the internet.
  Meno names no plugin and knows no program: what a plugin is, does and
  reads is the plugin's own data, in its folder.

## Words

- **Role** - a job Meno defines, with what it is given and what it gives,
  in Meno's forms. Examples: read a kind of file, write one, parse
  SMILES, assign R/S, make conformers, make a fingerprint.
- **Plugin** - an independent package that fills roles: a folder of its
  own (*A plugin's folder*). It has an environment of its own, made from a
  lock with the network's consent, a worker, and a manifest: data saying
  which roles it fills and which kinds of file it brings, reads and
  writes, read when it is added (FILE-IO.md). It shares no code with
  another plugin, and knows of none (the maintainer, 2026-10-06).
  Examples: RDKit, cclib, PySCF.
- **Meno's own parts** - what comes with Meno and fills roles too: its
  readers and writers of MOL, SDF, RXN, XYZ and cube, its SVG, its 2D
  layout. Meno's own parts are not plugins and are not listed as plugins.
- **Assignment** - which plugin, or Meno, fills a role. It is the
  chemist's choice, made in Settings, with a default Meno ships.
- **Core role** - a role Meno's everyday drawing rests on: parsing
  SMILES, the chemical checks, R/S and E/Z, a structure in 3D.

## Roles

| Group | Role | Filled today by |
| --- | --- | --- |
| Files | read a kind; write a kind | Meno (MOL, SDF, RXN, XYZ, cube; MOL, SDF, RXN, SVG), cclib, PySCF - see FILE-IO.md |
| Chemistry (core) | SMILES to a structure, and back | RDKit (its worker's `from_smiles`, `to_smiles`) |
| Chemistry (core) | the checks: hydrogens, valence, aromatic rings | RDKit (`analyse`) |
| Chemistry (core) | stereo labels: R/S, E/Z | RDKit (`analyse`, CIP labeller) |
| Chemistry (core) | stereoisomers of what is left open | RDKit (`open_stereo`) |
| Molecules in 3D (core) | a structure in 3D, and its conformers | RDKit (`conformers`) |
| Molecules in 3D (core) | a drawing of a structure in 3D | RDKit (`drawing_of`) |
| Drawing | 2D layout, Clean-up | Meno (its layout engine) |
| Later | fingerprints, similarity | - |
| Later | structure search in outside databases | - |
| Later | running a calculation, an input written and an output read back | - |

Meno defines the roles and their contracts. A plugin says, in its
manifest, which roles it fills. A new kind of role comes with Meno, and a
new plugin for an existing role needs no change to Meno.

## A plugin's folder

Everything a plugin is lives in one folder, named by its id:

```
<id>/
  manifest.json      what it is, its version, licence and home; what makes
                     its environment and runs its worker; the kinds of file
                     it brings (id, name, extensions, marks) and those it
                     reads, by id - its own, or Meno's
  worker.py          its worker, spoken to in JSON lines under the contract
  requirements.lock  its environment, made by uv from PyPI - or, where it
  (or pixi.toml and  needs conda-forge, by pixi
   pixi.lock)
```

- **Meno carries some for now**, in `src-tauri/resources/plugins/`, and
  finds them there: no code of Meno's names one. Those fetched over the
  internet later will be folders of the same kind; how Meno trusts a list
  fetched online is decided then.
- **Kinds are shared by id, not by code.** Two plugins that read Gaussian's
  output each bring the kind `gaussian`, with its name and marks, and Meno
  puts them together. A plugin reads only the kinds it brings and Meno's
  own.
- **Meno checks every manifest as data**, wherever it came from: its id,
  its lock and worker in its folder (the backend allows nothing else), its
  marks as text of some length, and no mark that one of Meno's own sample
  files holds.

## Several plugins, one role

- **One plugin fills a role at a time**: the one assigned. The others that
  could are offered in the same place.
- **For reading a file, others may add to it.** The assigned reader reads
  the file. Others the chemist adds for that kind read it as well, and
  their results join under their names, as an NBO plugin's would join
  cclib's. See FILE-IO.md.
- **A role's options** - a conformer search's method and its settings, a
  calculation input's method and basis - are declared by the plugin in a
  general form: a choice, a number, a text or a switch, each with a label
  and a default. Meno draws them and remembers the chemist's last
  choices. The form, its drawing and the remembering are in place, used
  first by Meno's own writers in Export (`lib/options.ts`, FILE-IO.md).

## When plugins run

**As built** (step 6, `lib/roles/worker.ts`): RDKit is a plugin, a folder
of its own (`resources/plugins/rdkit/`), its manifest saying the roles it
fills.

- **Setting it up.** Its environment (`plugin-rdkit`, from its lock, made
  by uv) is set up the first time a role it fills is needed - SMILES, a
  structure in 3D, R and S - asking first for the network. Once the
  chemist takes it away in *Plugins* it is not set up of itself again: a
  role it fills says to add it there (the maintainer, 2026-10-06).
- **Starting it.** Once set up, the worker starts the first time it is
  asked for, not when Meno starts. In practice that is as soon as a
  structure is drawn, since the chemical checks run by themselves once
  it is at hand (`useChemMarks`, `chemAtHand`). Its first import may
  take a while; up to 90 s is allowed.
- **Keeping it.** It is then kept for the session. If it stops, the next
  request starts it again.
- **In Settings.** *Plugins* lists it with the others, to add or take
  away. *Chemistry* says whether it is running, set up and to start when
  a structure is drawn, not set up, or taken away; it and *Molecules in
  3D* say who fills each of their roles, a choice where more than one
  plugin fills it (`plugins.roles` in the settings).
- **Its name is the plugin's.** What Meno says while it sets up or starts
  - "Setting up RDKit…" - and the consent it asks for take the plugin's
  name and description from its manifest; no code of Meno's names it.

The calculation readers start the same way, on first use, and are stopped
only when taken away or when Meno quits. Every plugin's environment is
named for it, `plugin-<id>` (the maintainer, 2026-10-06); those made before
under other names are left where they were.

**As planned, the same for every plugin** (the maintainer, 2026-10-06:
no plugin is kept running ahead of need):

- **Set up** the first time something needs it, asking first for the
  network.
- **Started** the first time it is asked for. Nothing starts with Meno.
- **Kept** for the session, and started again if it stops.
- **Stopped** when it is taken away, or when Meno quits.

RDKit is an ordinary plugin. It is in use all day only because, by
default, it fills the core roles, and so it is asked for as soon as a
structure is drawn. A core role with no plugin installed says what to
add, as reading an output with no reader does today.

## Two faces of a role

Every role has the same contract wherever it is used:

- **Directly** - a menu command, Settings, opening a file;
- **as a step in a workflow** - its input and output in Meno's forms, so
  that steps join. A fingerprint feeds a similarity search; a conformer
  set feeds a calculation; an output is read back.

A plugin that fills a new role adds a step to the workflow editor as well
as a command. This is what PURPOSE.md asks for: a procedure that combines
several methods and outside tools, that can be read, rearranged and run
again.

## The contract

The same for every plugin and for Meno's own parts:

- **Known by its id.** It also has a version and a shown name. What a
  plugin gave - results, files - keeps the id and the version. The name is
  looked up only to show it.
- **Requests, one answer each, an error an answer:**
  - `ping` - its name and version;
  - `read`, `ask`, `write` - the file roles, and `probe` - whether a file
    is of a kind it registered (FILE-IO.md);
  - `run {role, input, options}` - every other role.
- **Molecules cross it in one form, the record's.** That is atoms,
  bonds, coordinates in 2D or 3D, charge, isotope, stereo,
  and a molecule's charge and multiplicity: Meno's own form, checked by
  Meno's own reader on the way in. RDKit today is given V3000 molfiles,
  and would take the record instead.
- **Keeps nothing between requests**; what it needs is sent each time.
- **Gives data, never code or markup**, in Meno's units, checked by Meno.
- **Runs apart from the page:**
  - a plugin in its own process and environment;
  - Meno's own parts all in a web worker, giving coordinates back in
    buffers - decided once the measurements were seen (FILE-IO.md,
    *Response*).

## Settings

- **Plugins.** A tab of its own that lists every plugin on offer, added or not:
  - what roles it fills, by name - the kinds of file it reads and writes
    among them;
  - its version, licence and home;
  - Add, and Remove.

  Meno is not in it.
- **Files.** The tab named for files (FILE-IO.md) holds, for each kind
  of file, who reads it, who else adds to it, and who writes it. Meno's
  own parts show there as "Meno".
- **The other roles are chosen where they are used:**
  - in *Chemistry*, who parses SMILES, checks a structure and assigns R/S;
  - in *Molecules in 3D*, who makes a structure in 3D and its conformers,
    and by what method;
  - in a workflow step, who runs it, defaulting to the choice in Settings.
- **What, never how** (the maintainer's rule): a choice names the program
  and the method a chemist would name, never how Meno talks to it.

## Decided

By the maintainer, 2026-10-06:

1. **No plugin is kept running ahead of need.** Every plugin runs as RDKit
   does now: started when first needed, kept for the session.
2. **The other roles are chosen where they are used** (*Chemistry*,
   *Molecules in 3D*, a workflow step), not in the Plugins tab. The
   Plugins tab says what each plugin offers.
3. **RDKit can be taken away like any plugin.** The core features then
   say what to add.
4. **Molecules cross the contract in the record's form**, RDKit
   included. *Revised by the maintainer on 2026-10-06, as step 6 was
   built:* chemistry plugins are given and give back MOL blocks, as RDKit
   always was. Meno keeps its MOL writer for Export and the clipboard
   anyway, and only Meno can write out its abbreviations - by its
   dictionary - so a record sent instead would be a MOL block written as
   JSON, its conversion copied into every plugin. The record stays Meno's
   own form: the clipboard, Office, the workspace.
5. **The tabs are named "Plugins", and "Files"** for the per-kind choices.
6. **Kinds of file are registered by plugins** in their manifests, so that
   a plugin can read a program Meno does not know (FILE-IO.md) - and only
   by them: Meno knows no program, and lists a program's kind only while
   a plugin that reads it is added.
7. **Plugins are completely independent**, each a folder of its own, and
   will be fetched over the internet; Meno builds only the general place
   to take them in.
8. **A file no plugin added reads, but one on offer would, names that
   plugin** - against the ideal, but needed for those new to Meno.

## In order

After the files (FILE-IO.md's order, steps 2 to 5):

1. **RDKit as a plugin** (FILE-IO.md's step 6; built). It gets its own
   entry in the list. Its roles are named, and it is assigned to the core
   roles by default, started when first needed as now. Molecules reach it
   as MOL blocks (decision 4, revised). The choices go in *Chemistry* and
   *Molecules in 3D*, with RDKit as the only plugin at first.
2. **New roles, each with a plugin that fills it:** fingerprints into
   the workflow, a structure search, running a calculation.
