; Meno's structures in Office documents (src/ole.rs): the class Word and
; PowerPoint find them by - for this user, as this installer installs for
; this user - written once Meno is in place and taken out before it goes.
; Meno writes and removes the keys itself, so the list of them is kept in
; one place.

!macro NSIS_HOOK_POSTINSTALL
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --register-ole'
  ; What earlier versions installed and this one no longer carries: an
  ; installer over them leaves their files where they were (seen in the
  ; v0.1.7 check). uv has been fetched when first needed since 0.1.7, and
  ; RDKit is a plugin of its own, in resources\plugins\rdkit. Only these
  ; files, each by name - nothing else in the folder is touched. A release
  ; that stops carrying a file adds it here (docs/RELEASING.md).
  Delete "$INSTDIR\resources\py\uv.exe"
  Delete "$INSTDIR\resources\py\requirements.chem.lock"
  Delete "$INSTDIR\resources\workers\chem_worker.py"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --unregister-ole'
!macroend
