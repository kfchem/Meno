# Samples

Textbook structures and reactions, in the formats Meno reads, for the tests
and for the 3D node the workflow editor opens with. Each was made with RDKit
2026.03 from the SMILES below - 2D coordinates by its depictor, and the 3D
structure embedded (ETKDG, seed 20261001) and optimised with MMFF - so
each can be made again from this table.

| File | What | SMILES |
| --- | --- | --- |
| `cholesterol.sdf` | Cholesterol, 2D, with its wedges | `C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C` |
| `cholesterol.xyz` | The same, 3D, with its hydrogens | |
| `cholesterol.pdb` | The same 3D structure, as Meno's PDB writer writes it (`lib/chem/pdb.ts`): HETATM records and its bonds as CONECT records, from the XYZ file and the bonds its distances give | |
| `diels-alder.rxn` | Butadiene and maleic anhydride to the adduct | `C=CC=C.C1=CC(=O)OC1=O>>O=C1OC(=O)C2CC=CCC12` |
| `esterification.rxn` | Acetic acid and ethanol to ethyl acetate and water | `CC(=O)O.OCC>>CC(=O)OCC.O` |
