# Label font metrics

```
npm run font-metrics -- <font.ttf|otf> <EXPORT_NAME> "<Family>" > src/lib/chem/fonts/<name>.ts
```

Writes what a label is placed and cleared by, for one font file: how far each
printable ASCII character advances the pen, and the convex outline of its ink.
Register the module in `src/lib/chem/fonts/index.ts` and add the family to
`LABEL_TYPEFACES` in `src/lib/chem/styleFields.ts`; the canvas also needs the
font file itself (`src/ui/features/StructureEditor/labelFont.ts`).

Curves are followed in eight steps; the hull is eased to fewer sides by
dropping any corner standing less than 15 units (of a 2048-unit em) off the
line between its neighbours, so it cuts into the ink by no more than that -
under a hundredth of an em, a tenth of a point in a 10 pt label.

`src/lib/chem/arial.ts` predates the tool; regenerated, its hulls pick
slightly different corners along curves but agree within that tolerance.
