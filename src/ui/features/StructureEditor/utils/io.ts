import {
  detectFormat,
  readMoleculesFromText,
  moleculesToEditorModel,
  buildEditorModelFromRXN,
  type EditorModel,
} from "../../../../utils/importers";

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

  if (format === "rxn") {
    // RXN format: uses pre-computed layout with arrow
    const rxnLayout = buildEditorModelFromRXN(content);
    return {
      model: rxnLayout.model,
      centroid: rxnLayout.centroid,
      arrow: rxnLayout.arrow ?? undefined,
    };
  }

  // MOL, SDF, XYZ formats: parse molecules and convert to editor model
  // If no format detected, try to parse as MOL anyway (or fail gracefully)
  const molecules = readMoleculesFromText(content, format || "mol");
  if (!molecules.length) {
    throw new Error(
      `No molecules found or format not supported for: ${filename}`,
    );
  }

  const { model, centroid } = moleculesToEditorModel(molecules);

  return {
    model,
    centroid,
  };
}
