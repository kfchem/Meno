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
input, and photographs the window - including in the middle of a drag. It runs
on Windows and on macOS: `run.ps1` and the scenarios are shared, and only the
module underneath them is the platform's own.

## Running one

```
npm run tauri build                          # the app under test
pwsh scripts/gui/run.ps1 -Scenario open-and-look
pwsh scripts/gui/run.ps1 -Scenario drag-atoms
```

The same lines on either platform; `run.ps1` picks `MenoGui.psm1` on Windows
and `MenoGui.macOS.psm1` on a Mac. On a Mac, `pwsh` comes from
`brew install powershell`.

Shots land in `.gui-runs/<scenario>-<timestamp>/`, numbered in the order they
were taken. `-Out` puts them somewhere chosen, which is how two builds are
compared: run the old one into `before/`, the new one into `after/`, and diff
the pairs.

`-Exe` points at a different build - on a Mac, an `.app` bundle or a bare
executable - `-KeepOpen` leaves the app running to poke at by hand, and
`-Width`/`-Height` change the window size the scenarios are written against -
if you change it, the coordinates in them no longer mean anything.

## What it needs

**A desktop.** A logged-in session, unlocked. So this cannot run in CI, and
nothing in the workflow calls it. It will also take over the pointer and
keyboard for the length of a run.

**On Windows, nothing covering the window.** The picture is taken off the
screen rather than out of the window, because `PrintWindow` hands back a black
rectangle wherever the page is drawn with the GPU - which here is everything
worth looking at.

**On a Mac, two permissions**, and the window in front. The picture comes out
of the window itself (`screencapture -l`), GPU-drawn canvas and all, so a
window over Meno's does not end up in the shot; the app even goes on drawing
while it is completely covered. Input is another matter: it goes to the app in
front and to whatever window is under the pointer, not to Meno by name. So the
module brings Meno forward, and every input verb checks it is still there
first - if something else has taken the front, the run stops rather than type
into it.

macOS will not let a process capture another app's window or post input until
it has **Screen & System Audio Recording** and **Accessibility**, both in
System Settings > Privacy & Security. They are granted not to `pwsh` but to
the app the run answers to: the terminal it was started from, or for a run
started by Claude Code, that CLI's own bundled `claude.app` (under
`~/Library/Application Support/Claude/claude-code/<version>/`), not the Claude
desktop app. The module checks both before it does anything and names the app
it needs them for. When macOS offers to quit and reopen that app, "Later" is
enough: the next `pwsh` picks the permission up.

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
| `Invoke-MenoWheel -X -Y -Notches` | zoom; positive is away from you, in |
| `Send-MenoText`, `Send-MenoKey` | typing |
| `Get-ClientSize`, `Wait-MenoSettled` | |

Coordinates are pixels of the window's own screenshot, so they can be read
straight off one. Take `open-and-look` first on a new machine and read the
positions of the atoms you want out of `03-fitted.png`.

Two things worth knowing:

- **Drag in steps.** `Invoke-MenoDrag` breaks the travel up because the editor
  needs it: it waits a few pixels before it calls a press a drag at all, and
  the preview follows the moves rather than the release. `-AtStep` is where a
  mid-flight screenshot goes.
- **A scenario shares `run.ps1`'s scope.** It is dot-sourced, so a variable
  named like one of that script's own quietly replaces it. Names in a scenario
  should be its own.

## What a platform module provides

Besides the verbs above that come from it, `run.ps1` asks the module for:

| | |
|---|---|
| `Get-MenoBuild` | where `npm run tauri build` leaves the app on this platform |
| `Start-MenoProcess -Path` | start a build |
| `Close-MenoProcess -Process` | ask a running copy to quit, and put it down if it will not |
| `Get-MenoWindow`, `Set-MenoWindow` | find the main window; put it at a known size, in front |
| `Save-MenoShot -Path` | the window's picture |
| `Complete-FileDialog -Path` | the system's open dialog is up: choose this file in it |

Nothing else in `run.ps1` or a scenario should know which platform it is on.

## The coordinate spaces, and the one that bites

Windows hands a process that has not said otherwise a pretend desktop, scaled
down by the display's scaling factor. Window positions then come back in
pretend pixels while a screen grab is taken in real ones. On the 175% display
this was first written against, that put every capture a third of a window up
and to the left of where it should have been, with a strip of desktop down the
side - and a screenshot that looks *almost* right is worse than one that
obviously is not. `MenoGui.psm1` declares itself per-monitor DPI aware before
it measures anything, so every number here is a real pixel.

A Mac sizes windows and posts input in points, while a shot of a Retina
display comes out at two pixels to the point. Coordinates stay pixels of the
shot there too: `MenoGui.macOS.psm1` measures the ratio off a real shot when
it sizes the window, rather than asking the display, and converts to points at
the last moment. The window size is the one number in points - in pixels,
1280x860 would be under the app's minimum of 480 points high - so
`-Width 1280 -Height 860` is a 2560x1720 shot there. It follows that
coordinates read on one display do not carry over to another with a different
ratio, Windows at 175% included.

## On a Mac

What turned out not to be the same:

- **The open panel will not take a path until it has asked for one.** There is
  no name field to type into; `/` opens the "Go to the folder" sheet. The
  sheet takes a moment to arrive, and anything typed before it has does land
  in its field - but the sheet never looks it up, shows no suggestion, and
  Return then does nothing at all. `Complete-FileDialog` types `/`, waits for
  the sheet to exist as a window, types the rest, waits for the lookup to show,
  and presses Return twice: once to go there, which leaves the file selected,
  and once to open it. The panel and the sheet are windows of their own, so
  none of this is in a `Save-MenoShot` picture.
- **A click carries its own count.** Whoever posts it sets the click count, so
  a double click is two posts counted 1 and 2; left at 1, the page sees two
  single clicks and no `dblclick`.
- **A move with the button down is a drag event**, and posted as such.
- **A wheel notch is not a unit macOS has.** WebKit turns one line of scroll
  into 40 pixels, where Chromium, and so WebView2, gives a page 100 for a notch
  of a Windows wheel. A notch here is posted as 100 pixels, so `-Notches 5`
  asks the editor for the same zoom on both.
- **The picture is a WKWebView rather than WebView2**, so a shot from one
  platform is not a reference for the other: compare builds within a platform,
  not across.

## Known rough edges

- `Open-MenoFile` types a path into the system file dialog, which is the most
  brittle step here. The app takes no file on its command line; if it ever
  does, this becomes one argument to `Start-Meno` and the step goes away.
- `Wait-MenoSettled` compares whole screenshots, so a blinking cursor or a
  clock in shot would keep it waiting until it times out. Nothing in the app
  does that today.
- Scenario coordinates are written against one window size, one fixture and
  one display: the ones in `drag-atoms` were read on a Mac. A change to any of
  them means reading them off a fresh `open-and-look` run.
