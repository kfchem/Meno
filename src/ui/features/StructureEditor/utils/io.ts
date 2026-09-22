import {
  detectFormat,
  readMoleculesFromText,
  moleculesToEditorModel,
  buildEditorModelFromRXN,
  type EditorModel,
} from "../../../../utils/importers";

/** Extensions the file pickers offer that have no parser yet. */
const UNSUPPORTED_EXTENSIONS = new Set(["pdb", "ket"]);

export type ProcessedFileResult = {
  model: EditorModel;
  centroid: { x: number; y: number };
  arrow?: { x1: number; y1: number; x2: number; y2: number };
};

/**
 * Process file content and return a standardized result.
 *
 * Detects file format, parses the content, and returns the model with centroid and optional arrow.
 * The caller is responsible for:
 * - Centering (subtract centroid from all atoms) for replace operations
 * - Shifting by drop point for append operations
 * - Adding the arrow to the store (for RXN files)
 */
export async function processFileContent(
  filename: string,
  content: string,
): Promise<ProcessedFileResult> {
  const format = detectFormat(filename, content);
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const name = filename || "the file";
  // Errors are shown to the user as-is, so keep the messages readable.
  if (!format && UNSUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(
      `${ext.toUpperCase()} files are not supported yet (${name}).`,
    );
  }
  const noMolecules = () =>
    new Error(
      `No molecules found in ${name}. Supported formats: MOL, SDF, RXN, XYZ.`,
    );

  if (format === "rxn") {
    // RXN format: uses pre-computed layout with arrow
    const rxnLayout = buildEditorModelFromRXN(content);
    if (!rxnLayout.model.atoms.length) throw noMolecules();
    return {
      model: rxnLayout.model,
      centroid: rxnLayout.centroid,
      arrow: rxnLayout.arrow ?? undefined,
    };
  }

  // MOL, SDF, XYZ formats: parse molecules and convert to editor model
  // If no format detected, try to parse as MOL anyway (or fail gracefully)
  const molecules = readMoleculesFromText(content, format || "mol");
  const { model, centroid } = moleculesToEditorModel(molecules);
  // The MOL parser returns an empty molecule rather than nothing for
  // unrecognised text, so check atoms, not molecules.
  if (!model.atoms.length) throw noMolecules();

  return {
    model,
    centroid,
  };
}
