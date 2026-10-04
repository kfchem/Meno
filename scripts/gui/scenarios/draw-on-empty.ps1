# Draw on an empty canvas: the first bond is where it was double-clicked, at
# a size to work at, and the view does not move.
#
# It used to be neither: drawing the first bond fitted the view to it -
# zooming until one bond filled the window - but moved the camera's zoom
# without its position, so the bond ended up off screen until the fit
# button was pressed. And fitting still zoomed one bond to fill the window.
# Meno starts on an empty structure canvas, so nothing has to be opened.

Start-Meno
Wait-MenoSettled | Out-Null          # Meno starts on a structure canvas
Save-Step "empty"

Invoke-MenoClick -X 1280 -Y 900 -Count 2
Wait-MenoSettled | Out-Null
Save-Step "first-bond"

Invoke-MenoClick -X 700 -Y 500 -Count 2
Wait-MenoSettled | Out-Null
Save-Step "second-bond"

Send-MenoShortcut 1                          # fit to content
Wait-MenoSettled | Out-Null
Save-Step "fitted"
