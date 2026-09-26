# Draw a bond by double-click, undo it once, and look for what is left.
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

$c = Get-ClientSize
Invoke-MenoClick -X 31 -Y ($c.Height - 31)   # fit to content, bottom left
Wait-MenoSettled | Out-Null
Save-Step "fitted"

# Empty space above the chain; a double-click there draws a C-C bond whose
# first atom lands at about (1410, 230).
Invoke-MenoClick -X 1500 -Y 180 -Count 2
Wait-MenoSettled | Out-Null
Save-Step "drawn"

Send-MenoShortcut Z
Wait-MenoSettled | Out-Null
Save-Step "undone"

# Nothing should light here.
Move-MenoPointer -X 1410 -Y 230
Wait-MenoSettled | Out-Null
Save-Step "hover-where-it-was"
