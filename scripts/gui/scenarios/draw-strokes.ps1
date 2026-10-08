# Draw by dragging bonds out of atoms, every way the pointer map gives.
#
# - A double-click that drags draws one bond out of an atom; near 120
#   degrees from the bond already there it snaps to that, and an arc grows
#   out of the atom to say so.
# - A bond led onto an atom within reach closes onto it: the preview shows
#   the ring closed before the button comes up.
# - A drag on an atom moves it, and no bond is drawn.
# - A pause in a double-click's drag lets the bond go where the pointer is,
#   off the grid.
# - One undo takes the last bond away.
#
# Coordinates are read off the opened shot on a Mac (2560x1720), at the
# size a file opens at since #56; read again for 0.1.8, when every X was
# 25 px right of its atom (the drift #139 found in charges.ps1). The
# presses missed the atoms by that much, and passed only while a
# double-click on empty space drew a chain from the atom beside it; since
# #177 it opens Quick Add, and a drag from it moves the view.

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/strokes.mol"
Wait-MenoSettled | Out-Null
Save-Step "opened"

# Left ethane's upper carbon: a double-click that drags a bond straight up,
# 120° from the one there.
Invoke-MenoClick -X 747 -Y 877
Invoke-MenoDrag -FromX 747 -FromY 877 -ToX 750 -ToY 768 -Steps 12 -Count 2 -AtStep {
    param($i) if ($i -eq 12) { Start-Sleep -Milliseconds 250; Save-Step "bond-at-120" }
}
Wait-MenoSettled | Out-Null
Save-Step "bond-drawn"

# The open ring: from one loose end toward the other, which it closes onto.
Invoke-MenoClick -X 1155 -Y 852
Invoke-MenoDrag -FromX 1155 -FromY 852 -ToX 1229 -ToY 813 -Steps 12 -Count 2 -AtStep {
    param($i) if ($i -eq 12) { Start-Sleep -Milliseconds 200; Save-Step "closing" }
}
Wait-MenoSettled | Out-Null
Save-Step "ring-closed"

# Left ethane's lower carbon, dragged: it moves, and no bond is drawn.
Invoke-MenoDrag -FromX 663 -FromY 926 -ToX 663 -ToY 1011 -Steps 20
Wait-MenoSettled | Out-Null
Save-Step "moved"

# Right ethane's upper carbon: a bond led off the grid, held still at the
# end - it goes where the pointer is.
Invoke-MenoClick -X 1899 -Y 877
Invoke-MenoDrag -FromX 1899 -FromY 877 -ToX 1985 -ToY 760 -Steps 16 -Count 2 -AtStep {
    param($i) if ($i -eq 16) { Start-Sleep -Milliseconds 900 }
}
Wait-MenoSettled | Out-Null
Save-Step "bond-off-grid"

# One undo takes it away.
Send-MenoShortcut Z
Wait-MenoSettled | Out-Null
Save-Step "undone"
