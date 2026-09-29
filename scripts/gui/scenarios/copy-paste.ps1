# Copy, cut and paste a structure, by the keys and from the menus.
#
# - Ibuprofen from its SMILES; Cmd+A (Ctrl+A on Windows) selects it and
#   Cmd+C copies it.
# - Cmd+V pastes a copy where the pointer is, selected; Cmd+X cuts it again,
#   and a paste from the empty space's menu brings it back there.
# - A SMILES another program put on the clipboard as plain text pastes as
#   the structure it says (RDKit reads it, as the SMILES card does).
# - The last copy is left on the clipboard, for a look at what it holds.
#
# The pointer is put over empty space by coordinates read off a Mac's shots
# (2560x1720); the keys need none.

Start-Meno
Invoke-MenoClick -X 2103 -Y 40      # New…
Start-Sleep -Milliseconds 400
Invoke-MenoClick -X 1820 -Y 330     # Structure Canvas
Wait-MenoSettled | Out-Null
$c = Get-ClientSize
Invoke-MenoClick -X 498 -Y ($c.Height - 60)   # SMILES: its box takes the keys
Start-Sleep -Seconds 2
Send-MenoText "CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O" -CharMs 10
Send-MenoKey Enter
Start-Sleep -Seconds 8
Invoke-MenoClick -X 869 -Y 1298     # the SMILES card closed
Invoke-MenoWheel -X 1280 -Y 860 -Notches -3
Start-Sleep -Seconds 1
Wait-MenoSettled | Out-Null
Save-Step "loaded"

Send-MenoShortcut A
Send-MenoShortcut C
Send-MenoKey Escape
Move-MenoPointer -X 1900 -Y 1300
Send-MenoShortcut V
Wait-MenoSettled | Out-Null
Save-Step "pasted"

Send-MenoShortcut X
Wait-MenoSettled | Out-Null
Save-Step "cut"

Invoke-MenoClick -X 700 -Y 1300 -Right
Wait-MenoSettled | Out-Null
Save-Step "canvas-menu"
Invoke-MenoClick -X 800 -Y 1340     # Paste
Wait-MenoSettled | Out-Null
Save-Step "pasted-from-menu"

Set-Clipboard -Value "Oc1ccccc1"
Send-MenoKey Escape
Move-MenoPointer -X 1900 -Y 400
Send-MenoShortcut V
Start-Sleep -Seconds 3
Wait-MenoSettled | Out-Null
Save-Step "smiles-pasted"

Send-MenoShortcut C
Start-Sleep -Milliseconds 500
