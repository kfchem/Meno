# Draw by dragging bonds out of atoms, every way the pointer map gives.
#
# - A drag from an atom draws one bond; near 120 degrees from the bond
#   already there it snaps to that, and an arc grows out of the atom to say
#   so.
# - A bond led onto an atom within reach closes onto it: the preview shows
#   the ring closed before the button comes up.
# - A press held still lifts an atom, and the drag then moves it.
# - A double-click that drags draws a chain, an atom for every bond length
#   the pointer goes, zigzagging; a pause lays down the bond it is on. The
#   whole chain is one undo step.
#
# Coordinates are read off the opened shot on a Mac (2560x1720).

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/strokes.mol"
Wait-MenoSettled | Out-Null
Save-Step "opened"

# Left ethane's upper carbon: a bond straight up, 120° from the one there.
Invoke-MenoDrag -FromX 270 -FromY 856 -ToX 276 -ToY 650 -Steps 12 -AtStep {
    param($i) if ($i -eq 12) { Start-Sleep -Milliseconds 250; Save-Step "bond-at-120" }
}
Wait-MenoSettled | Out-Null
Save-Step "bond-drawn"

# The open ring: from one loose end toward the other, which it closes onto.
Invoke-MenoDrag -FromX 1044 -FromY 808 -ToX 1185 -ToY 735 -Steps 12 -AtStep {
    param($i) if ($i -eq 12) { Start-Sleep -Milliseconds 200; Save-Step "closing" }
}
Wait-MenoSettled | Out-Null
Save-Step "ring-closed"

# Left ethane's lower carbon: held still first (the first step is under the
# drag threshold), then dragged - it moves, and no bond is drawn.
Invoke-MenoDrag -FromX 111 -FromY 948 -ToX 111 -ToY 1110 -Steps 40 -AtStep {
    param($i) if ($i -eq 1) { Start-Sleep -Milliseconds 700 }
}
Wait-MenoSettled | Out-Null
Save-Step "moved"

# The bond drawn first, its new top carbon: a double-click that drags off
# to the right, a chain - the usual zigzag along the stroke; a pause on the
# way lays down the bond it is on.
Invoke-MenoClick -X 270 -Y 674
Invoke-MenoDrag -FromX 270 -FromY 674 -ToX 1000 -ToY 690 -Steps 40 -Count 2 -AtStep {
    param($i)
    if ($i -eq 22) { Save-Step "chain-under-way" }
    if ($i -eq 30) { Start-Sleep -Milliseconds 700 }
}
Wait-MenoSettled | Out-Null
Save-Step "chain-drawn"

# One undo takes the whole chain away.
Send-MenoShortcut Z
Wait-MenoSettled | Out-Null
Save-Step "chain-undone"
