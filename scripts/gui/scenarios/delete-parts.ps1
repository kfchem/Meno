# Delete an atom with the key, a bond from the menu at the pointer, and undo.
#
# A carbon is only there as the meeting of its bonds, so one left with none
# goes too; what is left of the chain must look drawn, not torn. The menu is
# the mouse-only way to the same thing: a right-click on a bond, then the
# Delete icon at the right end of its row of icons.
#
# Coordinates are read off the fitted shot on a Mac (2560x1720): fitted
# with Ctrl/Cmd+1, so the view is the same whatever size a file opens at.

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/depiction-check.mol"
Send-MenoShortcut 1                          # fit to content
Move-MenoPointer -X 1280 -Y 1500
Wait-MenoSettled | Out-Null
Save-Step "fitted"

# The middle carbon of the pentane chain, top left; Backspace deletes it.
Move-MenoPointer -X 790 -Y 538
Move-MenoPointer -X 794 -Y 535
Start-Sleep -Milliseconds 300
Send-MenoKey Backspace
Wait-MenoSettled | Out-Null
Save-Step "atom-deleted"

# The first bond of what is left, from the menu: a right-click on it, then
# Delete, at the right end of the icons along the menu's top (the menu 240
# px wide, its icons 36 px square inside a border of 1 and padding of 4).
Move-MenoPointer -X 537 -Y 490
Move-MenoPointer -X 541 -Y 487
Start-Sleep -Milliseconds 300
Invoke-MenoClick -X 541 -Y 487 -Right
Wait-MenoSettled | Out-Null
Save-Step "menu"
Invoke-MenoClick -X 975 -Y 533
Wait-MenoSettled | Out-Null
Save-Step "bond-deleted"

# Each deletion is one step.
Send-MenoShortcut Z
Wait-MenoSettled | Out-Null
Save-Step "bond-back"
Send-MenoShortcut Z
Wait-MenoSettled | Out-Null
Save-Step "atom-back"
