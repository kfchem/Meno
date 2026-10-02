import { useMemo } from "react";
import { NOMINAL_BOND_LENGTH } from "../../lib/chem/acs";
import { drawnSmiles, placedStructure } from "../../lib/chem/abbreviationPlace";
import type { GroupStructure } from "../../lib/chem/ligands";
import { styleOf } from "../../lib/chem/style";
import { useAppSettings } from "../../lib/settings/appSettings";
import { drawingSvg } from "../features/StructureEditor/fileActions";
import type { Model } from "../features/StructureEditor/store/types";

/** A structure, laid out by Meno: atoms with ids from 1, its bonds as the editor holds them. */
function modelOf(s: GroupStructure): Model {
  const placed = placedStructure(s, null, NOMINAL_BOND_LENGTH);
  return {
    atoms: placed.atoms.map((a, i) => ({ ...a, id: i + 1, r: 0.9 })),
    bonds: placed.bonds.map((b, k) => ({
      id: placed.atoms.length + k + 1,
      a: b.a1 + 1,
      b: b.a2 + 1,
      order: b.order,
      stereo: b.stereo ?? ("none" as const),
      ...(b.stereoOrient ? { stereoOrient: b.stereoOrient } : {}),
      ...(b.coordination ? { coordination: true } : {}),
      ...(b.endpoints ? { endpoints: b.endpoints.map((e) => e + 1), attach: "all" as const } : {}),
    })),
  };
}

/**
 * What an abbreviation stands for, drawn by Meno in the application's
 * drawing style - from its SMILES, a "*" where it is attached, or as a
 * structure made for it (a ligand bound to M; a reagent, its stereocentres
 * wedged) - or nothing, for SMILES that does not read. `scale` enlarges
 * the picture from the style's own size.
 */
export default function AbbreviationPicture({
  smiles,
  structure,
  scale = 1.5,
  className,
}: {
  smiles?: string;
  structure?: GroupStructure;
  scale?: number;
  className?: string;
}) {
  const choice = useAppSettings((s) => s.drawingStyle);
  const svg = useMemo(() => {
    let model: Model | null = null;
    if (structure) model = modelOf(structure);
    else if (smiles) {
      const drawn = drawnSmiles(smiles, NOMINAL_BOND_LENGTH);
      if (drawn) {
        model = {
          atoms: drawn.atoms.map((a) => ({ ...a, r: 0.9 })),
          bonds: drawn.bonds.map((b) => ({ ...b, stereo: "none" as const })),
        };
      }
    }
    if (!model) return null;
    const text = drawingSvg(model, { aromaticEnabled: false, aromaticRings: {} }, styleOf(choice));
    // its own size, made larger, and never wider than where it is shown
    return text.replace(/^<svg([^>]*?) width="([\d.e+-]+)" height="([\d.e+-]+)"/, (_m, rest, w, h) =>
      `<svg${rest} width="${Number(w) * scale}" height="${Number(h) * scale}" style="max-width:100%;max-height:100%;height:auto"`,
    );
  }, [smiles, structure, scale, choice]);
  if (!svg) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}
