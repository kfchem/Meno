import { Canvas } from "@react-three/fiber";
import { useEditor, useEditorStore, EditorProvider } from "./store";
import { useStructureEvents } from "./hooks/useStructureEvents";
import { useCanvasSetup } from "./hooks/useCanvasSetup";
import {
  Atoms2D,
  Bonds2D,
  PanZoom2D,
  FitToContent2D,
  JoinCaps2D,
  BondsPick2D,
  AtomsHoverRings2D,
  ExtendPreview2D,
  MovePreview2D,
  Arrows2D,
  Pluses2D,
  AromaticCircles2D,
  Wedges2D,
  Labels2D,
  LabelEditor2D,
  HoverOverlay2D,
  ChemMarks2D,
  SnapArc2D,
  Selection2D,
} from "./components";
import {
  ArrowDownTrayIcon,
  ArrowsPointingInIcon,
  ExclamationTriangleIcon,
  FolderOpenIcon,
  PhotoIcon,
  SparklesIcon,
  SwatchIcon,
  CodeBracketIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import DocumentStylePanel from "./DocumentStylePanel";
import ArrowStylePanel from "./ArrowStylePanel";
import SaveAbbreviationPanel from "./SaveAbbreviationPanel";
import { abbreviationFromSelection } from "./chem/abbreviationFromSelection";
import SmilesPanel from "./SmilesPanel";
import PartMenu, { type MenuMolecule3D, type MenuTarget } from "./PartMenu";
import { STYLE_3D } from "../../../lib/chem/style3d";
import { chosenPath, frameOf, lookOf, solidOf } from "./utils/molecule3d";
import { abbreviationOf } from "../../../lib/chem/abbreviations";
import { isElementSymbol } from "../../../lib/rdkit/molblock";

/** No atoms or bonds: the same array each time, so that nothing redraws for it. */
const NO_IDS: number[] = [];

/** Whether an atom is an abbreviation that can be drawn out: a file's, or one the dictionary knows. */
function expandable(a: { el: string; abbrev?: unknown } | undefined): boolean {
  return !!a && !isElementSymbol(a.el) && (!!a.abbrev || !!abbreviationOf(a.el));
}
import { useClipboardActions } from "./clipboardActions";
import {
  chargeStep,
  clipboardIntent,
  isCleanUpKey,
  isDeleteKey,
  isDeselectKey,
  isSelectAllKey,
  saveIntent,
} from "../../../lib/doc/shortcuts";
import { chemWorker, useChem } from "../../../lib/rdkit/worker";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { cleanUp } from "./chem/cleanUp";
import { useChemMarks } from "./chem/useChemMarks";
import { useFileActions } from "./fileActions";
import { CANVAS_DPR } from "./constants";
import { startingZoom } from "./layoutOptions";
import { useDrawingStyle } from "./useDrawingStyle";
import { DrawnLayoutProvider } from "./components/DrawnLayout";
import { useOfficeLink } from "./hooks/useOfficeLink";
import { useDropZone } from "../../../lib/drop";
import type { DocumentStore } from "../../../lib/doc";
import type { StructureDocument } from "./document";
import PageCamera, { PAGE_DISTANCE } from "./components/PageCamera";
import Molecules3D from "./components/Molecules3D";
import OpenStereo2D from "./components/OpenStereo2D";
import LinkedHover2D from "./components/LinkedHover2D";
import Ask3D from "./Ask3D";
import { blocksOf, boxOf, conformersOf, formulaOf, formulaPlace, likeOf, linkOf, moleculeOf, openIn, placeRow, rowFrom, turnedOver, type Block, type Box, type Open } from "./chem/make3d";
import { centredAt } from "./utils/copyPaste";
import { Remake3D } from "./components/remake3d";
import { turnOnto } from "./utils/align3d";
import type { Molecule3D } from "./store/types";

function StructureCanvasContent({
  active,
  tabId,
  initialPayload,
  initialFilename,
  officeId,
  styleOpen,
  toggleStyle,
  openArrowStyle,
  openSaveAbbreviation,
}: {
  active: boolean;
  tabId: string;
  initialPayload?: string;
  initialFilename?: string;
  /** The object in a document this canvas was opened from (lib/ole). */
  officeId?: number;
  /** Whether the drawing-style panel is open beside the canvas. */
  styleOpen: boolean;
  toggleStyle: () => void;
  /** A reaction arrow's own style, in the panel beside the canvas. */
  openArrowStyle: (id: number) => void;
  /** The selected group saved as an abbreviation, in the panel beside the canvas. */
  openSaveAbbreviation: (ids: number[], smiles: string) => void;
}) {
  const fitNonce = useEditor((s) => s.fitNonce);
  const requestFit = useEditor((s) => s.requestFit);

  const {
    camRef,
    domRef,
    fileInputRef,
    handleDoubleClick,
    handleWrapperMouseMove,
    handleWrapperMouseLeave,
    handleWrapperClick,
    dropZone,
    onPickFiles,
    openFilePicker,
    importError,
    dismissImportError,
    handleMouseDownCapture,
    clientToWorld,
    pasteTarget,
  } = useStructureEvents(initialPayload, initialFilename);
  useOfficeLink(officeId);

  const onCreated = useCanvasSetup(camRef, domRef);

  // Save and export. Ctrl/Cmd+S belongs to the tab in front, like undo.
  const files = useFileActions();
  const { save, saveAs } = files;
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const intent = saveIntent(e);
      if (!intent) return;
      e.preventDefault();
      void (intent === "save" ? save() : saveAs());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, save, saveAs]);
  // RDKit: its marks on the structure and R/S on request; and clean-up, by
  // Meno's own layout engine (chem/cleanUp)
  const store = useEditorStore();
  const model = useEditor((s) => s.model);
  const marks = useChemMarks(model, active);
  const chemistry = useAppSettings((s) => s.chemistry);
  const setChemistry = useAppSettings((s) => s.setChemistry);
  const chem = useChem();
  const [chemError, setChemError] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const cleaningNow = useRef(false); // one clean-up at a time, keys included
  const runCleanUp = useCallback(
    (aroundAtom: number | Iterable<number> | null) => {
      if (cleaningNow.current) return;
      cleaningNow.current = true;
      setCleaning(true);
      setChemError(null);
      cleanUp(store, aroundAtom)
        .catch((e: unknown) =>
          setChemError(
            `Clean-up failed: ${e instanceof Error ? e.message : String(e)}`,
          ),
        )
        .finally(() => {
          cleaningNow.current = false;
          setCleaning(false);
        });
    },
    [store],
  );
  // The page in view, in world units: what the camera sees of it
  const viewBox = useCallback((): Box | null => {
    const cam = camRef.current;
    const el = domRef.current;
    if (!cam || !el || !cam.zoom) return null;
    const w = el.clientWidth / 2 / cam.zoom;
    const h = el.clientHeight / 2 / cam.zoom;
    return { x0: cam.position.x - w, x1: cam.position.x + w, y0: cam.position.y - h, y1: cam.position.y + h };
  }, [camRef, domRef]);
  // Structures made in 3D (chem/make3d): asked first about what their
  // drawing leaves open, then their conformers made and risen out of them
  const [ask3d, setAsk3d] = useState<{ blocks: Block[]; open: Open[]; replacing?: Molecule3D } | null>(null);
  // (what RDKit is doing for it, said meanwhile)
  const [working3d, setWorking3d] = useState<string | null>(null);
  const build3d = useCallback(
    async (blocks: Block[], isomers: "one" | "all", replacing?: Molecule3D) => {
      setWorking3d("Making the 3D structure…");
      setChemError(null);
      try {
        const chem = await chemWorker();
        const made: Parameters<ReturnType<typeof store.getState>["riseMolecules3d"]>[0] = [];
        let allInView = true;
        for (const block of blocks) {
          const ms = (await conformersOf(chem, block, isomers)).map((c) => moleculeOf(c, block));
          const model = store.getState().model;
          const turned = ms.map((m) => turnedOver(m, model, STYLE_3D));
          // beside the drawing, where they can be seen as the view is now -
          // or, made again, where the one made before stood
          const row = replacing
            ? { at: rowFrom(turned, replacing.at), inView: true }
            : placeRow(turned, boxOf(block.part), viewBox());
          allInView &&= row.inView;
          ms.forEach((m, i) =>
            made.push({ m: { ...m, at: row.at[i] }, turn: turned[i].turn, from: turned[i].start, flat: turned[i].flat }),
          );
        }
        store.getState().riseMolecules3d(made, replacing ? [replacing.id] : []);
        // (with no room for them in view, the view takes them in)
        if (!allInView) requestFit();
      } catch (e: unknown) {
        setChemError(`No 3D structure could be made: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setWorking3d(null);
      }
    },
    [store, viewBox, requestFit],
  );
  const make3d = useCallback(
    async (around: Iterable<number>, replacing?: Molecule3D) => {
      // (made again: what the drawing leaves open, as the one before has it)
      const blocks = blocksOf(store.getState().model, around).map((b) =>
        replacing ? { ...b, like: likeOf(b, replacing) } : b,
      );
      if (!blocks.length) return;
      setChemError(null);
      try {
        const chem = await chemWorker();
        const open = await Promise.all(
          blocks.map(async (b) =>
            openIn(b, await chem.request("open_stereo", { molblock: b.molblock, ...(b.like ? { like: b.like } : {}) })),
          ),
        );
        // (stereo drawn without a configuration: asked what to make first)
        if (open.some((o) => o.atoms.length || o.bonds.length)) setAsk3d({ blocks, open, replacing });
        else await build3d(blocks, "one", replacing);
      } catch (e: unknown) {
        setChemError(`No 3D structure could be made: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [store, build3d],
  );
  // A molecule in 3D made again from its drawing, which has changed since:
  // in its place, as one undo step
  const remake3d = useCallback(
    (id: number) => {
      const { molecules3d: ms, model: m } = store.getState();
      const mol = ms.find((x) => x.id === id);
      const present = new Set(m.atoms.map((a) => a.id));
      const atoms = (mol?.drawnFrom ?? []).filter((a): a is number => a != null && present.has(a));
      if (mol && atoms.length) void make3d(atoms, mol);
    },
    [store, make3d],
  );
  // A molecule in 3D drawn as a formula beside it - by Meno's engine, from
  // the frame it shows - and tied to it, as one undo step
  const drawFormula = useCallback(
    async (id: number) => {
      const st = store.getState();
      const mol = st.molecules3d.find((x) => x.id === id);
      if (!mol) return;
      setWorking3d("Drawing the formula…");
      setChemError(null);
      try {
        const { model: formula, link } = await formulaOf(await chemWorker(), mol, st.frames3d[id] ?? 0);
        const placed = centredAt(formula, formulaPlace(mol, formula, STYLE_3D));
        store.getState().drawFormula3d(id, placed, link);
        // (beyond the view, the view takes it in)
        const view = viewBox();
        if (view && placed.atoms.some((a) => a.x < view.x0 || a.x > view.x1 || a.y < view.y0 || a.y > view.y1)) requestFit();
      } catch (e: unknown) {
        setChemError(`The formula could not be drawn: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setWorking3d(null);
      }
    },
    [store, viewBox, requestFit],
  );
  // A molecule in 3D turned to lie as its drawing does, as it did as it rose
  const turnLikeDrawing = useCallback(
    (id: number) => {
      const st = store.getState();
      const mol = st.molecules3d.find((x) => x.id === id);
      if (!mol?.drawnFrom) return;
      const solid = solidOf(mol, STYLE_3D);
      const places = solid.frames[frameOf(solid, st.frames3d[id])];
      const byId = new Map(st.model.atoms.map((a) => [a.id, a]));
      const from: number[] = [];
      const to: number[] = [];
      mol.drawnFrom.forEach((aid, i) => {
        const a = aid == null ? undefined : byId.get(aid);
        if (!a) return;
        from.push(places[3 * i], places[3 * i + 1], places[3 * i + 2]);
        to.push(a.x, a.y);
      });
      if (to.length >= 4) st.setTurn3d(id, turnOnto(from, to));
    },
    [store],
  );
  // What is under the pointer is what a key acts on: Delete deletes it, and
  // the clean-up key cleans up the structure it is in (everything, when the
  // pointer is on nothing) - unless something is selected: then the keys
  // act on the selection, and the structures it is in.
  const hoveredPart = useCallback((): MenuTarget["kind"] | null => {
    const { hovered } = store.getState();
    return hovered.atomId != null
      ? "atom"
      : hovered.bondId != null
        ? "bond"
        : null;
  }, [store]);
  const structureAt = useCallback(
    (kind: MenuTarget["kind"] | null, id: number | null) => {
      if (kind === "atom") return id;
      const { model: m } = store.getState();
      return m.bonds.find((b) => b.id === id)?.a ?? null;
    },
    [store],
  );
  const deletePart = useCallback(
    (kind: MenuTarget["kind"], id: number) => {
      const st = store.getState();
      if (st.labelEdit.active || st.moveDrag.active || st.extend.active) return;
      if (kind === "atom") st.deleteAtom(id);
      else st.deleteBond(id);
    },
    [store],
  );
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  // Copy, cut and paste, by the keys and from the menu
  const clip = useClipboardActions(store, setChemError);
  const chargeAtom = useCallback(
    (id: number, step: 1 | -1) => {
      const st = store.getState();
      if (st.labelEdit.active || st.moveDrag.active || st.extend.active) return;
      st.stepCharge(id, step);
    },
    [store],
  );
  const radicalAtom = useCallback(
    (id: number) => {
      const st = store.getState();
      if (st.labelEdit.active || st.moveDrag.active || st.extend.active) return;
      st.toggleRadical(id);
    },
    [store],
  );
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const st = store.getState();
      const { hovered, sel } = st;
      const kind = hoveredPart();
      const id = kind === "atom" ? hovered.atomId : hovered.bondId;
      const drawingSelected = sel.atoms.size > 0 || sel.bonds.size > 0;
      const selected = drawingSelected || st.sel3d.size > 0;
      const busy = st.labelEdit.active || st.moveDrag.active || st.extend.active;
      if (isCleanUpKey(e)) {
        e.preventDefault();
        runCleanUp(drawingSelected ? sel.atoms : structureAt(kind, id));
      } else if (isDeleteKey(e) && !busy && st.hoveredMeasure3d) {
        // a measurement under the pointer, before anything else
        e.preventDefault();
        st.removeMeasure3d(st.hoveredMeasure3d.id, st.hoveredMeasure3d.measure);
        st.setHoveredMeasure3d(null);
      } else if (isDeleteKey(e) && selected) {
        e.preventDefault();
        if (!busy) st.deleteSelection();
      } else if (isDeleteKey(e) && kind && id != null) {
        e.preventDefault();
        deletePart(kind, id);
      } else if (isDeleteKey(e) && !busy && st.hoveredArrow != null && st.arrows.some((a) => a.id === st.hoveredArrow)) {
        // a reaction arrow under the pointer, and nothing else
        e.preventDefault();
        st.removeArrow(st.hoveredArrow);
        st.setHoveredArrow(null);
      } else if (isDeleteKey(e) && !busy && st.hoveredPlus != null && st.pluses.some((p) => p.id === st.hoveredPlus)) {
        e.preventDefault();
        st.removePlus(st.hoveredPlus);
        st.setHoveredPlus(null);
      } else if (isDeleteKey(e) && !busy && st.hovered3d) {
        // a molecule in 3D under the pointer
        e.preventDefault();
        st.removeMolecule3d(st.hovered3d.id);
      } else if (chargeStep(e) && kind === "atom" && id != null) {
        e.preventDefault();
        chargeAtom(id, chargeStep(e) as 1 | -1);
      } else if (clipboardIntent(e)) {
        e.preventDefault();
        const what = clipboardIntent(e);
        if (what === "copy") void clip.copy();
        else if (what === "cut") void clip.cut();
        else void clip.paste(pasteTarget());
      } else if (isSelectAllKey(e) && !busy) {
        e.preventDefault();
        st.selectAll();
      } else if (isDeselectKey(e) && (selected || st.chosen3d) && !busy && !menu) {
        // (Esc with the menu open closes the menu only)
        st.clearSel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, store, runCleanUp, hoveredPart, structureAt, deletePart, chargeAtom, menu, clip, pasteTarget]);
  // The same, from the mouse alone: a menu at the pointer on a right-click.
  const closeMenu = useCallback(() => setMenu(null), []);
  // a molecule in 3D right-clicked: what its menu does to it
  const molecules3d = useEditor((s) => s.molecules3d);
  const chosen3d = useEditor((s) => s.chosen3d);
  const menuMolecule = menu?.kind === "molecule3d" ? molecules3d.find((m) => m.id === menu.id) : undefined;
  const menuLink = menuMolecule ? linkOf(menuMolecule, model) : null;
  const menu3d: MenuMolecule3D | undefined = menuMolecule
    ? {
        look: lookOf(menuMolecule, STYLE_3D),
        chosen: chosen3d?.id === menuMolecule.id ? (chosenPath(menuMolecule, chosen3d)?.length ?? 0) : 0,
        onMeasure: () => store.getState().measureChosen3d(),
        onLook: (look) => store.getState().setLook3d(menuMolecule.id, look),
        onResetTurn: () => store.getState().resetTurn3d(menuMolecule.id),
        onCut: () => void clip.cut(menuMolecule.id),
        onCopy: () => void clip.copy(menuMolecule.id),
        ...(menuLink === "live" || menuLink === "changed" ? { onTurnLikeDrawing: () => turnLikeDrawing(menuMolecule.id) } : {}),
        ...(menuLink === "changed" ? { onRemake: () => remake3d(menuMolecule.id) } : {}),
        ...(menuLink == null || menuLink === "gone" ? { onDrawFormula: () => void drawFormula(menuMolecule.id) } : {}),
        ...((menuMolecule.frames?.length ?? 0) > 0
          ? {
              overlay: {
                on: !!store.getState().overlay3d[menuMolecule.id],
                conformers: !!menuMolecule.conformerSet,
                set: (on: boolean) => store.getState().setOverlay3d(menuMolecule.id, on),
              },
            }
          : {}),
      }
    : undefined;
  useEffect(() => setMenu(null), [model]); // what it was about may be gone
  // A right-drag moves the view, so the menu waits for the button to come
  // up without having travelled. macOS asks for the menu as the button goes
  // down, Windows as it comes up: either way it opens only then.
  const rightPress = useRef<{
    x: number;
    y: number;
    down: boolean;
    moved: boolean;
    pending: MenuTarget | null;
  } | null>(null);
  const onRightDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 2) {
      rightPress.current = null; // a Ctrl-click on a Mac starts afresh
      return;
    }
    rightPress.current = {
      x: e.clientX,
      y: e.clientY,
      down: true,
      moved: false,
      pending: null,
    };
  };
  const onRightMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = rightPress.current;
    if (!r?.down || r.moved) return;
    if (Math.hypot(e.clientX - r.x, e.clientY - r.y) > 4) r.moved = true;
  };
  const onRightUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = rightPress.current;
    if (e.button !== 2 || !r) return;
    r.down = false;
    if (r.pending && !r.moved) setMenu(r.pending);
    r.pending = null;
  };
  const openMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    // A card's text field keeps the system's own menu - cut, copy, paste.
    if (e.target !== domRef.current) return;
    e.preventDefault(); // no browser menu over the drawing
    const { hovered, hoveredArrow, arrows, hoveredPlus, pluses, hovered3d, sel3d, hoveredMeasure3d } = store.getState();
    const box = e.currentTarget.getBoundingClientRect();
    const place = {
      at: clientToWorld(e.clientX, e.clientY) ?? pasteTarget(),
      x: e.clientX - box.left,
      y: e.clientY - box.top,
      within: { width: box.width, height: box.height },
    };
    const kind = hoveredPart();
    const r = rightPress.current;
    const open = (target: MenuTarget) => {
      if (r?.down) r.pending = target; // macOS: open on the way up
      else if (!r?.moved) setMenu(target); // Windows, or a Ctrl-click on a Mac
    };
    // over a measurement's value, on a molecule in 3D: its own menu
    if (hoveredMeasure3d) {
      open({ kind: "measure3d", id: hoveredMeasure3d.id, measure: hoveredMeasure3d.measure, selection: "none", ...place });
      return;
    }
    // on a molecule in 3D: its own menu, or the selection's when it is in it
    if (hovered3d) {
      const { sel } = store.getState();
      const drawing = sel.atoms.size > 0 || sel.bonds.size > 0;
      const here = sel3d.has(hovered3d.id);
      open({
        kind: "molecule3d",
        id: hovered3d.id,
        selection: here ? "here" : drawing || sel3d.size ? "elsewhere" : "none",
        drawing,
        ...place,
      });
      return;
    }
    // on a reaction arrow, and nothing else: the arrow's menu
    if (!kind && hoveredArrow != null && arrows.some((a) => a.id === hoveredArrow)) {
      const target: MenuTarget = { kind: "arrow", id: hoveredArrow, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    // likewise a "+"
    if (!kind && hoveredPlus != null && pluses.some((p) => p.id === hoveredPlus)) {
      const target: MenuTarget = { kind: "plus", id: hoveredPlus, selection: "none", ...place };
      if (r?.down) r.pending = target;
      else if (!r?.moved) setMenu(target);
      return;
    }
    const id = kind === "atom" ? hovered.atomId : hovered.bondId;
    // on something selected, or on nothing with a selection: the
    // selection's menu; on nothing else, the canvas's (paste, select all)
    const { sel } = store.getState();
    const part = kind && id != null;
    const drawing = sel.atoms.size > 0 || sel.bonds.size > 0;
    const selected = drawing || sel3d.size > 0;
    const onSelected =
      part &&
      (kind === "atom" ? sel.atoms.has(id) : sel.bonds.has(id));
    const target: MenuTarget = {
      kind: part ? kind : null,
      id: part ? id : null,
      selection: !selected ? "none" : onSelected || !part ? "here" : "elsewhere",
      drawing,
      ...place,
    };
    if (r?.down) r.pending = target; // macOS: open on the way up
    else if (!r?.moved) setMenu(target); // Windows, or a Ctrl-click on a Mac
  };
  const toggleStereoLabels = () => {
    const stereoLabels = !chemistry.stereoLabels;
    setChemistry({ ...chemistry, stereoLabels });
    if (!stereoLabels) return;
    // asked for: RDKit set up now, if it has not been
    setChemError(null);
    chemWorker().catch((e: unknown) => {
      setChemistry({ ...useAppSettings.getState().chemistry, stereoLabels: false });
      setChemError(
        `R and S cannot be shown: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
  };

  const alert = importError ?? files.error ?? chemError;
  const dismissAlert = importError
    ? dismissImportError
    : files.error
      ? files.dismissError
      : () => setChemError(null);
  const ownStyle = useEditor((s) => s.docStyle != null);
  // Where the view starts, before there is anything to fit
  const style = useDrawingStyle();
  const [startZoom] = useState(() => startingZoom(style));
  // Drops on the drawing: files, and objects and pictures out of Office (lib/drop)
  const dropRef = useRef<HTMLDivElement>(null);
  useDropZone(dropRef, dropZone);
  // SMILES in and out, by RDKit, in a card over the canvas's corner
  const [smilesOpen, setSmilesOpen] = useState(false);

  return (
    <div
      ref={dropRef}
      className="flex-1 min-w-0 h-full relative"
      onMouseDownCapture={handleMouseDownCapture}
      onMouseMove={handleWrapperMouseMove}
      onMouseLeave={handleWrapperMouseLeave}
      onClick={handleWrapperClick}
      onContextMenu={openMenu}
      onPointerDownCapture={onRightDown}
      onPointerMoveCapture={onRightMove}
      onPointerUpCapture={onRightUp}
    >
      {/* Hidden file input for Open (replace) */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={[".mol", ".sdf", ".rxn", ".xyz", ".meno"].join(",")}
        onChange={(e) => {
          if (e.target.files) onPickFiles(e.target.files);
          // Allow picking the same file again.
          e.target.value = "";
        }}
      />
      {/* Import error */}
      {alert && (
        <div
          role="alert"
          className="absolute top-3 left-1/2 -translate-x-1/2 z-50 max-w-[90%] flex items-start gap-2 rounded-md border border-gh-line bg-white/95 shadow-sm px-3 py-2 text-xs text-gh-black"
        >
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-accel-accent" />
          <span className="break-words">{alert}</span>
          <button
            aria-label="Dismiss"
            title="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              dismissAlert();
            }}
            className="h-4 w-4 shrink-0 rounded-full hover:bg-gh-line"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* Fit / Open buttons */}
      <div className="absolute left-3 bottom-3 z-50 flex gap-2">
        <button
          aria-label="Fit to content"
          title="Fit to content"
          onClick={() => requestFit()}
          className="h-9 w-9 rounded-full border border-gh-line bg-white/90 hover:bg-gray-100 shadow-sm flex items-center justify-center"
        >
          <ArrowsPointingInIcon className="h-5 w-5 text-gh-black" />
        </button>
        <button
          aria-label="Open structure file"
          title="Open structure file (replaces the canvas)"
          onClick={(e) => {
            e.stopPropagation();
            openFilePicker();
          }}
          className="h-9 w-9 rounded-full border border-gh-line bg-white/90 hover:bg-gray-100 shadow-sm flex items-center justify-center"
        >
          <FolderOpenIcon className="h-5 w-5 text-gh-black" />
        </button>
        <button
          aria-label="Save structure"
          title="Save (Ctrl/Cmd+S; with Shift, Save As)"
          onClick={(e) => {
            e.stopPropagation();
            void (e.shiftKey ? saveAs() : save());
          }}
          className="h-9 w-9 rounded-full border border-gh-line bg-white/90 hover:bg-gray-100 shadow-sm flex items-center justify-center"
        >
          <ArrowDownTrayIcon className="h-5 w-5 text-gh-black" />
        </button>
        <button
          aria-label="Export as SVG"
          title="Export the drawing as an SVG picture"
          onClick={(e) => {
            e.stopPropagation();
            void files.exportSvg();
          }}
          className="h-9 w-9 rounded-full border border-gh-line bg-white/90 hover:bg-gray-100 shadow-sm flex items-center justify-center"
        >
          <PhotoIcon className="h-5 w-5 text-gh-black" />
        </button>
        <button
          aria-label="Drawing style"
          aria-pressed={styleOpen}
          title={
            ownStyle
              ? "Drawing style (this document has its own)"
              : "Drawing style"
          }
          onClick={(e) => {
            e.stopPropagation();
            toggleStyle();
          }}
          className={
            "relative h-9 w-9 rounded-full border shadow-sm flex items-center justify-center " +
            (styleOpen
              ? "border-accel-base bg-accel-lightbase"
              : "border-gh-line bg-white/90 hover:bg-gray-100")
          }
        >
          <SwatchIcon className="h-5 w-5 text-gh-black" />
          {ownStyle && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accel-base" />
          )}
        </button>
        <button
          aria-label="SMILES"
          aria-pressed={smilesOpen}
          title="SMILES in and out"
          onClick={(e) => {
            e.stopPropagation();
            setSmilesOpen((v) => !v);
          }}
          className={
            "h-9 w-9 rounded-full border shadow-sm flex items-center justify-center " +
            (smilesOpen
              ? "border-accel-base bg-accel-lightbase"
              : "border-gh-line bg-white/90 hover:bg-gray-100")
          }
        >
          <CodeBracketIcon className="h-5 w-5 text-gh-black" />
        </button>
        <button
          aria-label="Clean up"
          title="Clean up: even bonds and angles, over where it is drawn (Ctrl/Cmd+Shift+K; with the pointer on a structure, just that one)"
          disabled={cleaning || model.bonds.length === 0}
          onClick={(e) => {
            e.stopPropagation();
            runCleanUp(null);
          }}
          className="h-9 w-9 rounded-full border border-gh-line bg-white/90 hover:bg-gray-100 shadow-sm flex items-center justify-center disabled:opacity-40 disabled:hover:bg-white/90"
        >
          <SparklesIcon className="h-5 w-5 text-gh-black" />
        </button>
        <button
          aria-label="Show R and S"
          aria-pressed={chemistry.stereoLabels}
          title="R and S at stereocentres, E and Z at double bonds, Ra and Sa at axes"
          onClick={(e) => {
            e.stopPropagation();
            toggleStereoLabels();
          }}
          className={
            "h-9 w-9 rounded-full border shadow-sm flex items-center justify-center text-[11px] font-semibold text-gh-black " +
            (chemistry.stereoLabels
              ? "border-accel-base bg-accel-lightbase"
              : "border-gh-line bg-white/90 hover:bg-gray-100")
          }
        >
          <span>
            <i>R</i>/<i>S</i>
          </span>
        </button>
      </div>
      {active &&
        (chem.state === "setting-up" || chem.state === "starting" || working3d) && (
          <div
            role="status"
            className="absolute right-3 bottom-3 z-50 rounded-full border border-gh-line bg-white/95 shadow-sm px-3 py-1.5 text-xs text-gh-gray"
          >
            {chem.state === "setting-up"
              ? "Setting up RDKit…"
              : chem.state === "starting"
                ? "Starting RDKit…"
                : working3d}
          </div>
        )}
      {ask3d && (
        <Ask3D
          open={ask3d.open}
          onAll={() => {
            setAsk3d(null);
            void build3d(ask3d.blocks, "all", ask3d.replacing);
          }}
          onOne={() => {
            setAsk3d(null);
            void build3d(ask3d.blocks, "one", ask3d.replacing);
          }}
          onCancel={() => setAsk3d(null)}
        />
      )}
      {smilesOpen && <SmilesPanel onClose={() => setSmilesOpen(false)} />}
      {menu && (
        <PartMenu
          target={menu}
          onClose={closeMenu}
          onDelete={() => {
            const st = store.getState();
            if (menu.kind === "arrow" && menu.id != null) st.removeArrow(menu.id);
            else if (menu.kind === "plus" && menu.id != null) st.removePlus(menu.id);
            else if (menu.kind === "measure3d" && menu.id != null && menu.measure != null) st.removeMeasure3d(menu.id, menu.measure);
            else if (menu.selection === "here") st.deleteSelection();
            else if (menu.kind === "molecule3d" && menu.id != null) st.removeMolecule3d(menu.id);
            else if (menu.kind && menu.id != null) deletePart(menu.kind, menu.id);
          }}
          molecule3d={menu3d}
          onArrowStyle={() => {
            if (menu.kind === "arrow" && menu.id != null) openArrowStyle(menu.id);
          }}
          onAddArrow={() => store.getState().addArrow(menu.at.x, menu.at.y)}
          onSaveAbbreviation={() => {
            const { model: m, sel } = store.getState();
            const made = abbreviationFromSelection(m, sel.atoms);
            if ("problem" in made) setChemError(`This selection cannot be saved as an abbreviation. ${made.problem}`);
            else openSaveAbbreviation([...sel.atoms], made.smiles);
          }}
          onAddPlus={() => store.getState().addPlus(menu.at.x, menu.at.y)}
          onCleanUp={() =>
            runCleanUp(
              menu.selection === "here"
                ? store.getState().sel.atoms
                : structureAt(menu.kind, menu.id),
            )
          }
          onMake3d={() => {
            const around = menu.selection === "here" ? store.getState().sel.atoms : structureAt(menu.kind, menu.id);
            if (around != null) void make3d(typeof around === "number" ? [around] : around);
          }}
          onSelectStructure={() => {
            const at = structureAt(menu.kind, menu.id);
            if (at != null) store.getState().selectStructure(at);
          }}
          onTurnOver={(axis) => store.getState().turnSelectionOver(axis)}
          onCharge={(step) => {
            if (menu.kind === "atom" && menu.id != null) chargeAtom(menu.id, step);
          }}
          onRadical={() => {
            if (menu.kind === "atom" && menu.id != null) radicalAtom(menu.id);
          }}
          radical={!!model.atoms.find((a) => a.id === menu.id)?.radical}
          onExpand={
            menu.kind === "atom" && menu.id != null && expandable(model.atoms.find((a) => a.id === menu.id))
              ? () => store.getState().expandAbbreviation(menu.id!)
              : undefined
          }
          clipboard={{
            onCut: () => void clip.cut(),
            onCopy: () => void clip.copy(),
            onCopySmiles: () => void clip.copySmiles(),
            onPaste: () => void clip.paste(menu.at),
            onSelectAll: () => store.getState().selectAll(),
          }}
        />
      )}
      {/* (a molecule in 3D made again from its changed drawing: asked of RDKit here) */}
      <Remake3D.Provider value={remake3d}>
      <Canvas
        key={tabId}
        // The page is seen head-on, in perspective (PageCamera): drawn just
        // as an orthographic camera draws it, while what stands off it - a
        // 3D molecule - is seen in depth.
        camera={{ position: [0, 0, PAGE_DISTANCE], fov: 50, near: 0.1, far: 2000, zoom: startZoom }}
        // Render on demand: interactions, store changes and the animation
        // layers request frames (see PanZoom2D and the preview components)
        // instead of redrawing continuously while nothing changes.
        frameloop={active ? "demand" : "never"}
        dpr={CANVAS_DPR}
        onDoubleClick={handleDoubleClick}
        gl={{
          antialias: true,
          alpha: false,
          depth: true,
          stencil: false,
          powerPreference: "high-performance",
        }}
        onCreated={onCreated}
      >
        <color attach="background" args={["#ffffff"]} />
        <FitToContent2D trigger={fitNonce} />
        {/* The drawing, laid out once for every layer below to draw from */}
        <DrawnLayoutProvider>
          {/* Bonds */}
          <Bonds2D />
          <Atoms2D />
          {/* Bond picking */}
          <BondsPick2D />
          {/* Join caps */}
          <JoinCaps2D />
          {/* Shapes and labels */}
          <AromaticCircles2D />
          <Wedges2D />
          {/* Atom hover rings */}
          <AtomsHoverRings2D />
          {/* what is selected, the box or lasso selecting, the handle turning it */}
          <Selection2D />
          {/* A label's font is read before it is drawn: the rest of the
              drawing does not wait for it, nor go if it cannot be read. */}
          <Suspense fallback={null}>
            <Labels2D />
          </Suspense>
          {/* RDKit's marks: valence problems, R/S and E/Z */}
          <ChemMarks2D marks={marks} />
          {/* the atom a molecule in 3D under the pointer was made from */}
          <LinkedHover2D />
          {/* stereo drawn without a configuration, while Meno asks about it */}
          <OpenStereo2D atoms={ask3d?.open.flatMap((o) => o.atoms) ?? NO_IDS} bonds={ask3d?.open.flatMap((o) => o.bonds) ?? NO_IDS} />
          {/* Label editor */}
          <LabelEditor2D />
          {/* Hover overlay */}
          <ExtendPreview2D />
          {/* The 120-degree arc while a bond snaps to it */}
          <SnapArc2D />
          {/* Move preview */}
          <MovePreview2D />
          <HoverOverlay2D />
          {/* A reaction scheme's arrows and "+" signs */}
          <Arrows2D />
          <Pluses2D />
        </DrawnLayoutProvider>
        {/* Molecules in 3D standing on the page (before PanZoom2D: a press on one is theirs) */}
        <Molecules3D />
        <PanZoom2D />
        <PageCamera />
      </Canvas>
      </Remake3D.Provider>
    </div>
  );
}

export default function StructureCanvas({
  tabId,
  initialPayload,
  initialFilename,
  officeId,
  active = true,
  document,
}: {
  tabId: string;
  initialPayload?: string;
  initialFilename?: string;
  /** The object in a document it was opened from, when it was (lib/ole). */
  officeId?: number;
  /** False while the owning tab is hidden: pauses the render loop. */
  active?: boolean;
  /** The tab's document; omitted for canvases embedded in other views. */
  document?: DocumentStore<StructureDocument>;
}) {
  // The document's drawing style - or one reaction arrow's own - opens in a
  // panel beside the canvas rather than over it, so the drawing stays in
  // view while it changes. One panel at a time.
  const [panel, setPanel] = useState<
    "style" | { arrow: number } | { abbreviation: { ids: number[]; smiles: string } } | null
  >(null);
  const styleOpen = panel === "style";
  return (
    <EditorProvider tabId={tabId} document={document}>
      <div className="w-full h-full flex">
        <StructureCanvasContent
          active={active}
          tabId={tabId}
          initialPayload={initialPayload}
          initialFilename={initialFilename}
          officeId={officeId}
          styleOpen={styleOpen}
          toggleStyle={() => setPanel((p) => (p === "style" ? null : "style"))}
          openArrowStyle={(id) => setPanel({ arrow: id })}
          openSaveAbbreviation={(ids, smiles) => setPanel({ abbreviation: { ids, smiles } })}
        />
        {styleOpen && <DocumentStylePanel onClose={() => setPanel(null)} />}
        {panel && panel !== "style" && "arrow" in panel && (
          <ArrowStylePanel
            key={panel.arrow}
            arrowId={panel.arrow}
            onClose={() => setPanel(null)}
          />
        )}
        {panel && panel !== "style" && "abbreviation" in panel && (
          <SaveAbbreviationPanel
            key={panel.abbreviation.ids.join(",")}
            ids={panel.abbreviation.ids}
            smiles={panel.abbreviation.smiles}
            onClose={() => setPanel(null)}
          />
        )}
      </div>
    </EditorProvider>
  );
}
