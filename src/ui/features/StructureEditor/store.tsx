import { create, type StoreApi, type UseBoundStore } from "zustand";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

export type Atom = { id: number; x: number; y: number; r: number; el: string };
export type Bond = {
  id: number;
  a: number;
  b: number;
  order: 1 | 2 | 3;
  stereo?: "up" | "down" | "wavy" | "none";
  doubleMode?: "auto" | "center" | "left" | "right";
  stereoOrient?: "principle" | "reverse";
};

export type Sel = { atoms: Set<number>; bonds: Set<number> };

export type Model = { atoms: Atom[]; bonds: Bond[] };
export type Arrow = {
  id: number;
  x: number;
  y: number;
  angle: number; // radians
  length: number; // world units
};

export type EditorState = {
  model: Model;
  sel: Sel;
  hovered: { atomId: number | null; bondId: number | null };
  hoverPulse: { id: number | null; nonce: number; until: number };
  arrows: Arrow[];
  fitNonce: number;
  autoFitSuspended: boolean;
  aromaticEnabled: boolean; // legacy/global
  aromaticRings: Record<string, boolean>; // per-ring enabled flags by ringKey
  labelEdit: {
    active: boolean;
    atomId: number | null;
    value: string;
    autoCap: boolean;
  };
  moveDrag: {
    active: boolean;
    atomId: number | null;
    pointer: { x: number; y: number } | null;
  };
  extend: {
    active: boolean;
    atomId: number | null;
    pointer: { x: number; y: number } | null;
    mode: "snap" | "free";
  };
  panHold: { active: boolean; pointerId: number | null };
  suppressDblClickUntil: number;
  nextId: number;
  nextArrowId: number;
  set: (fn: (s: EditorState) => void) => void;
  addAtom: (x: number, y: number, el?: string, r?: number) => number;
  addBond: (a: number, b: number, order?: Bond["order"]) => number;
  connectAtoms: (a: number, b: number, order?: Bond["order"]) => number | null;
  replaceDraggedAtomWith: (movingId: number, targetId: number) => void;
  moveAtom: (id: number, x: number, y: number) => void;
  updateBond: (id: number, patch: Partial<Bond>) => void;
  setBondOrder: (id: number, order: Bond["order"]) => void;
  setBondStereo: (id: number, stereo: NonNullable<Bond["stereo"]>) => void;
  setBondDoubleMode: (
    id: number,
    mode: NonNullable<Bond["doubleMode"]>
  ) => void;
  setBondStereoOrient: (
    id: number,
    orient: NonNullable<Bond["stereoOrient"]>
  ) => void;
  toggleAtomSel: (id: number, multi?: boolean) => void;
  clearSel: () => void;
  setHoveredFromId: (id: number) => void;
  clearHovered: () => void;
  clearAtomHover: () => void;
  clearBondHover: () => void;
  startExtend: (atomId: number) => void;
  updateExtend: (x: number, y: number) => void;
  commitExtend: () => void;
  cancelExtend: () => void;
  suppressDoubleClick: (ms?: number) => void;
  triggerHoverPulse: (bondId: number) => void;
  beginPanHold: (pointerId: number | null) => void;
  endPanHold: (pointerId?: number | null) => void;
  setExtendMode: (mode: "snap" | "free") => void;
  beginMoveDrag: (
    atomId: number,
    pointer?: { x: number; y: number } | null
  ) => void;
  updateMovePointer: (x: number, y: number) => void;
  endMoveDrag: () => void;
  replaceModel: (next: Model) => void;
  appendModel: (next: Model) => void;
  addArrow: (x: number, y: number, angle?: number, length?: number) => number;
  updateArrow: (id: number, patch: Partial<Arrow>) => void;
  removeArrow: (id: number) => void;
  requestFit: () => void;
  beginAutoFitSuspend: () => void;
  endAutoFitSuspend: () => void;
  findAtomNear: (
    x: number,
    y: number,
    tol?: number,
    excludeId?: number | null
  ) => number | null;
  beginLabelEdit: (
    atomId: number,
    initial?: string,
    forceLower?: boolean
  ) => void;
  setLabelEditValue: (value: string) => void;
  commitLabelEdit: () => void;
  cancelLabelEdit: () => void;
  setAromaticEnabled: (v: boolean) => void;
  toggleAromatic: () => void;
  setRingEnabled: (key: string, v: boolean) => void;
  toggleRing: (key: string) => void;
};

export type EditorStore = UseBoundStore<StoreApi<EditorState>>;

function createEditorStore(): EditorStore {
  return create<EditorState>((set, get) => ({
    model: { atoms: [], bonds: [] },
    sel: { atoms: new Set<number>(), bonds: new Set<number>() },
    hovered: { atomId: null, bondId: null },
    hoverPulse: { id: null, nonce: 0, until: 0 },
    fitNonce: 0,
    autoFitSuspended: false,
    arrows: [],
    aromaticEnabled: false,
    aromaticRings: {},
    labelEdit: { active: false, atomId: null, value: "", autoCap: true },
    moveDrag: { active: false, atomId: null, pointer: null },
    extend: { active: false, atomId: null, pointer: null, mode: "snap" },
    panHold: { active: false, pointerId: null },
    suppressDblClickUntil: 0,
    nextId: 1,
    nextArrowId: 1,
    set: (fn) =>
      set((s: EditorState) => {
        const next = { ...s };
        fn(next);
        return next;
      }),
    addAtom: (x, y, el = "C", r = 0.9) => {
      const id = get().nextId;
      set((prev: EditorState) => ({
        ...prev,
        nextId: id + 1,
        model: {
          atoms: [...prev.model.atoms, { id, x, y, r, el }],
          bonds: prev.model.bonds,
        },
      }));
      return id;
    },
    addBond: (a, b, order = 1) => {
      const id = get().nextId;
      set((prev: EditorState) => ({
        ...prev,
        nextId: id + 1,
        model: {
          atoms: prev.model.atoms,
          bonds: [
            ...prev.model.bonds,
            { id, a, b, order, stereo: "none", stereoOrient: "principle" },
          ],
        },
      }));
      return id;
    },
    connectAtoms: (a, b, order = 1) => {
      const st = get();
      if (a === b) return null;
      // avoid duplicate bonds
      const has = st.model.bonds.some(
        (bb) => (bb.a === a && bb.b === b) || (bb.a === b && bb.b === a)
      );
      if (has) return null;
      return get().addBond(a, b, order);
    },
    replaceDraggedAtomWith: (movingId, targetId) =>
      set((prev: EditorState) => {
        if (movingId === targetId) return prev;
        // Rewire bonds connected to movingId to targetId, avoid duplicates & self-loops
        const bonds: Bond[] = [];
        for (const b of prev.model.bonds) {
          if (b.a === movingId && b.b === targetId) continue; // dup
          if (b.b === movingId && b.a === targetId) continue; // dup
          if (b.a === movingId && b.b !== targetId) {
            const exists = prev.model.bonds.some(
              (bb) =>
                (bb.a === targetId && bb.b === b.b) ||
                (bb.b === targetId && bb.a === b.b)
            );
            if (!exists && targetId !== b.b) bonds.push({ ...b, a: targetId });
            continue;
          }
          if (b.b === movingId && b.a !== targetId) {
            const exists = prev.model.bonds.some(
              (bb) =>
                (bb.a === targetId && bb.b === b.a) ||
                (bb.b === targetId && bb.a === b.a)
            );
            if (!exists && targetId !== b.a) bonds.push({ ...b, b: targetId });
            continue;
          }
          bonds.push(b);
        }
        // Remove moving atom
        const atoms = prev.model.atoms.filter((a) => a.id !== movingId);
        return { ...prev, model: { atoms, bonds } };
      }),
    findAtomNear: (x, y, tol = NOMINAL_BOND_LENGTH * 0.3, excludeId = null) => {
      const st = get();
      let best: { id: number; d: number } | null = null;
      for (const a of st.model.atoms) {
        if (excludeId != null && a.id === excludeId) continue;
        const d = Math.hypot(x - a.x, y - a.y);
        if (d <= tol && (!best || d < best.d)) best = { id: a.id, d };
      }
      return best ? best.id : null;
    },
    moveAtom: (id, x, y) =>
      set((prev: EditorState) => ({
        ...prev,
        model: {
          atoms: prev.model.atoms.map((a) =>
            a.id === id ? { ...a, x, y } : a
          ),
          bonds: prev.model.bonds,
        },
      })),
    updateBond: (id, patch) =>
      set((prev: EditorState) => ({
        ...prev,
        model: {
          atoms: prev.model.atoms,
          bonds: prev.model.bonds.map((b) =>
            b.id === id ? { ...b, ...patch } : b
          ),
        },
      })),
    setBondOrder: (id, order) =>
      set((prev: EditorState) => ({
        ...prev,
        model: {
          atoms: prev.model.atoms,
          bonds: prev.model.bonds.map((b) =>
            b.id === id ? { ...b, order } : b
          ),
        },
      })),
    setBondDoubleMode: (id, mode) =>
      set((prev: EditorState) => ({
        ...prev,
        model: {
          atoms: prev.model.atoms,
          bonds: prev.model.bonds.map((b) =>
            b.id === id ? { ...b, doubleMode: mode } : b
          ),
        },
      })),
    setBondStereo: (id, stereo) =>
      set((prev: EditorState) => ({
        ...prev,
        model: {
          atoms: prev.model.atoms,
          bonds: prev.model.bonds.map((b) =>
            b.id === id ? { ...b, stereo } : b
          ),
        },
      })),
    setBondStereoOrient: (id, orient) =>
      set((prev: EditorState) => ({
        ...prev,
        model: {
          atoms: prev.model.atoms,
          bonds: prev.model.bonds.map((b) =>
            b.id === id ? { ...b, stereoOrient: orient } : b
          ),
        },
      })),
    toggleAtomSel: (id, multi) =>
      set((prev: EditorState) => {
        if (!multi)
          return { ...prev, sel: { atoms: new Set([id]), bonds: new Set() } };
        const atoms = new Set(prev.sel.atoms);
        atoms.has(id) ? atoms.delete(id) : atoms.add(id);
        return { ...prev, sel: { atoms, bonds: new Set(prev.sel.bonds) } };
      }),
    clearSel: () =>
      set((prev: EditorState) => ({
        ...prev,
        sel: { atoms: new Set(), bonds: new Set() },
      })),
    setHoveredFromId: (id: number) =>
      set((prev: EditorState) => {
        if (!id) return { ...prev, hovered: { atomId: null, bondId: null } };
        // Suppress hover on the moving atom and bonds directly connected to it
        const movingId = prev.moveDrag.active ? prev.moveDrag.atomId : null;
        if (movingId != null) {
          const isMovingAtom = prev.model.atoms.some(
            (a) => a.id === id && a.id === movingId
          );
          if (isMovingAtom) return prev;
          const isMovingBond = prev.model.bonds.some(
            (b) => b.id === id && (b.a === movingId || b.b === movingId)
          );
          if (isMovingBond) return prev;
        }
        const isAtom = prev.model.atoms.some((a) => a.id === id);
        const isBond = !isAtom && prev.model.bonds.some((b) => b.id === id);
        return {
          ...prev,
          hovered: {
            atomId: isAtom ? id : null,
            bondId: isBond ? id : null,
          },
        };
      }),
    clearHovered: () =>
      set((prev: EditorState) => ({
        ...prev,
        hovered: { atomId: null, bondId: null },
      })),
    clearAtomHover: () =>
      set((prev: EditorState) => ({
        ...prev,
        hovered: { atomId: null, bondId: prev.hovered.bondId },
      })),
    clearBondHover: () =>
      set((prev: EditorState) => ({
        ...prev,
        hovered: { atomId: prev.hovered.atomId, bondId: null },
      })),
    startExtend: (atomId) =>
      set((prev: EditorState) => ({
        ...prev,
        extend: { active: true, atomId, pointer: null, mode: "snap" },
        suppressDblClickUntil: Math.max(
          prev.suppressDblClickUntil,
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) + 120
        ),
      })),
    updateExtend: (x, y) =>
      set((prev: EditorState) => ({
        ...prev,
        extend: prev.extend.active
          ? { ...prev.extend, pointer: { x, y } }
          : prev.extend,
      })),
    commitExtend: () => {
      const st = get();
      if (!st.extend.active || st.extend.atomId == null) return;
      const base = st.model.atoms.find((a) => a.id === st.extend.atomId);
      if (!base) {
        set((prev: EditorState) => ({
          ...prev,
          extend: { active: false, atomId: null, pointer: null, mode: "snap" },
          suppressDblClickUntil:
            (typeof performance !== "undefined"
              ? performance.now()
              : Date.now()) + 120,
        }));
        return;
      }
      // Fixed nominal bond length and tolerance
      const L = NOMINAL_BOND_LENGTH;
      const TOL = L * 0.4;
      const step = Math.PI / 6; // 30°
      const px = st.extend.pointer?.x ?? base.x + L;
      const py = st.extend.pointer?.y ?? base.y;
      // 1) Prefer connecting to a nearby existing atom if within tolerance
      if (st.extend.pointer) {
        const nearPtr = get().findAtomNear(px, py, TOL, base.id);
        if (nearPtr != null) {
          get().connectAtoms(base.id, nearPtr, 1);
          set((prev: EditorState) => ({
            ...prev,
            extend: {
              active: false,
              atomId: null,
              pointer: null,
              mode: "snap",
            },
            suppressDblClickUntil:
              (typeof performance !== "undefined"
                ? performance.now()
                : Date.now()) + 120,
          }));
          return;
        }
      }
      // 2) Compute final position for snap/free modes
      let nx: number, ny: number;
      if (st.extend.mode === "free" && st.extend.pointer) {
        // Place exactly at pointer position (no snap, variable length)
        nx = st.extend.pointer.x;
        ny = st.extend.pointer.y;
      } else {
        const ang = Math.atan2(py - base.y, px - base.x);
        const snap = Math.round(ang / step) * step;
        nx = base.x + L * Math.cos(snap);
        ny = base.y + L * Math.sin(snap);
      }
      // 3) Check for nearby atoms again at final position
      const nearId = get().findAtomNear(nx, ny, TOL, base.id);
      if (nearId != null) {
        get().connectAtoms(base.id, nearId, 1);
      } else {
        const nid = get().addAtom(nx, ny, "C", 0.9);
        get().addBond(base.id, nid, 1);
      }
      set((prev: EditorState) => ({
        ...prev,
        extend: { active: false, atomId: null, pointer: null, mode: "snap" },
        suppressDblClickUntil:
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) + 120,
      }));
    },
    cancelExtend: () =>
      set((prev: EditorState) => ({
        ...prev,
        extend: { active: false, atomId: null, pointer: null, mode: "snap" },
        suppressDblClickUntil:
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) + 120,
      })),
    suppressDoubleClick: (ms = 120) =>
      set((prev: EditorState) => ({
        ...prev,
        suppressDblClickUntil: Math.max(
          prev.suppressDblClickUntil,
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) + ms
        ),
      })),
    triggerHoverPulse: (bondId: number) =>
      set((prev: EditorState) => ({
        ...prev,
        hoverPulse: {
          id: bondId,
          nonce: prev.hoverPulse.nonce + 1,
          until:
            (typeof performance !== "undefined"
              ? performance.now()
              : Date.now()) + 140,
        },
      })),
    beginPanHold: (pointerId) =>
      set((prev: EditorState) => ({
        ...prev,
        panHold: { active: true, pointerId: pointerId ?? null },
      })),
    endPanHold: (pointerId) =>
      set((prev: EditorState) => {
        if (!prev.panHold.active) return prev;
        if (
          pointerId == null ||
          prev.panHold.pointerId == null ||
          prev.panHold.pointerId === pointerId
        ) {
          return { ...prev, panHold: { active: false, pointerId: null } };
        }
        return prev;
      }),
    setExtendMode: (mode) =>
      set((prev: EditorState) => ({
        ...prev,
        extend: prev.extend.active ? { ...prev.extend, mode } : prev.extend,
      })),
    beginMoveDrag: (atomId, pointer = null) =>
      set((prev: EditorState) => {
        // Clear hover if it currently targets the moving atom or its bonds
        let hovered = prev.hovered;
        if (hovered.atomId === atomId)
          hovered = { atomId: null, bondId: hovered.bondId };
        const bondsOfAtom = new Set(
          prev.model.bonds
            .filter((b) => b.a === atomId || b.b === atomId)
            .map((b) => b.id)
        );
        if (hovered.bondId != null && bondsOfAtom.has(hovered.bondId)) {
          hovered = { atomId: hovered.atomId, bondId: null };
        }
        return {
          ...prev,
          moveDrag: { active: true, atomId, pointer },
          hovered,
        };
      }),
    updateMovePointer: (x, y) =>
      set((prev: EditorState) => ({
        ...prev,
        moveDrag: prev.moveDrag.active
          ? { ...prev.moveDrag, pointer: { x, y } }
          : prev.moveDrag,
      })),
    endMoveDrag: () =>
      set((prev: EditorState) => ({
        ...prev,
        moveDrag: { active: false, atomId: null, pointer: null },
      })),
    // Replace entire model
    replaceModel: (next) =>
      set((prev: EditorState) => {
        const maxId = Math.max(
          0,
          ...next.atoms.map((a) => a.id || 0),
          ...next.bonds.map((b) => b.id || 0)
        );
        return {
          ...prev,
          model: { atoms: next.atoms.slice(), bonds: next.bonds.slice() },
          arrows: [],
          nextArrowId: 1,
          sel: { atoms: new Set(), bonds: new Set() },
          hovered: { atomId: null, bondId: null },
          labelEdit: { active: false, atomId: null, value: "", autoCap: true },
          moveDrag: { active: false, atomId: null, pointer: null },
          extend: { active: false, atomId: null, pointer: null, mode: "snap" },
          aromaticEnabled: false,
          aromaticRings: {},
          nextId: Math.max(1, maxId + 1),
          // Always trigger fit
          fitNonce: prev.fitNonce + 1,
        };
      }),
    // Append model (id remap)
    appendModel: (next) =>
      set((prev: EditorState) => {
        const idMap = new Map<number, number>();
        let cur = prev.nextId;
        const newAtoms = next.atoms.map((a) => {
          const nid = cur++;
          idMap.set(a.id, nid);
          return { id: nid, x: a.x, y: a.y, r: a.r, el: a.el } as Atom;
        });
        const newBonds = next.bonds.map((b) => {
          const a = idMap.get(b.a) ?? b.a;
          const c = idMap.get(b.b) ?? b.b;
          const nid = cur++;
          return {
            id: nid,
            a,
            b: c,
            order: b.order as 1 | 2 | 3,
            stereo: (b as any).stereo ?? "none",
          } as Bond;
        });
        return {
          ...prev,
          nextId: cur,
          model: {
            atoms: [...prev.model.atoms, ...newAtoms],
            bonds: [...prev.model.bonds, ...newBonds],
          },
          hovered: { atomId: null, bondId: null },
          // Trigger fit after append as well
          fitNonce: prev.fitNonce + 1,
        };
      }),
    requestFit: () =>
      set((prev: EditorState) => ({ ...prev, fitNonce: prev.fitNonce + 1 })),
    beginAutoFitSuspend: () =>
      set((prev: EditorState) => ({ ...prev, autoFitSuspended: true })),
    endAutoFitSuspend: () =>
      set((prev: EditorState) => ({ ...prev, autoFitSuspended: false })),
    // Arrows
    addArrow: (x, y, angle = 0, length = NOMINAL_BOND_LENGTH * 4) => {
      let newId = 0;
      set((prev: EditorState) => {
        const id = prev.nextArrowId;
        newId = id;
        const arrow: Arrow = { id, x, y, angle, length };
        return {
          ...prev,
          nextArrowId: id + 1,
          arrows: [...prev.arrows, arrow],
        };
      });
      return newId;
    },
    updateArrow: (id, patch) =>
      set((prev: EditorState) => ({
        ...prev,
        arrows: prev.arrows.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      })),
    removeArrow: (id) =>
      set((prev: EditorState) => ({
        ...prev,
        arrows: prev.arrows.filter((a) => a.id !== id),
      })),
    // Label editing
    beginLabelEdit: (atomId, initial = "", forceLower = false) =>
      set((prev: EditorState) => {
        const base = prev.model.atoms.find((a) => a.id === atomId);
        const start = initial.length
          ? initial
          : base?.el === "C"
          ? ""
          : base?.el ?? "";
        const autoCap = !forceLower;
        const val = start.length
          ? autoCap
            ? start[0].toUpperCase() + start.slice(1)
            : start
          : "";
        return {
          ...prev,
          labelEdit: {
            active: true,
            atomId,
            value: val,
            autoCap,
          },
        };
      }),
    setLabelEditValue: (value) =>
      set((prev: EditorState) => {
        const autoCap = prev.labelEdit.autoCap && value.length > 0;
        return {
          ...prev,
          labelEdit: { ...prev.labelEdit, value, autoCap },
        };
      }),
    commitLabelEdit: () =>
      set((prev: EditorState) => {
        if (!prev.labelEdit.active || prev.labelEdit.atomId == null)
          return prev;
        const id = prev.labelEdit.atomId;
        const value = prev.labelEdit.value.trim();
        const atoms = prev.model.atoms.map((a) =>
          a.id === id ? { ...a, el: value || a.el } : a
        );
        return {
          ...prev,
          model: { atoms, bonds: prev.model.bonds },
          labelEdit: { active: false, atomId: null, value: "", autoCap: true },
        };
      }),
    cancelLabelEdit: () =>
      set((prev: EditorState) => ({
        ...prev,
        labelEdit: { active: false, atomId: null, value: "", autoCap: true },
      })),
    setAromaticEnabled: (v: boolean) =>
      set((prev: EditorState) => ({ ...prev, aromaticEnabled: v })),
    toggleAromatic: () =>
      set((prev: EditorState) => ({
        ...prev,
        aromaticEnabled: !prev.aromaticEnabled,
      })),
    setRingEnabled: (key: string, v: boolean) =>
      set((prev: EditorState) => ({
        ...prev,
        aromaticRings: { ...prev.aromaticRings, [key]: v },
      })),
    toggleRing: (key: string) =>
      set((prev: EditorState) => ({
        ...prev,
        aromaticRings: {
          ...prev.aromaticRings,
          [key]: !prev.aromaticRings[key],
        },
      })),
  }));
}

const storeRegistry = new Map<string, EditorStore>();

function getOrCreate(tabId: string): EditorStore {
  let s = storeRegistry.get(tabId);
  if (!s) {
    s = createEditorStore();
    storeRegistry.set(tabId, s);
  }
  return s;
}

const EditorStoreContext = createContext<EditorStore | null>(null);

export function EditorProvider({
  tabId,
  children,
}: {
  tabId: string;
  children: ReactNode;
}) {
  const store = useMemo(() => getOrCreate(tabId), [tabId]);
  useEffect(
    () => () => {
      // Clean up store when provider unmounts (tab closed)
      storeRegistry.delete(tabId);
    },
    [tabId]
  );
  return (
    <EditorStoreContext.Provider value={store}>
      {children}
    </EditorStoreContext.Provider>
  );
}

export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store)
    throw new Error("useEditorStore must be used within EditorProvider");
  return store;
}

export function useEditor<T = EditorState>(
  selector?: (s: EditorState) => T
): T {
  const store = useEditorStore();
  // NOTE: this is a bound store hook; call it directly
  // When no selector is provided, return the entire state
  return (store as unknown as (sel?: (s: EditorState) => T) => T)(
    selector ?? ((s: EditorState) => s as unknown as T)
  );
}
