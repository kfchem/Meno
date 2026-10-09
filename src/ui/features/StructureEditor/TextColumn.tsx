import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { ArrowUpTrayIcon, ChevronDoubleRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { exists, writeTextFile } from "@tauri-apps/plugin-fs";
import TextEditor from "../TextEditor";
import { DURATION, EASE_SLIDE, FADE } from "../../theme/motion";
import { useEditor, useEditorStore } from "./store";
import type { WorkspaceText } from "./store/types";
import { textExportPath } from "./utils/texts";
import { takenBeside } from "../../../lib/io/beside";

/** The column's width as it first opens, and the least and most it may be dragged to, in pixels. */
const WIDTH = 440;
const NARROWEST = 260;
const WIDEST = 0.7;

/**
 * The texts the workspace holds, in a column beside the canvas (docs/
 * WORKSPACE.md, *Texts*): one shown, the others named above it to be
 * switched to; each read and edited there - the workspace's edits, undone
 * as any other - and written to a file by Export. Closing a text takes it
 * out of the workspace; hiding the column keeps them all. The column slides
 * open and shut as the panel beside the canvas does, and is as wide as its
 * left edge is dragged. It lies over the canvas's right side (docs/PDF.md,
 * *One canvas*), and says how much of it it covers as it goes (`cover`).
 */
export default function TextColumn() {
  const texts = useEditor((s) => s.texts);
  const shownId = useEditor((s) => s.textShown);
  const open = useEditor((s) => s.textsOpen);
  const shown = texts.find((t) => t.id === shownId);
  const [width, setWidth] = useState(WIDTH);
  const [dragging, setDragging] = useState(false);
  // (how much of the canvas it covers, as it slides and as it is dragged: what is in view is the rest)
  const store = useEditorStore();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) {
      store.getState().setCover(0);
      return;
    }
    const seen = new ResizeObserver(() => store.getState().setCover(el.getBoundingClientRect().width));
    seen.observe(el);
    return () => {
      seen.disconnect();
      store.getState().setCover(0);
    };
  }, [el, store]);
  return (
    <AnimatePresence initial={false}>
      {open && shown && (
        <motion.div
          key="texts"
          ref={setEl}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          // (dragged, it follows the pointer)
          transition={dragging ? { duration: 0 } : { duration: DURATION.move, ease: EASE_SLIDE }}
          className={clsx("absolute top-0 right-0 z-20 h-full overflow-hidden", dragging && "select-none")}
        >
          <Column texts={texts} shown={shown} width={width} />
          <Edge width={width} setWidth={setWidth} setDragging={setDragging} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Column({ texts, shown, width }: { texts: WorkspaceText[]; shown: WorkspaceText; width: number }) {
  const showText = useEditor((s) => s.showText);
  const removeText = useEditor((s) => s.removeText);
  const editText = useEditor((s) => s.editText);
  const closeTexts = useEditor((s) => s.closeTexts);
  const [error, setError] = useState<string | null>(null);
  const exportText = async (t: WorkspaceText) => {
    try {
      setError(null);
      const picked = await saveDialog({ title: "Export", defaultPath: textExportPath(t, t.path ? await takenBeside(t.path, (p) => exists(p)) : undefined) });
      if (picked) await writeTextFile(picked, t.text);
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    <aside aria-label="Texts" style={{ width }} className="h-full border-l border-gh-line bg-white flex flex-col">
      <header className="flex items-center gap-1 pl-2 pr-1.5 h-11 border-b border-gh-line">
        <div role="tablist" aria-label="Texts" className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto">
          {texts.map((t) => (
            <div
              key={t.id}
              role="tab"
              aria-selected={t.id === shown.id}
              title={t.path ?? t.name}
              className={clsx(
                "group shrink-0 max-w-[12rem] h-7 flex items-center rounded-md text-xs transition-colors duration-150 ease-meno",
                t.id === shown.id ? "bg-gh-base text-gh-black" : "text-gh-gray hover:bg-gh-base hover:text-gh-black",
              )}
            >
              <button onClick={() => showText(t.id)} className="min-w-0 truncate pl-2 pr-1 h-full">
                {t.name}
              </button>
              <button
                onClick={() => removeText(t.id)}
                aria-label={`Close ${t.name}`}
                title={`Close ${t.name}`}
                className={clsx(
                  "h-5 w-5 mr-1 shrink-0 rounded flex items-center justify-center hover:bg-gh-line transition-opacity duration-150 ease-meno",
                  t.id === shown.id ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => void exportText(shown)}
          aria-label="Export…"
          title="Export…"
          className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center hover:bg-gh-base"
        >
          <ArrowUpTrayIcon className="h-4 w-4" />
        </button>
        <button
          onClick={closeTexts}
          aria-label="Hide texts"
          title="Hide texts"
          className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center hover:bg-gh-base"
        >
          <ChevronDoubleRightIcon className="h-4 w-4" />
        </button>
      </header>
      <AnimatePresence initial={false}>
        {error && (
          <motion.div key="error" {...FADE} role="alert" className="px-3 py-2 text-xs text-gh-black border-b border-gh-line flex items-start gap-2">
            <span className="flex-1 break-words">{error}</span>
            <button aria-label="Dismiss" title="Dismiss" onClick={() => setError(null)} className="h-4 w-4 shrink-0 rounded-full hover:bg-gh-line">
              <XMarkIcon className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex-1 min-h-0 relative">
        <AnimatePresence initial={false}>
          <motion.div key={shown.id} {...FADE} className="absolute inset-0">
            <TextEditor value={shown.text} onChange={(v) => editText(shown.id, v)} />
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  );
}

/** The column's left edge, dragged to make it wider or narrower. */
function Edge({
  width,
  setWidth,
  setDragging,
}: {
  width: number;
  setWidth: (w: number) => void;
  setDragging: (on: boolean) => void;
}) {
  const from = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Width of the texts"
      aria-valuenow={Math.round(width)}
      // (Meno's own pointer for dragging sideways, as a slider's: theme/cursors)
      data-cursor="sideways"
      className="absolute left-0 top-0 h-full w-1.5 -ml-0.5 z-10"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // (a drag, not a selection of the words it passes over)
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        from.current = { x: e.clientX, width };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!from.current) return;
        const widest = Math.max(NARROWEST, window.innerWidth * WIDEST);
        setWidth(Math.min(widest, Math.max(NARROWEST, from.current.width + from.current.x - e.clientX)));
      }}
      onPointerUp={() => {
        from.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        from.current = null;
        setDragging(false);
      }}
    />
  );
}
