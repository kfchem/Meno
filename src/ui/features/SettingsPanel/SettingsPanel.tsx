import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useAppSettings } from "../../../lib/settings/appSettings";
import StyleEditor from "../StyleEditor";

/**
 * The application's settings. For now the drawing style: what every
 * structure is drawn in, on the canvas and in exported pictures, unless its
 * document has a style of its own.
 */
export default function SettingsPanel() {
  const drawingStyle = useAppSettings((s) => s.drawingStyle);
  const setDrawingStyle = useAppSettings((s) => s.setDrawingStyle);
  const error = useAppSettings((s) => s.error);
  return (
    <div className="w-full h-full overflow-auto bg-gh-base/40">
      <div className="max-w-[88rem] mx-auto px-6 py-6">
        <h1 className="text-xl font-semibold text-gh-black">Settings</h1>
        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-md border border-gh-line bg-white px-3 py-2 text-xs text-gh-black"
          >
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-accel-accent" />
            {error}
          </div>
        )}
        <section className="mt-6">
          <h2 className="text-base font-semibold text-gh-black">
            Drawing style
          </h2>
          <p className="mt-1 mb-4 text-sm text-gh-gray max-w-2xl">
            How structures are drawn, on the canvas and in exported pictures.
            Start from a journal's style and change what you like; a document
            can also be given a style of its own from its canvas. Changes are
            saved as you make them.
          </p>
          <StyleEditor
            choice={drawingStyle}
            onChange={(next) => setDrawingStyle(next)}
          />
        </section>
      </div>
    </div>
  );
}
