/**
 * PDFs opened go onto the page of the workspace in front (docs/PDF.md), as
 * texts go into its column (./texts): each canvas that is a tab's own says
 * how it takes them, while it is there, and the app asks the one in front.
 * Where none is in front, a canvas opens for them.
 */
import type { HeldPdf } from "../../lib/pdf/reader";

/** A PDF opened: its name, and what Meno holds it by. */
export type OpenedPdf = HeldPdf & { name: string };

const takers = new Map<string, (pdfs: OpenedPdf[]) => void>();

/** Sets how tab `id` takes PDFs; the function returned takes it away again. */
export function setPdfTaker(id: string, take: (pdfs: OpenedPdf[]) => void): () => void {
  takers.set(id, take);
  return () => {
    if (takers.get(id) === take) takers.delete(id);
  };
}

/** How tab `id` takes PDFs, where it takes them. */
export function pdfTakerOf(id: string): ((pdfs: OpenedPdf[]) => void) | undefined {
  return takers.get(id);
}
