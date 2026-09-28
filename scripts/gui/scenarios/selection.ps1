# Selecting, and what is done to a selection.
#
# Ibuprofen and ethanol from one SMILES (the second drawn close beside the
# first), then:
#
# - Ctrl-drag (Cmd on a Mac) from empty space: a box selects the ethanol;
#   dragging one of its atoms moves the whole of it; its handle turns it.
# - Right-click an atom, Select this structure: the whole ibuprofen; its
#   menu turns it over left to right - its hashed bond becomes a wedge, the
#   same molecule seen from behind - and undo puts it back.
# - A double-click on empty space that drags, with Alt (Option): a lasso
#   round the isobutyl group.
# - Ctrl-click one atom, Shift-click another: every atom and bond on the
#   way between them; Backspace deletes them, and undo brings them back.
# - Ctrl+A, then the clean-up key: every structure the selection is in.
#
# Coordinates are read off the shots on a Mac (2560x1720), in the view the
# fit button gives - the same every run, where a turn of the wheel is not.

Start-Meno
Invoke-MenoClick -X 2103 -Y 40      # New…
Start-Sleep -Milliseconds 400
Invoke-MenoClick -X 1820 -Y 330     # Structure Canvas
Wait-MenoSettled | Out-Null
$c = Get-ClientSize
Invoke-MenoClick -X 498 -Y ($c.Height - 60)   # SMILES: its box takes the keys
Start-Sleep -Seconds 2
Send-MenoText "CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O.OCC" -CharMs 10
Send-MenoKey Enter
Start-Sleep -Seconds 8
Invoke-MenoClick -X 869 -Y 1298     # the SMILES card closed
Invoke-MenoClick -X 60 -Y ($c.Height - 60)    # fit to content: the same view every run
Start-Sleep -Seconds 1
Wait-MenoSettled | Out-Null
Save-Step "loaded"

# a box round the ethanol
Invoke-MenoDrag -FromX 1888 -FromY 768 -ToX 2500 -ToY 1075 -Hold Shortcut
Wait-MenoSettled | Out-Null
Save-Step "box"

# its CH2 dragged: all of it goes
Invoke-MenoDrag -FromX 2258 -FromY 845 -ToX 1858 -ToY 1245 -Steps 16
Wait-MenoSettled | Out-Null
Save-Step "moved"

# its handle, above it, turned a quarter to the right about its middle
Invoke-MenoDrag -FromX 1856 -FromY 1070 -ToX 2093 -ToY 1307 -Via @(, @(2024, 1140)) -Steps 10
Wait-MenoSettled | Out-Null
Save-Step "turned"

Send-MenoKey Escape
Wait-MenoSettled | Out-Null

# the ibuprofen, from an atom's menu
Invoke-MenoClick -X 905 -Y 553 -Right
Wait-MenoSettled | Out-Null
Save-Step "atom-menu"
Invoke-MenoClick -X 1105 -Y 849     # Select this structure, below the charge items
Wait-MenoSettled | Out-Null
Save-Step "structure"

# the selection's menu, from empty space: turned over left to right
Invoke-MenoClick -X 1280 -Y 250 -Right
Wait-MenoSettled | Out-Null
Save-Step "selection-menu"
Invoke-MenoClick -X 1480 -Y 354     # Turn over left to right
Wait-MenoSettled | Out-Null
Save-Step "turned-over"
Send-MenoShortcut Z
Wait-MenoSettled | Out-Null
Send-MenoKey Escape
Wait-MenoSettled | Out-Null

# a lasso round the isobutyl group: a double-click that drags, with Alt
Invoke-MenoClick -X 40 -Y 470
Invoke-MenoDrag -FromX 40 -FromY 470 -Via @(@(560, 480), @(590, 640), @(420, 980), @(60, 980)) -ToX 30 -ToY 500 -Count 2 -Hold Alt -Steps 6
Wait-MenoSettled | Out-Null
Save-Step "lasso"
Send-MenoKey Escape

# one ring atom, and then the carboxyl carbon with Shift: the way between
Invoke-MenoClick -X 703 -Y 902 -Hold Shortcut
Invoke-MenoClick -X 1508 -Y 902 -Hold Shift
Wait-MenoSettled | Out-Null
Save-Step "path"
Send-MenoKey Backspace
Wait-MenoSettled | Out-Null
Save-Step "deleted"
Send-MenoShortcut Z
Wait-MenoSettled | Out-Null

# everything, and the clean-up key
Send-MenoShortcut A
Wait-MenoSettled | Out-Null
Save-Step "all"
Send-MenoShortcut K -Shift
Start-Sleep -Seconds 2
Wait-MenoSettled | Out-Null
Save-Step "cleaned"
