import { useEffect } from "react";
import type { Action, TabId } from "../../lib/core";
import type { DocumentStore } from "../../lib/doc";

/**
 * Keeps a tab in step with its document: mirrors the content back into the
 * tab's data, so everything still reading tab data keeps working while views
 * migrate, and keeps the tab's dirty marker honest (undoing back to the saved
 * state clears it again).
 *
 * Renders nothing; it only exists to own the subscription.
 */
export default function DocumentBridge({
  id,
  document,
  toTabData,
  dispatch,
}: {
  id: TabId;
  document: DocumentStore<any>;
  toTabData?: (state: any) => Record<string, unknown>;
  dispatch: (action: Action) => void;
}) {
  useEffect(
    () =>
      document.subscribe(() => {
        if (toTabData) {
          dispatch({ type: "PATCH_DATA", id, patch: toTabData(document.getState()) });
        }
        dispatch({ type: "SET_DIRTY", id, dirty: document.history().dirty });
      }),
    [id, document, toTabData, dispatch],
  );
  return null;
}
