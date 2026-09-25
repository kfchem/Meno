# Driving the app on a real desktop

Everything else in this repository checks the drawing without drawing it: the
layout is a pure function, so a test can ask where a line ended up and an SVG
can be rendered from the same code and compared by eye. That catches geometry,
and it caught nearly all of it.

What it cannot see is the part of the app that only exists while a pointer is
down. The preview that carries an atom under the cursor is drawn by a
different layer from the picture at rest, and that is where the regressions
have been: a cap left behind at the old position, a cap appearing where the
drawing has none, a wedge that squares off until it is dropped, bonds
vanishing at high zoom. A screenshot taken after the release shows none of it.

This harness starts the built app, works it with real pointer and keyboard
input, and photographs the window - including in the middle of a drag.

## Running one

```
npm run tauri build                          # the app under test
pwsh scripts/gui/run.ps1 -Scenario open-and-look
pwsh scripts/gui/run.ps1 -Scenario drag-atoms
```

Shots land in `.gui-runs/<scenario>-<timestamp>/`, numbered in the order they
were taken. `-Out` puts them somewhere chosen, which is how two builds are
compared: run the old one into `before/`, the new one into `after/`, and diff
the pairs.

`-Exe` points at a different build, `-KeepOpen` leaves the app running to poke
at by hand, and `-Width`/`-Height` change the window size the scenarios are
written against - if you change it, the coordinates in them no longer mean
anything.

## What it needs

**A desktop.** A logged-in session, unlocked, with nothing covering the
window. The picture is taken off the screen rather than out of the window,
because `PrintWindow` hands back a black rectangle wherever the page is drawn
with the GPU - which here is everything worth looking at. So this cannot run
in CI, and nothing in the workflow calls it.

It will also take over the pointer and keyboard for the length of a run.

## Writing a scenario

A scenario is a script in `scenarios/`, dot-sourced by `run.ps1` with these
available:

| | |
|---|---|
| `Start-Meno` | start the app under test, sized and in front |
| `Open-MenoFile -Path` | open a structure into an empty tab |
| `Save-Step -Name` | a numbered screenshot |
| `Invoke-MenoClick -X -Y [-Count]` | client coordinates, not screen |
| `Invoke-MenoDrag -FromX -FromY -ToX -ToY [-Steps] [-AtStep]` | press, travel, release |
| `Invoke-MenoWheel -X -Y -Notches` | zoom |
| `Send-MenoText`, `Send-MenoKey` | typing |
| `Get-ClientSize`, `Wait-MenoSettled` | |

Coordinates are in the window's own client space, so they can be read straight
off a screenshot. Take `open-and-look` first on a new machine and read the
positions of the atoms you want out of `03-fitted.png`.

Two things worth knowing:

- **Drag in steps.** `Invoke-MenoDrag` breaks the travel up because the editor
  needs it: it waits a few pixels before it calls a press a drag at all, and
  the preview follows the moves rather than the release. `-AtStep` is where a
  mid-flight screenshot goes.
- **A scenario shares `run.ps1`'s scope.** It is dot-sourced, so a variable
  named like one of that script's own quietly replaces it. Names in a scenario
  should be its own.

## The coordinate spaces, and the one that bites

Windows hands a process that has not said otherwise a pretend desktop, scaled
down by the display's scaling factor. Window positions then come back in
pretend pixels while a screen grab is taken in real ones. On the 175% display
this was first written against, that put every capture a third of a window up
and to the left of where it should have been, with a strip of desktop down the
side - and a screenshot that looks *almost* right is worse than one that
obviously is not. `MenoGui.psm1` declares itself per-monitor DPI aware before
it measures anything, so every number here is a real pixel.

## Doing the same on macOS

A Mac needs its own `MenoGui` - `screencapture -l <windowid>` for the picture,
AppleScript or `cliclick` for the pointer - but nothing above it should have
to change. The verbs in the table are the contract; `run.ps1` and the
scenarios are written against those and against client coordinates, not
against anything Windows-shaped.

Two things are not the same there. macOS will not let a process capture the
screen or send events until it is granted Screen Recording and Accessibility,
which is a dialog somebody has to answer by hand, once. And the picture is a
WKWebView rather than WebView2, so a shot from one platform is not a reference
for the other: compare builds within a platform, not across.

## Known rough edges

- `Open-MenoFile` types a path into the system file dialog, which is the most
  brittle step here. The app takes no file on its command line; if it ever
  does, this becomes one argument to `Start-Meno` and the step goes away.
- `Wait-MenoSettled` compares whole screenshots, so a blinking cursor or a
  clock in shot would keep it waiting until it times out. Nothing in the app
  does that today.
- Scenario coordinates are written against one window size and one fixture. A
  change to either means reading them off a fresh `open-and-look` run.
