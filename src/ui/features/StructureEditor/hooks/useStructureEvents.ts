import * as THREE from "three";
import { useEffect, useRef } from "react";
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

  // Helper: Rebuild model via addAtom/addBond (Replace)
  const replayReplace = (mdl: { atoms: any[]; bonds: any[] }) => {
    const st = store.getState();
    try {
      st.beginAutoFitSuspend();
    } catch {}
    st.replaceModel({ atoms: [], bonds: [] });
    const idMap = new Map<number, number>();
    for (const a of mdl.atoms) {
      const nid = st.addAtom(a.x, a.y, a.el ?? "C", a.r ?? 0.9);
      idMap.set(a.id, nid);
    }
    for (const b of mdl.bonds) {
      const a1 = idMap.get(b.a);
      const a2 = idMap.get(b.b);
      if (a1 == null || a2 == null) continue;
      const nbid = st.addBond(a1, a2, (b.order as any) ?? 1);
      try {
        if (b.stereo && b.stereo !== "none") st.setBondStereo(nbid, b.stereo);
      } catch {}
      try {
        const orient = (b as any).stereoOrient;
        if (orient) st.setBondStereoOrient(nbid, orient);
      } catch {}
      try {
        const dm = (b as any).doubleMode;
        if (dm) st.setBondDoubleMode(nbid, dm);
      } catch {}
    }
    try {
      st.requestFit();
    } catch {}
    try {
      st.endAutoFitSuspend();
    } catch {}
  };

  // Helper: Rebuild model (Append)
  const replayAppend = (mdl: { atoms: any[]; bonds: any[] }) => {
    const st = store.getState();
    try {
      st.beginAutoFitSuspend();
    } catch {}
    const idMap = new Map<number, number>();
    for (const a of mdl.atoms) {
      const nid = st.addAtom(a.x, a.y, a.el ?? "C", a.r ?? 0.9);
      idMap.set(a.id, nid);
    }
    for (const b of mdl.bonds) {
      const a1 = idMap.get(b.a);
      const a2 = idMap.get(b.b);
      if (a1 == null || a2 == null) continue;
      const nbid = st.addBond(a1, a2, (b.order as any) ?? 1);
      try {
        if (b.stereo && b.stereo !== "none") st.setBondStereo(nbid, b.stereo);
      } catch {}
      try {
        const orient = (b as any).stereoOrient;
        if (orient) st.setBondStereoOrient(nbid, orient);
      } catch {}
      try {
        const dm = (b as any).doubleMode;
        if (dm) st.setBondDoubleMode(nbid, dm);
      } catch {}
    }
    try {
      st.requestFit();
    } catch {}
    try {
      st.endAutoFitSuspend();
    } catch {}
  };

  // Effect: Initial Payload
  useEffect(() => {
    (async () => {
      if (!initialPayload) return;
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
        console.warn("initial payload import failed", e);
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
      console.warn("append import failed", err);
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
      console.warn("replace import failed", err);
    }
  };

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
    handleMouseDownCapture,
  };
}
