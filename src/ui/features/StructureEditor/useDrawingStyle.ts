import { useMemo } from "react";
import {
  styleOf,
  type DrawingStyle,
  type StyleChoice,
} from "../../../lib/chem/style";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { useEditor } from "./store";

/**
 * The style choice this canvas is drawn in: its document's own, or the
 * application's.
 */
export function useStyleChoice(): StyleChoice {
  const own = useEditor((s) => s.docStyle);
  const app = useAppSettings((s) => s.drawingStyle);
  return own ?? app;
}

/** The drawing style this canvas is drawn in. */
export function useDrawingStyle(): DrawingStyle {
  const choice = useStyleChoice();
  return useMemo(() => styleOf(choice), [choice]);
}
