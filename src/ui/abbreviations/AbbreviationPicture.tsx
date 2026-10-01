import { useMemo } from "react";
import { NOMINAL_BOND_LENGTH } from "../../lib/chem/acs";
import { drawnSmiles } from "../../lib/chem/abbreviationPlace";
import { styleOf } from "../../lib/chem/style";
import { useAppSettings } from "../../lib/settings/appSettings";
import { drawingSvg } from "../features/StructureEditor/fileActions";

/**
 * What an abbreviation stands for, drawn by Meno in the application's
 * drawing style, a "*" where it is attached - or nothing, for SMILES that
 * does not read. `scale` enlarges the picture from the style's own size.
 */
export default function AbbreviationPicture({ smiles, scale = 1.5, className }: { smiles: string; scale?: number; className?: string }) {
  const choice = useAppSettings((s) => s.drawingStyle);
  const svg = useMemo(() => {
    const drawn = drawnSmiles(smiles, NOMINAL_BOND_LENGTH);
    if (!drawn) return null;
    const model = {
      atoms: drawn.atoms.map((a) => ({ ...a, r: 0.9 })),
      bonds: drawn.bonds.map((b) => ({ ...b, stereo: "none" as const })),
    };
    const text = drawingSvg(model, { aromaticEnabled: false, aromaticRings: {} }, styleOf(choice));
    // its own size, made larger, and never wider than where it is shown
    return text.replace(/^<svg([^>]*?) width="([\d.e+-]+)" height="([\d.e+-]+)"/, (_m, rest, w, h) =>
      `<svg${rest} width="${Number(w) * scale}" height="${Number(h) * scale}" style="max-width:100%;max-height:100%;height:auto"`,
    );
  }, [smiles, scale, choice]);
  if (!svg) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}
