# Delete an atom with the key, a bond from the menu at the pointer, and undo.
#
# A carbon is only there as the meeting of its bonds, so one left with none
# goes too; what is left of the chain must look drawn, not torn. The menu is
# the mouse-only way to the same thing: a right-click on a bond, then its
# first item.
#
# Coordinates are read off the opened shot on a Mac (2560x1720), with the
# fixture opened as it fits by itself.

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/depiction-check.mol"
Wait-MenoSettled | Out-Null
Save-Step "opened"

# The middle carbon of the pentane chain, top left; Backspace deletes it.
Move-MenoPointer -X 784 -Y 540
Move-MenoPointer -X 788 -Y 538
Start-Sleep -Milliseconds 300
Send-MenoKey Backspace
Wait-MenoSettled | Out-Null
Save-Step "atom-deleted"

# The first bond of what is left, from the menu: a right-click on it, then
# the first item, which sits just below and right of the pointer.
Move-MenoPointer -X 535 -Y 492
Move-MenoPointer -X 539 -Y 489
Start-Sleep -Milliseconds 300
Invoke-MenoClick -X 539 -Y 489 -Right
Wait-MenoSettled | Out-Null
Save-Step "menu"
Invoke-MenoClick -X 779 -Y 529
Wait-MenoSettled | Out-Null
Save-Step "bond-deleted"

# Each deletion is one step.
Send-MenoShortcut Z
Wait-MenoSettled | Out-Null
Save-Step "bond-back"
Send-MenoShortcut Z
Wait-MenoSettled | Out-Null
Save-Step "atom-back"
