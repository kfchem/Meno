# Clean-up by Meno's own layout engine, and a SMILES drawn by it.
#
# - A taxol drawn anyhow, its wedges on: cleaned up, it comes out as the
#   engine draws it, every stereocentre as it was, in one undo step.
# - Cocaine from its SMILES: its tropane cage in perspective, a bond broken
#   where it passes behind another; its centres shown by the drawing itself
#   (with R/S on, RDKit reads them as 1R,2R,3S,5S). The SMILES needs RDKit,
#   set up on first use.
#
# R/S labels show if they are on (the R/S button; the setting stays), which
# this leaves alone. Coordinates are read off the shots on a Mac
# (2560x1720): the canvas's buttons, bottom left.

Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/messy-taxol.mol"
Wait-MenoSettled | Out-Null
Save-Step "messy"

$c = Get-ClientSize
$row = $c.Height - 60
Invoke-MenoClick -X 588 -Y $row          # Clean-up
Wait-MenoSettled | Out-Null
Save-Step "cleaned"

Send-MenoShortcut Z
Wait-MenoSettled | Out-Null
Save-Step "undone"
Send-MenoShortcut Z -Shift
Wait-MenoSettled | Out-Null

Invoke-MenoClick -X 498 -Y $row          # SMILES: its box takes the keys
Start-Sleep -Seconds 2
Send-MenoText "CN1[C@H]2CC[C@@H]1[C@H]([C@H](C2)OC(=O)C3=CC=CC=C3)C(=O)OC" -CharMs 10
Send-MenoKey Enter
Start-Sleep -Seconds 10
Save-Step "cocaine"
