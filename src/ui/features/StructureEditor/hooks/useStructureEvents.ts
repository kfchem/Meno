import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { useEditorStore } from "../store";
import { ATOM_HOVER_RING_RADIUS_RATIO } from "../constants";
import { calculateNewBondPosition } from "../utils/geometry";
import { processFileContent } from "../utils/io";

export function useStructureEvents(
  initialPayload?: string,
  initialFilename?: string,
) {
  const store = useEditorStore();

  // Refs
  const camRef = useRef<THREE.OrthographicCamera | null>(null);
  const domRef = useRef<HTMLCanvasElement | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
    v.unproject(camRef.current);
    return { x: v.x, y: v.y };
  };

  // An import is one undo step: the model goes into the document as a whole,
  // rather than being replayed atom by atom.
  const toModel = (mdl: { atoms: any[]; bonds: any[] }) => ({
    atoms: mdl.atoms.map((a) => ({
      id: a.id,
      x: a.x,
      y: a.y,
      r: a.r ?? 0.9,
      el: a.el ?? "C",
    })),
    bonds: mdl.bonds.map((b) => ({
      id: b.id,
      a: b.a,
      b: b.b,
      order: (b.order as 1 | 2 | 3) ?? 1,
      stereo: b.stereo ?? "none",
      stereoOrient: b.stereoOrient ?? "principle",
      ...(b.doubleMode ? { doubleMode: b.doubleMode } : {}),
    })),
  });

  const replayReplace = (mdl: { atoms: any[]; bonds: any[] }) => {
    store.getState().replaceModel(toModel(mdl));
  };

  const replayAppend = (mdl: { atoms: any[]; bonds: any[] }) => {
    store.getState().appendModel(toModel(mdl));
  };

  // Effect: Initial Payload
  const importedInitial = useRef(false);
  useEffect(() => {
    (async () => {
      if (!initialPayload || importedInitial.current) return;
      // One import per canvas: this effect runs twice under StrictMode, and
      // importing twice would leave two undo steps for a single file.
      importedInitial.current = true;
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
        replayReplace(shifted);
        if (result.arrow) {
          const cx = (result.arrow.x1 + result.arrow.x2) / 2;
          const cy = (result.arrow.y1 + result.arrow.y2) / 2;
          const len = Math.hypot(
            result.arrow.x2 - result.arrow.x1,
            result.arrow.y2 - result.arrow.y1,
          );
          try {
            store.getState().addArrow(cx, cy, 0, len);
          } catch {}
        }
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
    ndc.unproject(camRef.current);

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
        if (near != null) {
          st.connectAtoms(base.id, near, 1);
        } else {
          const nid = st.addAtom(nx, ny, "C", 0.9);
          st.addBond(base.id, nid, 1);
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
    const idA = st.addAtom(ax, ay, "C", 0.9);
    const idB = st.addAtom(bx, by, "C", 0.9);
    st.addBond(idA, idB, 1);
    try {
      store.getState().suppressDoubleClick(320);
    } catch {}
  };

  const handleWrapperMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const st = store.getState();
    const p = clientToWorld(e.clientX, e.clientY);
    if (!p) return;
    const tol = ATOM_HOVER_RING_RADIUS_RATIO * NOMINAL_BOND_LENGTH;
    const id = st.findAtomNear(p.x, p.y, tol, null);
    if (id != null) st.setHoveredFromId(id);
    else st.clearAtomHover();
  };

  const handleWrapperMouseLeave = () => {
    try {
      store.getState().clearAtomHover();
    } catch {}
  };

  const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (clickTimerRef.current != null) {
      try {
        window.clearTimeout(clickTimerRef.current);
      } catch {}
      clickTimerRef.current = null;
    }
    clickTimerRef.current = window.setTimeout(() => {
      const st = store.getState();
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (st.extend.active || st.moveDrag.active) return;
      if (st.suppressDblClickUntil && now < st.suppressDblClickUntil) return;
      const p = clientToWorld(e.clientX, e.clientY);
      if (!p) return;
      const id = st.findAtomNear(p.x, p.y, NOMINAL_BOND_LENGTH * 0.25, null);
      if (id != null) st.beginLabelEdit(id);
    }, 420) as unknown as number;
  };

  const onDropAppend = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || !files.length) return;
    const f = files[0];
    const text = await f.text();
    try {
      const result = await processFileContent(f.name, text);
      const p = clientToWorld(e.clientX, e.clientY) || { x: 0, y: 0 };
      const dx = p.x - result.centroid.x;
      const dy = p.y - result.centroid.y;

      const shifted = {
        atoms: result.model.atoms.map((a) => ({
          ...a,
          x: a.x + dx,
          y: a.y + dy,
        })),
        bonds: result.model.bonds,
      };

      replayAppend(shifted);
      setImportError(null);

      if (result.arrow) {
        const cx = (result.arrow.x1 + result.arrow.x2) / 2 + dx;
        const cy = (result.arrow.y1 + result.arrow.y2) / 2 + dy;
        const len = Math.hypot(
          result.arrow.x2 - result.arrow.x1,
          result.arrow.y2 - result.arrow.y1,
        );
        store.getState().addArrow(cx, cy, 0, len);
      }
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
      replayReplace(shifted);
      setImportError(null);
      if (result.arrow) {
        const cx = (result.arrow.x1 + result.arrow.x2) / 2;
        const cy = (result.arrow.y1 + result.arrow.y2) / 2;
        const len = Math.hypot(
          result.arrow.x2 - result.arrow.x1,
          result.arrow.y2 - result.arrow.y1,
        );
        store.getState().addArrow(cx, cy, 0, len);
      }
    } catch (err) {
      reportImportError("replace", err);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();
  const dismissImportError = () => setImportError(null);

  const handleMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
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
      if (clickTimerRef.current != null) {
        try {
          window.clearTimeout(clickTimerRef.current);
        } catch {}
        clickTimerRef.current = null;
      }
    }
  };

  return {
    camRef,
    domRef,
    fileInputRef,
    handleDoubleClick,
    handleWrapperMouseMove,
    handleWrapperMouseLeave,
    handleWrapperClick,
    onDropAppend,
    onPickFiles,
    openFilePicker,
    importError,
    dismissImportError,
    handleMouseDownCapture,
  };
}
