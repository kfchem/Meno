import { useCallback, useSyncExternalStore } from "react";
import type { DocumentStore } from "./document";

/** Subscribes a component to a document's state. */
export function useDocumentState<T>(doc: DocumentStore<T>): T {
  const subscribe = useCallback(
    (listener: () => void) => doc.subscribe(listener),
    [doc],
  );
  const getState = useCallback(() => doc.getState(), [doc]);
  return useSyncExternalStore(subscribe, getState, getState);
}
