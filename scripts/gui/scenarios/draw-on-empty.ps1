# Draw on an empty canvas: the first bond is where it was double-clicked, at
# a size to work at, and the view does not move.
#
# It used to be neither: drawing the first bond fitted the view to it -
# zooming until one bond filled the window - but moved the camera's zoom
# without its position, so the bond ended up off screen until the fit
# button was pressed. And the fit button still zoomed one bond to fill the
# window. The New menu's items are read off a Mac's shot at 2560x1720.

Start-Meno
Invoke-MenoClick -X 2103 -Y 40      # New…
Start-Sleep -Milliseconds 400
Invoke-MenoClick -X 1820 -Y 330     # Structure Canvas
Wait-MenoSettled | Out-Null
Save-Step "empty"

Invoke-MenoClick -X 1280 -Y 900 -Count 2
Wait-MenoSettled | Out-Null
Save-Step "first-bond"

Invoke-MenoClick -X 700 -Y 500 -Count 2
Wait-MenoSettled | Out-Null
Save-Step "second-bond"

$c = Get-ClientSize
Invoke-MenoClick -X 60 -Y ($c.Height - 60)   # fit to content, bottom left
Wait-MenoSettled | Out-Null
Save-Step "fitted"
