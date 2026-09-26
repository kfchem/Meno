import { XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { presetById } from "../../../lib/chem/style";
import { useAppSettings } from "../../../lib/settings/appSettings";
import StyleEditor from "../StyleEditor";
import { useEditor } from "./store";

/**
 * The drawing style of the document on this canvas: the application's, or
 * one of its own - to draw one figure in a journal's style, say, while the
 * rest keep the app's. Changes are edits to the document, so undo takes them
 * back like any other.
 */
export default function DocumentStylePanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const own = useEditor((s) => s.docStyle);
  const setDocumentStyle = useEditor((s) => s.setDocumentStyle);
  const app = useAppSettings((s) => s.drawingStyle);
  const appName =
    presetById(app.preset).name +
    (Object.keys(app.changes).length ? ", changed" : "");

  return (
    <aside
      aria-label="Drawing style for this document"
      className="w-[25rem] max-w-[50%] shrink-0 h-full border-l border-gh-line bg-white flex flex-col"
    >
      <header className="flex items-center justify-between px-4 h-11 border-b border-gh-line">
        <h2 className="text-sm font-semibold text-gh-black">Drawing style</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          title="Close"
          className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-gh-base"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-auto px-4 py-3">
        <div
          role="radiogroup"
          aria-label="Style of this document"
          className="space-y-1.5"
        >
          <Option
            on={!own}
            onPick={() => setDocumentStyle(undefined)}
            title="The app's style"
            detail={`${appName}. Follows Settings as it changes.`}
          />
          <Option
            on={!!own}
            onPick={() => !own && setDocumentStyle(app)}
            title="A style of its own"
            detail="Starts as the app's. Kept while the tab is open; a MOL or SD file holds the structure only."
          />
        </div>
        {own && (
          <div className="mt-4">
            <StyleEditor
              layout="narrow"
              choice={own}
              onChange={(next, setting) =>
                setDocumentStyle(next, setting ? `style:${setting}` : undefined)
              }
            />
          </div>
        )}
      </div>
    </aside>
  );
}

function Option({
  on,
  onPick,
  title,
  detail,
}: {
  on: boolean;
  onPick: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={clsx(
        "w-full text-left rounded-lg border px-3 py-2 flex gap-2.5 items-start",
        on
          ? "border-accel-base bg-accel-lightbase/30"
          : "border-gh-line hover:bg-gh-base",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "mt-0.5 h-3.5 w-3.5 rounded-full border shrink-0",
          on ? "border-accel-base border-4" : "border-gh-line",
        )}
      />
      <span>
        <span className="block text-sm text-gh-black">{title}</span>
        <span className="block text-xs text-gh-gray leading-snug">
          {detail}
        </span>
      </span>
    </button>
  );
}
