import { AnimatePresence, motion } from "motion/react";
import { RISE } from "../../theme/motion";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useAppSettings } from "../../../lib/settings/appSettings";
import NetworkSettings from "../../network/NetworkSettings";
import StyleEditor from "../StyleEditor";
import Style3DEditor from "../StyleEditor/Style3DEditor";
import AbbreviationSettings from "./AbbreviationSettings";
import ChemistrySettings from "./ChemistrySettings";
import FileSettings from "./FileSettings";
import PictureSettings from "./PictureSettings";
import PluginSettings from "./PluginSettings";
import RoleChoices from "./RoleChoices";
import { useSettingsSection, type SettingsSection } from "./section";

const SECTIONS: { id: SettingsSection; name: string }[] = [
  { id: "style", name: "Drawing style" },
  { id: "style3d", name: "Molecules in 3D" },
  { id: "chemistry", name: "Chemistry" },
  { id: "files", name: "Files" },
  { id: "plugins", name: "Plugins" },
  { id: "abbreviations", name: "Dictionary" },
  { id: "network", name: "Network" },
];

/**
 * The application's settings: the drawing style every structure is drawn
 * in unless its document has its own, how molecules in 3D look and turn,
 * what is pointed out on a structure, who reads and writes each kind
 * of file and how sharp a copied picture is, the plugins, what the labels Meno reads stand for, and what Meno
 * may do on the network.
 */
export default function SettingsPanel() {
  const drawingStyle = useAppSettings((s) => s.drawingStyle);
  const setDrawingStyle = useAppSettings((s) => s.setDrawingStyle);
  const style3d = useAppSettings((s) => s.style3d);
  const setStyle3d = useAppSettings((s) => s.setStyle3d);
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
                  "h-8 px-3 rounded-md text-sm border transition-[background-color,border-color,color,box-shadow] duration-150 ease-meno",
                  section === s.id
                    ? "bg-white border-gh-line text-gh-black shadow-sm"
                    : "border-transparent text-gh-gray hover:text-gh-black",
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence>
          {error && (
            <motion.div
              key="error"
              {...RISE}
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-md border border-gh-line bg-white px-3 py-2 text-xs text-gh-black"
            >
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-accel-accent" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>
        <div key={section} className="meno-fade-in">
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
        ) : section === "style3d" ? (
          <section className="mt-6">
            <h2 className="text-base font-semibold text-gh-black">
              Molecules in 3D
            </h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray max-w-2xl">
              How molecules in 3D look, on the canvas and in exported pictures,
              and how they turn under the pointer. Changes are saved as you
              make them.
            </p>
            <Style3DEditor
              choice={style3d}
              onChange={(next) => setStyle3d(next)}
            >
              <RoleChoices where="molecules3d" heading="Made by" />
            </Style3DEditor>
          </section>
        ) : section === "chemistry" ? (
          <section className="mt-6 max-w-4xl">
            <h2 className="text-base font-semibold text-gh-black">Chemistry</h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray max-w-2xl">
              What is pointed out on a structure as it is drawn, and who does
              it. The marks are Meno's, not the drawing's: no exported picture
              has them.
            </p>
            <ChemistrySettings />
          </section>
        ) : section === "files" ? (
          <section className="mt-6 max-w-5xl">
            <h2 className="text-base font-semibold text-gh-black">Files</h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray max-w-2xl">
              Who reads each kind of file Meno opens, and who writes it. Where more than one can read a kind, one
              reads it - the molecule, and what the calculation was, are its - and those ticked read it as well,
              what they find added beside it.
            </p>
            <FileSettings />
            <h3 className="mt-6 text-sm font-semibold text-gh-black">Copied pictures</h3>
            <p className="mt-1 mb-3 text-sm text-gh-gray max-w-2xl">
              What a copy puts beside a structure for other programs - Word, PowerPoint - to paste.
            </p>
            <PictureSettings />
          </section>
        ) : section === "plugins" ? (
          <section className="mt-6 max-w-4xl">
            <h2 className="text-base font-semibold text-gh-black">Plugins</h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray max-w-2xl">
              Programs that do for Meno what it does not do itself: read files, make sense of a structure, make it in 3D.
              A plugin is downloaded when it is added, or first needed - Meno asks first - and can be taken away again.
            </p>
            <PluginSettings />
          </section>
        ) : section === "abbreviations" ? (
          <section className="mt-6">
            <h2 className="text-base font-semibold text-gh-black">Dictionary</h2>
            <p className="mt-1 mb-4 text-sm text-gh-gray max-w-2xl">
              What each label stands for - Boc, DMP, XPhos, Grubbs II - drawn. Labels of your own are saved as you add them.
            </p>
            <AbbreviationSettings />
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
    </div>
  );
}
