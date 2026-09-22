import { useDocumentState } from "../../../lib/doc/react";
import type { DocumentStore } from "../../../lib/doc";
import TextEditor from "./TextEditor";

/**
 * Binds the plain text editor to its document, so typing is undoable.
 * Keystrokes close together collapse into one undo step - otherwise Ctrl+Z
 * would walk back one character at a time.
 */
export default function TextDocumentEditor({
  document,
}: {
  document: DocumentStore<string>;
}) {
  const text = useDocumentState(document);
  return (
    <TextEditor
      value={text}
      onChange={(next) =>
        document.edit("typing", () => next, { coalesceKey: "typing" })
      }
    />
  );
}
