import { motion } from "motion/react";
import { RISE } from "../../theme/motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * What was right-clicked, where in the canvas the menu opens, and how big
 * the canvas is, so that the menu stays inside it.
 */
export type MenuTarget = {
  /**
   * The atom, bond, reaction arrow or "+" right-clicked, or a molecule in 3D
   * or a measurement on one; null, when it was nothing.
   */
  kind: "atom" | "bond" | "arrow" | "plus" | "molecule3d" | "measure3d" | null;
  /** Its id: for a measurement, its molecule's. */
  id: number | null;
  /** A measurement's own id. */
  measure?: number;
  /**
   * Whether there is a selection, and whether the menu is its: right-clicked
   * on something selected, or on nothing.
   */
  selection: "none" | "elsewhere" | "here";
  /** Whether the selection has any of the drawing in it, not molecules in 3D alone; so unless false. */
  drawing?: boolean;
  /** Where in the drawing it was opened: where a paste from it goes. */
  at: { x: number; y: number };
  x: number;
  y: number;
  within: { width: number; height: number };
};

const MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * The least width the menu takes, and each item's height, for keeping it
 * inside the canvas. It grows past that to fit its longest item on one line:
 * a shortcut is written out on Windows (Ctrl+Shift+K) where a Mac has three
 * symbols, and an item that wrapped would spill into the one below it.
 */
const WIDTH = 240;
const ITEM = 32;

/** What the clipboard's items in the menu do. */
export type MenuClipboard = {
  onCut: () => void;
  onCopy: () => void;
  onCopySmiles: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
};

type Item = { name: string; keys: string; run: () => void; divider?: boolean };

/** What can be done to a molecule in 3D from the menu. */
export type MenuMolecule3D = {
  /** How it is drawn: the menu offers the other. */
  look: "balls" | "space";
  /** How many atoms what is chosen of it measures: two, three or four make a measurement. */
  chosen: number;
  onMeasure: () => void;
  onLook: (look: "balls" | "space") => void;
  /** Turned back to face as its file has it. */
  onResetTurn: () => void;
  /** It alone, cut or copied. */
  onCut: () => void;
  onCopy: () => void;
  /** Turned to lie as the drawing it was made from does; unset, where it was made from none there is. */
  onTurnLikeDrawing?: () => void;
  /** Made again from its drawing, which has changed since; unset, where it has not. */
  onRemake?: () => void;
  /** Drawn as a formula beside it, by Meno's engine: unset, where it has a drawing already. */
  onDrawFormula?: () => void;
  /** Its frames all shown at once, or one: unset, where it has one only; `conformers`, whether they are a conformer set's. */
  overlay?: { on: boolean; conformers: boolean; set: (on: boolean) => void };
  /** Its calculation's lists - its vibrations, its orbitals - each opened under it by name: none, where it gave none. */
  lists?: { name: string; open: () => void }[];
};

/**
 * What can be done to the atom or bond under the pointer - or to the
 * selection, or on empty space - at the pointer: the mouse alone reaches
 * everything a key does. Closes on Escape, on a press anywhere else, and
 * on a turn of the wheel.
 */
export default function PartMenu({
  target,
  onDelete,
  onCleanUp,
  onMake3d,
  onSelectStructure,
  onTurnOver,
  onCharge,
  onRadical,
  radical,
  onExpand,
  onArrowStyle,
  onAddArrow,
  onAddPlus,
  onSaveAbbreviation,
  canvas = [],
  clipboard,
  molecule3d,
  onClose,
}: {
  target: MenuTarget;
  /** The part deleted, or the selection when the menu is its. */
  onDelete: () => void;
  /** The part's structure cleaned up, or the selection's structures. */
  onCleanUp: () => void;
  /** The part's structure made in 3D, or the selection's structures. */
  onMake3d: () => void;
  onSelectStructure: () => void;
  /** The selection turned over, left to right or top to bottom. */
  onTurnOver: (axis: "vertical" | "horizontal") => void;
  /** An atom's charge one up or one down. */
  onCharge: (step: 1 | -1) => void;
  /** An atom's unpaired electron given or taken away; `radical`, whether it has one. */
  onRadical: () => void;
  radical: boolean;
  /** An abbreviation's atoms drawn out; unset, where the atom is none. */
  onExpand?: () => void;
  /** A reaction arrow's own line and head, in a panel beside the canvas. */
  onArrowStyle: () => void;
  /** A reaction arrow, or a "+", added where the menu was opened on empty space. */
  onAddArrow: () => void;
  onAddPlus: () => void;
  /** The selection saved as an abbreviation of the user's own. */
  onSaveAbbreviation: () => void;
  /** What the canvas does as a whole - fit, R and S, its style - offered on empty space. */
  canvas?: { name: string; keys: string; run: () => void }[];
  clipboard: MenuClipboard;
  /** The molecule in 3D right-clicked, when it is one. */
  molecule3d?: MenuMolecule3D;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // the width it came out at, so that the whole of it stays in the canvas
  const [width, setWidth] = useState(WIDTH);
  useLayoutEffect(() => {
    // (the same width again changes nothing: React leaves it be)
    const w = ref.current?.offsetWidth;
    if (w) setWidth(w);
  }, [target, radical]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const buttons = [...(ref.current?.querySelectorAll("button") ?? [])];
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const step = e.key === "ArrowDown" ? 1 : -1;
      buttons[(at + step + buttons.length) % buttons.length]?.focus();
    };
    const onPress = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("wheel", onClose, true);
    ref.current?.querySelector("button")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("wheel", onClose, true);
    };
  }, [onClose]);

  const deleteKey = MAC ? "⌫" : "Del";
  const cleanUpKey = MAC ? "⇧⌘K" : "Ctrl+Shift+K";
  const shortcut = (key: string) => (MAC ? `⌘${key}` : `Ctrl+${key}`);
  // (with a selection elsewhere, the keys are the selection's)
  const keys = target.selection === "none";
  const paste: Item = { name: "Paste", keys: shortcut("V"), run: clipboard.onPaste };
  const cutItem: Item = { name: "Cut", keys: shortcut("X"), run: clipboard.onCut };
  const drawing = target.drawing !== false;
  // (on empty space: a reaction scheme's arrow, or a "+", there)
  const scheme: Item[] = [
    { name: "Add reaction arrow", keys: "", run: onAddArrow, divider: true },
    { name: "Add plus", keys: "", run: onAddPlus },
  ];
  // a molecule in 3D: a measurement of its chosen atoms, its look, its turn
  const measureName = ["", "", "Measure distance", "Measure angle", "Measure torsion angle"];
  const molecule: Item[] = molecule3d
    ? [
        ...(molecule3d.chosen >= 2 && molecule3d.chosen <= 4
          ? [{ name: measureName[molecule3d.chosen], keys: "", run: molecule3d.onMeasure }]
          : []),
        molecule3d.look === "space"
          ? { name: "Ball and stick", keys: "", run: () => molecule3d.onLook("balls") }
          : { name: "Space-filling", keys: "", run: () => molecule3d.onLook("space") },
        { name: "Reset orientation", keys: "", run: molecule3d.onResetTurn },
        ...(molecule3d.overlay
          ? [
              {
                name: `Show ${molecule3d.overlay.on ? "one" : "all"} ${molecule3d.overlay.conformers ? "conformer" : "frame"}${molecule3d.overlay.on ? "" : "s"}`,
                keys: "",
                run: () => molecule3d.overlay!.set(!molecule3d.overlay!.on),
              },
            ]
          : []),
        ...(molecule3d.lists ?? []).map((l) => ({ name: l.name, keys: "", run: l.open })),
        ...(molecule3d.onTurnLikeDrawing ? [{ name: "Turn like the drawing", keys: "", run: molecule3d.onTurnLikeDrawing }] : []),
        ...(molecule3d.onRemake ? [{ name: "Make again from the drawing", keys: "", run: molecule3d.onRemake, divider: true }] : []),
        ...(molecule3d.onDrawFormula ? [{ name: "Draw as formula", keys: "", run: molecule3d.onDrawFormula }] : []),
      ]
    : [];
  const items: Item[] =
    target.kind === "measure3d"
      ? [{ name: "Delete measurement", keys: deleteKey, run: onDelete }]
      : target.kind === "molecule3d" && target.selection !== "here" && molecule3d
      ? [
          ...molecule,
          { name: "Cut", keys: keys ? shortcut("X") : "", run: molecule3d.onCut, divider: true },
          { name: "Copy", keys: keys ? shortcut("C") : "", run: molecule3d.onCopy },
          { name: "Delete molecule", keys: keys ? deleteKey : "", run: onDelete },
        ]
      : target.kind === "arrow"
      ? [
          { name: "Arrow style…", keys: "", run: onArrowStyle },
          { name: "Delete arrow", keys: deleteKey, run: onDelete },
        ]
      : target.kind === "plus"
      ? [{ name: "Delete plus", keys: deleteKey, run: onDelete }]
      : target.selection === "here"
      ? [
          // (on a molecule in 3D in it: that molecule's own, first)
          ...(molecule.length ? [...molecule, { ...cutItem, divider: true }] : [cutItem]),
          { name: "Copy", keys: shortcut("C"), run: clipboard.onCopy },
          ...(drawing ? [{ name: "Copy as SMILES", keys: "", run: clipboard.onCopySmiles }] : []),
          // (on empty space, a paste goes there)
          ...(target.kind == null ? [paste] : []),
          { name: "Delete selection", keys: deleteKey, run: onDelete, divider: true },
          // (what only a drawing has: none, for molecules in 3D alone)
          ...(drawing
            ? [
                { name: "Turn over left to right", keys: "", run: () => onTurnOver("vertical") },
                { name: "Turn over top to bottom", keys: "", run: () => onTurnOver("horizontal") },
                { name: "Clean up these structures", keys: cleanUpKey, run: onCleanUp },
                { name: "3D structures", keys: "", run: onMake3d },
                { name: "Save as abbreviation…", keys: "", run: onSaveAbbreviation, divider: true },
              ]
            : []),
          ...(target.kind == null ? scheme : []),
        ]
      : target.kind == null
        ? [
            paste,
            { name: "Select all", keys: shortcut("A"), run: clipboard.onSelectAll },
            ...scheme,
            ...canvas.map((item, i) => ({ ...item, divider: i === 0 })),
          ]
        : [
          {
            name: target.kind === "atom" ? "Delete atom" : "Delete bond",
            keys: keys ? deleteKey : "",
            run: onDelete,
          },
          // an atom's charge and radical: the + and - keys do the first
          ...(target.kind === "atom"
            ? [
                { name: "Charge one up", keys: "+", run: () => onCharge(1) },
                { name: "Charge one down", keys: "\u2212", run: () => onCharge(-1) },
                { name: radical ? "No unpaired electron" : "Unpaired electron", keys: "", run: onRadical },
                ...(onExpand ? [{ name: "Expand abbreviation", keys: "", run: onExpand }] : []),
              ]
            : []),
          { name: "Select this structure", keys: "", run: onSelectStructure },
          {
            name: "Clean up this structure",
            keys: keys ? cleanUpKey : "",
            run: onCleanUp,
          },
          { name: "3D structure", keys: "", run: onMake3d },
        ];
  const height = items.length * ITEM + items.filter((i) => i.divider).length * 9 + 12;
  return (
    <motion.div
      ref={ref}
      {...RISE}
      role="menu"
      aria-label={
        target.selection === "here"
          ? "Selection"
          : target.kind === "atom"
            ? "Atom"
            : target.kind === "bond"
              ? "Bond"
              : target.kind === "arrow"
                ? "Arrow"
                : target.kind === "plus"
                  ? "Plus"
                  : target.kind === "molecule3d"
                    ? "Molecule"
                    : target.kind === "measure3d"
                      ? "Measurement"
                      : "Canvas"
      }
      className="absolute z-50 rounded-md border border-gh-line bg-white py-1 shadow-lg text-sm text-gh-black"
      style={{
        left: Math.max(0, Math.min(target.x, target.within.width - width - 8)),
        top: Math.max(0, Math.min(target.y, target.within.height - height - 8)),
        minWidth: WIDTH,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((item) => [
        item.divider && <div key={`${item.name}-divider`} role="separator" className="my-1 border-t border-gh-line" />,
        <button
          key={item.name}
          role="menuitem"
          onClick={() => {
            onClose();
            item.run();
          }}
          className="w-full h-8 px-3 flex items-center justify-between gap-4 text-left whitespace-nowrap transition-colors duration-150 ease-meno hover:bg-gh-base focus:bg-gh-base outline-none"
        >
          <span>{item.name}</span>
          <kbd className="font-sans text-xs text-gh-gray">{item.keys}</kbd>
        </button>,
      ])}
    </motion.div>
  );
}
