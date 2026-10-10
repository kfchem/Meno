/**
 * The layout engine in a worker of its own: a large structure takes it up
 * to a second, which the drawing is not to wait on. One layout a message,
 * answered by its id.
 */
import { layout2D, type LayoutInput } from "../../../../lib/layout/engine";

// (the app is typed against the DOM's window, not a worker's scope)
const scope = self as unknown as {
  onmessage: (e: MessageEvent<{ id: number; input: LayoutInput }>) => void;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (e) => {
  const { id, input } = e.data;
  try {
    scope.postMessage({ id, ok: true, layout: layout2D(input) });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
