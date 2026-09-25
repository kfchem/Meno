# Drag three kinds of atom and photograph each one mid-flight.
#
# The picture while an atom is moving is drawn by a different layer from the
# picture at rest, and that is where this app's regressions have been: a cap
# left behind at the old position, a cap appearing where the drawing has none,
# a wedge that squares off until it is dropped, bonds vanishing at high zoom.
# None of it shows in a screenshot taken after the release.
#
# The coordinates are read off 03-fitted.png from the open-and-look run, at
# the window size run.ps1 fixes. Take that run again if they ever drift.

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/depiction-check.mol"

$c = Get-ClientSize
Invoke-MenoClick -X 31 -Y ($c.Height - 31)   # fit to content, bottom left
Wait-MenoSettled | Out-Null
Save-Step "fitted"

# Shoot at two points along the way rather than one: the first is just past
# the threshold where the drag begins, the second well into it.
# Named for what it is, and not for anything run.ps1 keeps: a scenario is
# dot-sourced into that scope, where $shots and $script:Shots are one
# variable and the second assignment quietly wins.
$midDrag = { param($i) if ($i -eq 3) { Save-Step "$($script:What)-early" }
             if ($i -eq 9) { Save-Step "$($script:What)-late" } }

# A plain carbon in the middle of a chain. Nothing special about it, which is
# the point: whatever the others do, this one has to keep working.
$script:What = "chain"
Invoke-MenoDrag -FromX 262 -FromY 232 -ToX 262 -ToY 130 -AtStep $midDrag
Wait-MenoSettled | Out-Null
Save-Step "chain-dropped"

Invoke-MenoClick -X 31 -Y ($c.Height - 31)
Wait-MenoSettled | Out-Null

# The oxygen of an OH. A label takes the bond's end away with it, so no cap
# belongs here - neither at rest nor while it moves.
$script:What = "label"
Invoke-MenoDrag -FromX 617 -FromY 417 -ToX 730 -ToY 470 -AtStep $midDrag
Wait-MenoSettled | Out-Null
Save-Step "label-dropped"

Invoke-MenoClick -X 31 -Y ($c.Height - 31)
Wait-MenoSettled | Out-Null

# The stereocentre of the wedge cluster: three wedges and a hashed one meet
# here, and all four have to keep their shape for as long as it moves.
$script:What = "wedge"
Invoke-MenoDrag -FromX 172 -FromY 595 -ToX 250 -ToY 520 -AtStep $midDrag
Wait-MenoSettled | Out-Null
Save-Step "wedge-dropped"
