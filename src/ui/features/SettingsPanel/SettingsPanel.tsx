import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useAppSettings } from "../../../lib/settings/appSettings";
import NetworkSettings from "../../network/NetworkSettings";
import StyleEditor from "../StyleEditor";
import ChemistrySettings from "./ChemistrySettings";
import { useSettingsSection, type SettingsSection } from "./section";

const SECTIONS: { id: SettingsSection; name: string }[] = [
  { id: "style", name: "Drawing style" },
  { id: "chemistry", name: "Chemistry" },
  { id: "network", name: "Network" },
];

/**
 * The application's settings: the drawing style every structure is drawn
 * in unless its document has its own, what RDKit points out on it, and
 * what Meno may do on the network.
 */
export default function SettingsPanel() {
  const drawingStyle = useAppSettings((s) => s.drawingStyle);
  const setDrawingStyle = useAppSettings((s) => s.setDrawingStyle);
  const error = useAppSettings((s) => s.error);
  const section = useSettingsSection((s) => s.section);
  return (
    <div className="w-full h-full overflow-auto bg-gh-base/40">
      <div className="max-w-[88rem] mx-auto px-6 py-6">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-semibold text-gh-black">Settings</h1>
          <div role="tablist" className="flex gap-1">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={section === s.id}
                onClick={() => useSettingsSection.setState({ section: s.id })}
                className={clsx(
                  "h-8 px-3 rounded-md text-sm",
                  section === s.id
                    ? "bg-white border border-gh-line text-gh-black shadow-sm"
                    : "text-gh-gray hover:text-gh-black",
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-md border border-gh-line bg-white px-3 py-2 text-xs text-gh-black"
          >
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-accel-accent" />
            {error}
          </div>
        )}
        {section === "style" ? (
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
        ) : section === "chemistry" ? (
          <section className="mt-6 max-w-4xl">
            <h2 className="text-base font-semibold text-gh-black">Chemistry</h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray max-w-2xl">
              What RDKit points out on a structure as it is drawn. The marks
              are Meno's, not the drawing's: no exported picture has them.
            </p>
            <ChemistrySettings />
          </section>
        ) : (
          <section className="mt-6 max-w-4xl">
            <h2 className="text-base font-semibold text-gh-black">Network</h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray max-w-2xl">
              Meno asks before anything first uses the network, shows each
              connection as it happens, and keeps a record of them all.
            </p>
            <NetworkSettings />
          </section>
        )}
      </div>
    </div>
  );
}
