import { ClipboardDocumentIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { chemMolblock } from "../../../lib/rdkit/molblock";
import { chemWorker, useChem } from "../../../lib/rdkit/worker";
import { forFlatReaders } from "./chem/drawing";
import { structureFromSmiles } from "./chem/fromSmiles";
import { useEditor } from "./store";

/**
 * SMILES in and out, by RDKit: a structure from a SMILES, laid out by Meno's
 * own engine and added beside what is drawn, and the canonical SMILES of
 * what is drawn. The first use sets RDKit up - asking before it downloads -
 * and starts it.
 */
export default function SmilesPanel({ onClose }: { onClose: () => void }) {
  const model = useEditor((s) => s.model);
  const appendModel = useEditor((s) => s.appendModel);
  const replaceModel = useEditor((s) => s.replaceModel);
  const chem = useChem();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [smiles, setSmiles] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Escape closes it, wherever the keys are - unless a menu is open (the
  // Escape is the menu's) or another box is being typed in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      if (document.querySelector("[role=menu]")) return;
      const at = e.target as HTMLElement | null;
      const typing = at?.closest("input, textarea, [contenteditable=true]");
      if (typing && !ref.current?.contains(typing)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // What is drawn, as RDKit writes it; a moment after it stops changing.
  useEffect(() => {
    if (model.atoms.length === 0) {
      setSmiles(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      void chemWorker()
        .then((c) => c.request("to_smiles", { molblock: chemMolblock(forFlatReaders(model)) }))
        .then((r) => {
          if (live) setSmiles(r.smiles);
        })
        .catch((e: unknown) => {
          if (!live) return;
          setSmiles(null);
          setError(e instanceof Error ? e.message : String(e));
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [model]);

  const add = async () => {
    const text = input.trim();
    if (!text) return;
    setError(null);
    try {
      // RDKit's drawing says what the SMILES does; the engine draws it
      const next = await structureFromSmiles(text);
      const mid = {
        x: next.atoms.reduce((n, a) => n + a.x, 0) / (next.atoms.length || 1),
        y: next.atoms.reduce((n, a) => n + a.y, 0) / (next.atoms.length || 1),
      };
      if (model.atoms.length === 0) {
        replaceModel(shift(next, -mid.x, -mid.y));
      } else {
        // beside what is drawn, two bonds clear of it
        const maxX = Math.max(...model.atoms.map((a) => a.x));
        const midY =
          model.atoms.reduce((n, a) => n + a.y, 0) / model.atoms.length;
        const minX = Math.min(...next.atoms.map((a) => a.x));
        appendModel(
          shift(
            next,
            maxX + 2 * NOMINAL_BOND_LENGTH - minX,
            midY - mid.y,
          ),
        );
      }
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div
      ref={ref}
      className="absolute left-3 bottom-3 z-50 w-[28rem] max-w-[calc(100%-1.5rem)] rounded-lg border border-gh-line bg-white shadow-lg p-3 text-sm text-gh-black"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">SMILES</span>
        <button
          aria-label="Close"
          title="Close"
          onClick={onClose}
          className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-gh-base"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type or paste a SMILES"
          autoFocus
          aria-label="SMILES to add"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          className="flex-1 min-w-0 h-8 rounded-md border border-gh-line px-2 font-mono text-xs outline-none focus:border-accel-base focus:ring-2 focus:ring-accel-lightbase"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="h-8 px-3 rounded-md bg-accel-base text-white text-xs disabled:opacity-40"
        >
          Add
        </button>
      </form>
      <div className="mt-3 text-xs text-gh-gray">This structure</div>
      <div className="mt-1 flex items-start gap-2">
        <code className="flex-1 min-w-0 break-all font-mono text-xs select-text">
          {model.atoms.length === 0
            ? "Nothing is drawn yet."
            : (smiles ?? (chem.state === "ready" ? "…" : "—"))}
        </code>
        {smiles && (
          <button
            aria-label="Copy SMILES"
            title="Copy"
            onClick={() => {
              void navigator.clipboard.writeText(smiles).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
            className="h-6 px-1.5 rounded-md flex items-center gap-1 text-xs text-gh-gray hover:bg-gh-base hover:text-gh-black"
          >
            <ClipboardDocumentIcon className="h-4 w-4" />
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <div className="mt-3 text-[11px] text-gh-gray">
        {chem.state === "setting-up" && "Setting up RDKit…"}
        {chem.state === "starting" &&
          "Starting RDKit - the first time takes a little while…"}
        {chem.state === "ready" && `RDKit ${chem.rdkit}`}
        {chem.state === "failed" && (
          <span className="text-accel-accent">
            RDKit could not start: {chem.message}
          </span>
        )}
      </div>
      {error && (
        <div className="mt-1 text-[11px] text-accel-accent break-words">
          {error}
        </div>
      )}
    </div>
  );
}

function shift<M extends { atoms: { x: number; y: number }[] }>(
  m: M,
  dx: number,
  dy: number,
): M {
  return {
    ...m,
    atoms: m.atoms.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })),
  };
}
