/**
 * Pictures opened go onto the page of the workspace in front (docs/PDF.md,
 * *A picture*), as PDFs do (./pdfs): each canvas that is a tab's own says
 * how it takes them, while it is there, and the app asks the one in front.
 * Where none is in front, a canvas opens for them.
 */
import type { PictureToAdd } from "../features/StructureEditor/store/types";

const takers = new Map<string, (pictures: PictureToAdd[]) => void>();

/** Sets how tab `id` takes pictures; the function returned takes it away again. */
export function setPictureTaker(id: string, take: (pictures: PictureToAdd[]) => void): () => void {
  takers.set(id, take);
  return () => {
    if (takers.get(id) === take) takers.delete(id);
  };
}

/** How tab `id` takes pictures, where it takes them. */
export function pictureTakerOf(id: string): ((pictures: PictureToAdd[]) => void) | undefined {
  return takers.get(id);
}
