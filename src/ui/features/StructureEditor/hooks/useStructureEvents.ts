import * as THREE from "three";
import { pageAt } from "../utils/page";
import { useEffect, useRef, useState } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { useEditorStore } from "../store";
import { ATOM_HOVER_RING_RADIUS_RATIO, DOUBLE_CLICK_MS } from "../constants";
import { calculateNewBondPosition } from "../utils/geometry";
import { clickClock, doubleClickedSince, noteClick } from "../utils/clickCount";
import { endsDrag, movePress, startPress, type Press } from "../utils/press";
import { editorModelOf, processFileContent, type ProcessedFileResult } from "../utils/io";
import { schemeOf, type ImportedScheme } from "../document";
import { structureInDrop } from "../chem/fromClipboard";
import { centredAt } from "../utils/copyPaste";
import type { Model } from "../store/types";
import { STYLE_3D } from "../../../../lib/chem/style3d";
import { rowAbout, solidOf } from "../utils/molecule3d";
import type { DropZone, Dropped } from "../../../../lib/drop";

/** The files a drop opens as structures, beside what is drawn. */
const STRUCTURE_FILE = /\.(mol|sdf|rxn|xyz)$/i;
import { readRecord } from "../utils/copyPaste";
import { addsToSelection } from "../../../../lib/doc/shortcuts";

export function useStructureEvents(
  initialPayload?: string,
  initialFilename?: string,
) {
  const store = useEditorStore();

  // Refs
  const camRef = useRef<THREE.PerspectiveCamera | null>(null);
  const domRef = useRef<HTMLCanvasElement | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  // The press the next click ends, and whether it has travelled (utils/press)
  const pressRef = useRef<Press | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Where the pointer is over the drawing, in the window; null off it
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  // Last import failure, shown in the canvas until dismissed or replaced.
  const [importError, setImportError] = useState<string | null>(null);
  const reportImportError = (what: string, err: unknown) => {
    console.warn(`${what} import failed`, err);
    setImportError(err instanceof Error ? err.message : String(err));
  };

  // Helper: Client to World conversion
  const clientToWorld = (clientX: number, clientY: number) => {
    if (!camRef.current || !domRef.current)
      return null as { x: number; y: number } | null;
    const rect = domRef.current.getBoundingClientRect();
    const v = new THREE.Vector3(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
      0,
    );
    const p = pageAt(v.x, v.y, camRef.current);
    return { x: p.x, y: p.y };
  };

  // An import is one undo step: the model goes into the document as a whole,
  // rather than being replayed atom by atom.
  const toModel = editorModelOf;

  // A file's reaction arrow and pluses, moved by (dx, dy) along with its
  // atoms, and its molecules in 3D standing in a row about `at`: placed in
  // the same edit as its atoms are.
  const importedScheme = (
    result: Pick<ProcessedFileResult, "arrow" | "pluses" | "molecules3d">,
    dx: number,
    dy: number,
    at: { x: number; y: number } = { x: 0, y: 0 },
  ): ImportedScheme => {
    const a = result.arrow;
    const solids = (result.molecules3d ?? []).map((m) => ({ ...m, id: 0, at }));
    const places = rowAbout(at, solids.map((m) => solidOf(m, STYLE_3D).reach));
    return {
      ...(solids.length ? { molecules3d: solids.map(({ id: _id, ...m }, i) => ({ ...m, at: places[i] })) } : {}),
      arrows: a
        ? [
            {
              x: (a.x1 + a.x2) / 2 + dx,
              y: (a.y1 + a.y2) / 2 + dy,
              angle: Math.atan2(a.y2 - a.y1, a.x2 - a.x1),
              length: Math.hypot(a.x2 - a.x1, a.y2 - a.y1),
            },
          ]
        : [],
      pluses: (result.pluses ?? []).map((p) => ({ x: p.x + dx, y: p.y + dy })),
    };
  };

  // Effect: Initial Payload
  const importedInitial = useRef(false);
  useEffect(() => {
    (async () => {
      if (!initialPayload || importedInitial.current) return;
      // One import per canvas: this effect runs twice under StrictMode, and
      // importing twice would leave two undo steps for a single file.
      importedInitial.current = true;
      // A structure from a document (lib/ole): Meno's own record, taken as it is.
      if (/\.meno$/i.test(initialFilename ?? "")) {
        const record = readRecord(initialPayload);
        if (record) store.getState().openModel(record, schemeOf(record));
        else reportImportError("initial payload", new Error("The document's structure could not be read."));
        return;
      }
      try {
        const result = await processFileContent(
          initialFilename || "",
          initialPayload,
        );
        const shifted = {
          atoms: result.model.atoms.map((a) => ({
            ...a,
            x: a.x - result.centroid.x,
            y: a.y - result.centroid.y,
          })),
          bonds: result.model.bonds,
        };
        // The file the tab was opened with is where its document starts:
        // nothing to undo, nothing unsaved.
        store
          .getState()
          .openModel(
            toModel(shifted),
            importedScheme(result, -result.centroid.x, -result.centroid.y),
          );
      } catch (e) {
        reportImportError("initial payload", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect: Keydown Listener
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const st = store.getState();
      if (st.labelEdit.active) return;
      const t = ev.target as Element | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          (t as HTMLElement).isContentEditable)
      ) {
        return;
      }
      // Future key handling logic here
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);

  // Event Handlers

  const handleDoubleClick = (e: any) => {
    try {
      (e as any).stopPropagation?.();
    } catch {}
    if (clickTimerRef.current != null) {
      try {
        window.clearTimeout(clickTimerRef.current);
      } catch {}
      clickTimerRef.current = null;
    }
    if (!camRef.current || !domRef.current) return;
    // (twice on a molecule in 3D: nothing drawn on the page under it)
    if (store.getState().hovered3d) return;
    // (Ctrl or ⌘, or Shift, clicked twice: the selection's, not a bond drawn)
    if (addsToSelection(e) || e.shiftKey) return;
    const stNow = store.getState();
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (stNow.suppressDblClickUntil && nowMs < stNow.suppressDblClickUntil)
      return;
    if (stNow.extend.active) return;

    const rect = domRef.current.getBoundingClientRect();
    const ndc = new THREE.Vector3(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      0,
    );
    ndc.copy(pageAt(ndc.x, ndc.y, camRef.current));

    const st = store.getState();
    const atoms = st.model.atoms;
    const bonds = st.model.bonds;

    const id2 = new Map<number, { x: number; y: number }>();
    for (const a of atoms) id2.set(a.id, { x: a.x, y: a.y });
    const L = NOMINAL_BOND_LENGTH;

    const hoveredAtomId = st.hovered.atomId;
    if (hoveredAtomId != null) {
      const base = atoms.find((a) => a.id === hoveredAtomId);
      if (base) {
        // A double-click slower than the drawing's own reckoning of one
        // (the system's double-click time can be set longer) may find its
        // first click already editing this atom's label, nothing typed yet:
        // it was a double-click, so that edit is taken back.
        const edit = st.labelEdit;
        if (
          edit.active &&
          edit.atomId === base.id &&
          edit.opened &&
          nowMs - edit.opened.at < 2 * DOUBLE_CLICK_MS &&
          edit.value === edit.opened.value
        ) {
          st.cancelLabelEdit();
        }
        const neighbors: { x: number; y: number }[] = [];
        for (const b of bonds) {
          if (b.a === base.id || b.b === base.id) {
            const otherId = b.a === base.id ? b.b : b.a;
            const p = id2.get(otherId);
            if (p) neighbors.push(p);
          }
        }

        const newPos = calculateNewBondPosition(
          base,
          neighbors,
          atoms,
          { x: ndc.x, y: ndc.y },
          L,
        );
        const nx = newPos.x;
        const ny = newPos.y;

        const near = store
          .getState()
          .findAtomNear(nx, ny, NOMINAL_BOND_LENGTH * 0.3, base.id);
        // One gesture, one undo step: the atom and its bond together.
        if (near != null) {
          st.connectAtoms(base.id, near, 1);
        } else {
          st.addAtomBonded(base.id, nx, ny, "C", 1);
        }
        return;
      }
    }

    const nowMs2 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (stNow.suppressDblClickUntil && nowMs2 < stNow.suppressDblClickUntil)
      return;

    const half = L * 0.5;
    const theta = Math.PI / 6;
    const dx = half * Math.cos(theta);
    const dy = half * Math.sin(theta);
    const ax = ndc.x - dx;
    const ay = ndc.y - dy;
    const bx = ndc.x + dx;
    const by = ndc.y + dy;
    st.addBondedPair({ x: ax, y: ay, el: "C" }, { x: bx, y: by, el: "C" }, 1);
    try {
      store.getState().suppressDoubleClick(320);
    } catch {}
  };

  const handleWrapperMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (pressRef.current && (e.buttons & 1) !== 0)
      pressRef.current = movePress(pressRef.current, e.clientX, e.clientY);
    const st = store.getState();
    // Over a button or a card, nothing on the drawing is under the pointer,
    // whatever is drawn beneath it: a key pressed there must not reach it.
    if (e.target !== domRef.current) {
      pointerRef.current = null;
      st.clearAtomHover();
      return;
    }
    pointerRef.current = { x: e.clientX, y: e.clientY };
    // A molecule in 3D stands over the page: what is drawn under it is not
    // under the pointer.
    if (st.hovered3d) {
      st.clearAtomHover();
      return;
    }
    const p = clientToWorld(e.clientX, e.clientY);
    if (!p) return;
    const tol = ATOM_HOVER_RING_RADIUS_RATIO * NOMINAL_BOND_LENGTH;
    const id = st.findAtomNear(p.x, p.y, tol, null);
    if (id != null) st.setHoveredFromId(id);
    else st.clearAtomHover();
  };

  const handleWrapperMouseLeave = () => {
    pointerRef.current = null;
    try {
      store.getState().clearAtomHover();
      store.getState().clearBondHover();
    } catch {}
  };

  const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    noteClick(e.detail);
    if (clickTimerRef.current != null) {
      try {
        window.clearTimeout(clickTimerRef.current);
      } catch {}
      clickTimerRef.current = null;
    }
    // The end of a drag - a bond or a chain drawn, an atom moved, the view
    // panned - edits nothing, wherever it lets go: on the atom it has just
    // drawn, say.
    const press = pressRef.current;
    pressRef.current = null;
    if (endsDrag(press, e.clientX, e.clientY)) return;
    // A click with Ctrl (⌘) or Shift works the selection, and edits nothing
    if (addsToSelection(e) || e.shiftKey) return;
    // A click on nothing lets the selection go (not the end of a turn of it)
    const stClick = store.getState();
    const nowClick =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (
      e.target === domRef.current &&
      stClick.hovered.atomId == null &&
      stClick.hovered.bondId == null &&
      !(stClick.suppressDblClickUntil && nowClick < stClick.suppressDblClickUntil)
    )
      stClick.clearSel();
    // The second click of a double-click (as the system reckons one) edits
    // nothing, and neither does its first, if the edit is not yet begun.
    if (e.detail >= 2) return;
    const since = clickClock();
    clickTimerRef.current = window.setTimeout(() => {
      if (doubleClickedSince(since)) return;
      const st = store.getState();
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (st.extend.active || st.moveDrag.active) return;
      if (st.suppressDblClickUntil && now < st.suppressDblClickUntil) return;
      const p = clientToWorld(e.clientX, e.clientY);
      if (!p) return;
      const id = st.findAtomNear(p.x, p.y, NOMINAL_BOND_LENGTH * 0.25, null);
      if (id != null) st.beginLabelEdit(id);
    }, DOUBLE_CLICK_MS) as unknown as number;
  };

  // What is being dragged is read as it comes over the drawing: by the time
  // it is dropped, Word or PowerPoint may already have taken it back (on a
  // Mac, the drag pasteboard is emptied as the drag ends).
  const dropReading = useRef<Promise<Model | null> | null>(null);
  // The drawing as a drop zone (lib/drop): it takes files and whatever
  // else is dragged to it, and reads the latter as it comes
  const dropZone: DropZone = {
    takes: () => true,
    enter: (drag) => {
      // (a file from the Finder or Explorer is read when dropped, as ever)
      if (dropReading.current || drag.files) return;
      dropReading.current = structureInDrop().catch(() => null);
    },
    // off the drawing: the drag may end anywhere now
    leave: () => {
      dropReading.current = null;
    },
    drop: (d) => void dropAppend(d),
  };

  const dropAppend = async ({ x, y, files }: Dropped) => {
    const reading = dropReading.current;
    dropReading.current = null;
    const dropped = files[0];
    const at = clientToWorld(x, y) || { x: 0, y: 0 };
    // Not a structure's file: a picture or an object dragged out of Word or
    // PowerPoint, perhaps, whose structure goes where it was dropped,
    // selected - as a paste would
    if (!dropped || !STRUCTURE_FILE.test(dropped.name)) {
      // (read again if nothing was to be had as it came: a program may
      // hand over what it drags only once it is dropped)
      const found =
        (reading && (await reading.catch(() => null))) || (await structureInDrop().catch(() => null));
      if (found?.atoms.length) {
        store.getState().pasteModel(centredAt(found, at));
        setImportError(null);
        return;
      }
    }
    if (!dropped) return;
    const f = dropped;
    const text = await f.text();
    try {
      const result = await processFileContent(f.name, text);
      const dx = at.x - result.centroid.x;
      const dy = at.y - result.centroid.y;

      const shifted = {
        atoms: result.model.atoms.map((a) => ({
          ...a,
          x: a.x + dx,
          y: a.y + dy,
        })),
        bonds: result.model.bonds,
      };

      store
        .getState()
        .appendModel(toModel(shifted), importedScheme(result, dx, dy, at));
      setImportError(null);
    } catch (err) {
      reportImportError("append", err);
    }
  };

  const onPickFiles = async (files: FileList) => {
    if (!files || !files.length) return;
    const f = files[0];
    const text = await f.text();
    try {
      const result = await processFileContent(f.name, text);
      const shifted = {
        atoms: result.model.atoms.map((a) => ({
          ...a,
          x: a.x - result.centroid.x,
          y: a.y - result.centroid.y,
        })),
        bonds: result.model.bonds,
      };
      // Over what the canvas holds: an edit, so a wrong file can be undone.
      store
        .getState()
        .replaceModel(
          toModel(shifted),
          importedScheme(result, -result.centroid.x, -result.centroid.y),
        );
      setImportError(null);
    } catch (err) {
      reportImportError("replace", err);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();
  const dismissImportError = () => setImportError(null);

  const handleMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    pressRef.current = startPress(e.clientX, e.clientY);
    // A press takes back the edit a click before it was about to begin: it
    // is the second click of a double-click - a chain dragged out of the
    // atom, perhaps - or the start of something else.
    if (clickTimerRef.current != null) {
      try {
        window.clearTimeout(clickTimerRef.current);
      } catch {}
      clickTimerRef.current = null;
    }
    const st = store.getState();
    if (!st.labelEdit.active) return;
    const tgt = e.target as Element | null;
    const isInput =
      !!tgt && (tgt.tagName === "INPUT" || !!tgt.closest("input"));
    if (!isInput) {
      try {
        st.commitLabelEdit();
      } catch {}
      try {
        st.suppressDoubleClick(320);
      } catch {}
    }
  };

  /** Where a paste goes: the pointer, over the drawing; else the middle of the view. */
  const pasteTarget = () => {
    const p = pointerRef.current && clientToWorld(pointerRef.current.x, pointerRef.current.y);
    const cam = camRef.current;
    return p ?? { x: cam?.position.x ?? 0, y: cam?.position.y ?? 0 };
  };

  return {
    camRef,
    domRef,
    clientToWorld,
    pasteTarget,
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
  };
}
