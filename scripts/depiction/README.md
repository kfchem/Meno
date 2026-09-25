# The depiction sheet

```
npm run depiction            # writes .depiction/index.html
npm run depiction -- --open  # and opens it
```

Every case in `cases.ts`, drawn with the app's own layout code and rendered to
SVG, laid out as one page to look at.

## Why it exists

The 2D canvas cannot be exercised without a browser — react-three-fiber and
troika both need one — so there is no way to see this drawing headlessly
except to render the same layout another way. `createSVG` does that from the
same `layoutMolecule` output the canvas draws, which is what makes the sheet
worth trusting.

It is not a substitute for the real app. Text is measured with the viewer's
fonts rather than troika's, and edges are drawn by an SVG renderer rather than
WebGL, so letters sit a little differently and the antialiasing is not the
same. **The shapes are the same**, and the shapes are where the faults have
been: every geometry fault found in the 2D work so far was found here first,
and confirmed on a real build afterwards.

For the part that only exists while a pointer is down, see `scripts/gui/`.

## Sweeps, and why a single example is not enough

A *sweep* case is one arrangement drawn over and over with a number changed —
an angle, usually. Faults in this code have a habit of living in a narrow band
of some parameter and looking perfectly fine on either side of it. The wedge
join that was broken between 141° and 149° drew correctly at 140° and at 150°;
it was found by putting the angles side by side, and it would not have been
found by drawing one wedge.

So when something here is wrong, the useful move is to add the parameter it is
wrong in to `cases.ts` and look at the row, rather than to add the one
structure that showed it.

## Files are read the way the app reads them

A *file* case goes through `readMoleculesFromText` and `moleculesToEditorModel`
— the app's own import path — rather than being read as coordinates. The
importer scales every structure so its average bond comes out at
`NOMINAL_BOND_LENGTH`, and a case built from raw file coordinates is a case
about a molecule nobody will ever see. This cost real time once: a fault was
diagnosed against unscaled coordinates, "fixed", and was still there.

Note that a file carries no double-bond mode and no wedge orientation. Those
are choices the editor makes later, so a file case cannot show them; the
sweeps cover them instead.

## Keeping it honest

`npm run typecheck` checks this against the app's chemistry code
(`scripts/depiction/tsconfig.json`). That is deliberate: a tool that quietly
drifts out of step with what it is meant to be checking is worse than no tool,
and this one has already been caught reading two fields off a bond that a file
never sets.

The output is not checked in — `.depiction/` is ignored. Regenerate it; it
takes a moment.
