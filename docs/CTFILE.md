# CTfiles: what Meno reads, draws and writes

Molfiles, SDfiles and Rxnfiles are read after BIOVIA's *CTfile Formats*
(Chemistry 2026), V2000 and V3000 alike, by a reader of Meno's own
(`src/lib/chem/ctfile.ts`). It keeps everything a file says about a
structure; how each part is drawn follows IUPAC's recommendations where they
say anything - *Graphical Representation Standards for Chemical Structure
Diagrams* (2008, GR-) and *Graphical Representation of Stereochemical
Configuration* (2006, ST-) - and Meno's own conventions, written down here,
where they do not. No other program's code or output is a reference for any
of it.

This is being built in steps; each says here what it adds.

## Reading

Everything below is read and kept (`CtMolecule`, carried on a file's
molecule as `Molecule.ct`):

- **Atoms**: coordinates; symbol, or a reserved type (R#, A, Q, X, M, R, *,
  LP) or an atom list (L, `[N,O]`, `NOT [S,Se]`); mass (V2000's mass
  difference and M  ISO, V3000's MASS); charge and radical (V2000's atom
  block and M  CHG / M  RAD, either of which clears the atom block's);
  valence; query hydrogen count; stereo care box; atom-atom mapping;
  inversion/retention; exact change; query substitution, unsaturation and
  ring bond counts; alias (A) and value (V) lines; Rgroup labels
  (M  RGP, RGROUPS) and attachment points and order (M  APO, M  AAL,
  ATTCHPT, ATTCHORD).
- **Bonds**: types 1 to 10 (single, double, triple, aromatic, the four
  query types, coordination, hydrogen); stereo (a single bond's up, down,
  either; a double bond's either - cis or trans, not known); topology;
  reacting centre; stereo care; V3000's haptic endpoints (ENDPTS with
  ATTACH=ALL or ANY) and display (DISP: COORD, DATIVE, HBOND1, HBOND2).
- **Sgroups** of every type - abbreviations (SUP, and the old G line),
  multiple groups, polymers (SRU, MON, MER, COP, CRO, MOD, GRA, ANY), mixtures
  and formulations (COM, MIX, FOR), generic and data Sgroups - with their
  atoms, crossing and containment bonds, labels, subtypes, connectivity,
  brackets and their style, expansion state, attachment points, parents,
  and a data Sgroup's field, data and display.
- **Collections** (V3000): enhanced stereo (MDLV30/STEABS, STERACn,
  STERELn, and the bond collections STEBABS, STEBRACn, STEBRELn),
  highlighting, a file's own.
- **The chiral flag**, link atoms, Rgroup definitions and their logic.
- **Rxnfiles**, V2000 (`$MOL` blocks) and V3000 (BEGIN REACTANT / PRODUCT /
  REAGENT blocks), their molecules in the file's order: reactants,
  products, then reagents.

Not read: V3000 3D blocks and templates (SCSR), RDfiles and XDfiles.

## Drawing

| What | How | Why |
|---|---|---|
| A double bond of either configuration | The double bond as it is, and a wavy bond on a single substituent beside it: never on a bond to another stereocentre; on both substituents of an end that has two, where no end has one free; none where the drawing shows no configuration anyway (a substituent straight on, or an end with none). | IUPAC ST-4.4 prefers this; it does not accept a crossed double bond for general use. |
| A hydrogen bond (type 10) | Dotted: round dots a line and a half wide, three line widths apart, at least three. | GR-1.8: partial bonds dotted, at least three dots; GR-1.3: gaps of 2 to 4 line widths. |
| A coordination bond shown as COORD | A plain line. | GR-1.7: coordination bonds plain; dashed not acceptable. |
| A coordination bond otherwise (type 9, or DATIVE) | A dative arrow, from the first atom to the second, as before. | |
| A query bond (types 5 to 8) | The first kind it stands for - single, or double for "double or aromatic" - labelled small beside its middle on the side with more room: S/D, S/A, D/A, Any. | GR-11.2: a bond's annotation by its middle, smaller than an atom's label. Meno's own labels. |

Neither a hydrogen bond nor a coordination bond takes a hydrogen from the
atoms at its ends, as a dative bond does not: an ammine stays NH3.

A bond that came from a file as one of these becomes an ordinary bond once
its order or stereo is changed in the editor.

## Writing

MOL files are written V2000 where that can say everything, and V3000
where it cannot: a coordination or hydrogen bond (V2000's types stop at 8),
and whether a coordination bond is shown plainly (DISP=COORD). A query bond
is written with its query type, and a double bond of either configuration
as V2000's stereo 3, V3000's CFG=2. What RDKit is asked about takes a query
bond as the bond it is drawn as.
