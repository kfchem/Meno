# Draw a chain from empty space (Quick Add's), undo it once, and look for what is left.
#
# A drawing gesture is one undo step: a single Ctrl/Cmd+Z takes all of it
# away. What used to be left behind - the two new carbons, without their
# bond - draws nothing at all, so the picture alone cannot tell. Hovering
# where an atom was can: the hover ring lights on any atom, drawn or not.
#
# The coordinates are read the same way as drag-atoms' - off 03-fitted.png
# from open-and-look, on a Mac.

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/depiction-check.mol"

Send-MenoShortcut 1                          # fit to content
Wait-MenoSettled | Out-Null
Save-Step "fitted"

# Empty space above the chain; Quick Add's chain there starts one at the
# point, traced with the button up some two bonds to the right and ended by
# a click.
Invoke-MenoQuickAdd -X 1500 -Y 180 -Item Chain
Move-MenoPointerAlong -Path @(@(1560, 180), @(1620, 180), @(1680, 180), @(1740, 180), @(1800, 180), @(1860, 180))
Invoke-MenoClick -X 1860 -Y 180
Wait-MenoSettled | Out-Null
Save-Step "drawn"

Send-MenoShortcut Z
Wait-MenoSettled | Out-Null
Save-Step "undone"

# Nothing should light where the chain began.
Move-MenoPointer -X 1500 -Y 180
Wait-MenoSettled | Out-Null
Save-Step "hover-where-it-was"
