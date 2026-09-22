import { createDocument, type DocumentStore } from "../../../lib/doc";

/** A text tab's document is just its content. */
export type TextDocument = string;

/** Builds the document from whatever the tab was opened with. */
export function createTextDocument(data: unknown): DocumentStore<TextDocument> {
  const text = (data as { text?: unknown } | null | undefined)?.text;
  return createDocument<TextDocument>(typeof text === "string" ? text : "");
}

/**
 * Mirrors the document back into the tab's data, so everything that reads a
 * tab's content (the loader flow, later the save path) keeps working while
 * views migrate to documents one at a time.
 */
export function textToTabData(text: TextDocument): { text: string } {
  return { text };
}
