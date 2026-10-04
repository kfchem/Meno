# Charges, every way the editor sets them, and as it draws them.
#
# - + over the left ethane's upper carbon: a carbocation, its charge circled
#   beside the bare vertex; - twice over its lower carbon: 2-, plainly.
# - The right ethane's upper carbon typed NH3+: NH3 and its circled +.
# - A ring atom's right-click menu: charge one up and down, an unpaired
#   electron.
# - From a SMILES: nitromethane's N+ and O-, an acetate, sodium, a
#   quaternary ammonium, and a 13C.
#
# Coordinates are read off the opened shot on a Mac (2560x1720), at the
# size a file opens at since #56. The SMILES needs RDKit, set up on first use.
Start-Meno
Open-MenoFile "$PSScriptRoot/../fixtures/strokes.mol"
Wait-MenoSettled | Out-Null
# left ethane's upper carbon: + (a carbocation); its lower carbon: - twice
Move-MenoPointer -X 772 -Y 877
Send-MenoText "+"
Move-MenoPointer -X 686 -Y 925
Send-MenoText "-"
Send-MenoText "-"
Start-Sleep -Milliseconds 400
Save-Step "keys"
# the right ethane's upper carbon: typed NH3+
Move-MenoPointer -X 1924 -Y 877
Send-MenoText "n"
Start-Sleep -Milliseconds 300
Send-MenoText "H3+"
Send-MenoKey Enter
Start-Sleep -Milliseconds 400
Save-Step "typed"
# a ring atom's menu
Invoke-MenoClick -X 1347 -Y 948 -Right
Start-Sleep -Milliseconds 400
Save-Step "menu"
Send-MenoKey Escape
# charged molecules from a SMILES
Invoke-MenoMenu "SMILES..."
Start-Sleep -Seconds 2
Send-MenoText "C[N+](=O)[O-].CC(=O)[O-].[Na+].CC[N+](C)(C)C.[13CH3]C" -CharMs 10
Send-MenoKey Enter
Start-Sleep -Seconds 10
Save-Step "smiles"
