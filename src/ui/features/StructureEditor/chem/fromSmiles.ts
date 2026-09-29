import { chemWorker } from "../../../../lib/rdkit/worker";
import type { Model } from "../store/types";
import { editorModelOf, processFileContent } from "../utils/io";
import { laidOut } from "./cleanUp";

/**
 * The structure a SMILES says, read by RDKit and drawn by Meno's own
 * engine - or as RDKit laid it out, should the engine fail. The first use
 * sets RDKit up, asking before it downloads.
 */
export async function structureFromSmiles(smiles: string): Promise<Model> {
  const c = await chemWorker();
  const { molblock } = await c.request("from_smiles", { smiles });
  const result = await processFileContent("smiles.mol", molblock);
  const drawn = editorModelOf(result.model);
  return laidOut(drawn).catch((e: unknown) => {
    console.warn("the SMILES is drawn as RDKit laid it out", e);
    return drawn;
  });
}
