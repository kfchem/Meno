import { useEffect } from "react";
import { styleOf } from "../../../../lib/chem/style";
import { sendToOffice } from "../../../../lib/ole";
import { useAppSettings } from "../../../../lib/settings/appSettings";
import { drawnOf } from "../fileActions";
import { structurePicture } from "../picture";
import { useEditorStore } from "../store";

/**
 * How long the drawing is left alone before its document is given it: long
 * enough for a drag to end, short enough to look immediate.
 */
const SETTLE_MS = 250;
/** How soon after opening the view is fitted: once the canvas has been made. */
const FIT_AFTER_MS = 300;

/**
 * A canvas opened from a document (on Windows, a double-click on the
 * structure in Word or PowerPoint): each change goes back to the document
 * once the drawing settles - record and picture, drawn in the style the
 * canvas is - so the document shows the structure as it is being drawn.
 */
export function useOfficeLink(officeId: number | undefined) {
  const store = useEditorStore();
  useEffect(() => {
    if (officeId == null) return;
    // The whole of it in view, however it sat in the document - asked for
    // once the canvas is up: opening asks too, but before there is a view.
    const fit = window.setTimeout(() => store.getState().requestFit(), FIT_AFTER_MS);
    let timer: number | undefined;
    const send = () => {
      const s = store.getState();
      // (an emptied canvas leaves the document the last picture it had)
      if (!s.model.atoms.length) return;
      const style = styleOf(s.docStyle ?? useAppSettings.getState().drawingStyle);
      const { record, emf } = structurePicture(drawnOf(s), s, style);
      sendToOffice(officeId, record, emf).catch((e: unknown) =>
        console.warn("the document did not take the structure", e),
      );
    };
    const stop = store.subscribe((s, prev) => {
      const same =
        s.model === prev.model &&
        s.arrows === prev.arrows &&
        s.pluses === prev.pluses &&
        s.docStyle === prev.docStyle &&
        s.aromaticEnabled === prev.aromaticEnabled &&
        s.aromaticRings === prev.aromaticRings;
      if (same) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(send, SETTLE_MS);
    });
    return () => {
      window.clearTimeout(fit);
      window.clearTimeout(timer);
      stop();
    };
  }, [store, officeId]);
}
