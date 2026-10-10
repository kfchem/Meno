# Draw on an empty canvas: the first bond is where it was double-clicked, at
# a size to work at, and the view does not move. (Quick Add's chain starts
# one where it was opened, traced with the button up and ended by a click:
# led about a bond's length, it is one bond.)
#
# It used to be neither: drawing the first bond fitted the view to it -
# zooming until one bond filled the window - but moved the camera's zoom
# without its position, so the bond ended up off screen until the fit
# button was pressed. And fitting still zoomed one bond to fill the window.
# Meno starts on an empty workspace, so nothing has to be opened.

Start-Meno
Wait-MenoSettled | Out-Null          # Meno starts on a workspace
Save-Step "empty"

Invoke-MenoQuickAdd -X 1280 -Y 900 -Item Chain
Move-MenoPointerAlong -Path @(@(1305, 900), @(1330, 900), @(1355, 900), @(1380, 900))
Invoke-MenoClick -X 1380 -Y 900
Wait-MenoSettled | Out-Null
Save-Step "first-bond"

Invoke-MenoQuickAdd -X 700 -Y 500 -Item Chain
Move-MenoPointerAlong -Path @(@(725, 500), @(750, 500), @(775, 500), @(800, 500))
Invoke-MenoClick -X 800 -Y 500
Wait-MenoSettled | Out-Null
Save-Step "second-bond"

Send-MenoShortcut 1                          # fit to content
Wait-MenoSettled | Out-Null
Save-Step "fitted"
