import * as THREE from "three";
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import PageHtml from "./PageHtml";
import { useEditor, useEditorStore } from "../store";
import type { EditorState, WireEnd, WorkflowBox, WorkflowStep } from "../store/types";
import { pageAt } from "../utils/page";
import { COLORS } from "../../../theme/colors";
import { MOV_PX } from "../constants";
import { useStyle3D } from "../style3d";
import BoxFrame, { type Edge } from "../workflow/BoxFrame";
import StepCard, { FRAME_GREY, Port, type PortLook } from "../workflow/StepCard";
import { boxMembers, countOf, type Frame } from "../workflow/entries";
import { selectionFrame } from "../workflow/boxing";
import { canWire, stateOf } from "../workflow/flow";
import { howOf, kindInfo, madeName, optionsOf } from "../workflow/kinds";
import { boxList } from "../workflow/list";
import { CARD_W, HTML_DISTANCE, PORT_DOWN, PX } from "../workflow/look";
import { byOf, doerOf, doersOf } from "../workflow/doers";

type Pt = { x: number; y: number };

/** The least a box is sized to, each way. */
const LEAST = 48 * PX;
/** The smallest of a card's words, in px at 100 %: below 9 px on the screen it shows its icon and its state's mark alone. */
const SMALLEST = 11.5;
const ATTENTION = "rgb(205, 69, 96)";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Where a box gives; where a result box takes. */
const boxGives = (b: Frame): Pt => ({ x: b.x1, y: (b.y0 + b.y1) / 2 });
const boxTakes = (b: Frame): Pt => ({ x: b.x0, y: (b.y0 + b.y1) / 2 });
/** Where a step takes, and gives. */
const stepTakes = (s: Pick<WorkflowStep, "x" | "y">): Pt => ({ x: s.x, y: s.y - PORT_DOWN });
const stepGives = (s: Pick<WorkflowStep, "x" | "y">): Pt => ({ x: s.x + CARD_W, y: s.y - PORT_DOWN });

/** A wire's curve from `p` to `q`, leaving and arriving level, as a ribbon `width` wide. */
function ribbon(p: Pt, q: Pt, width: number): THREE.BufferGeometry {
  const d = Math.max(Math.abs(q.x - p.x) / 2, 40 * PX);
  const c1 = { x: p.x + d, y: p.y };
  const c2 = { x: q.x - d, y: q.y };
  const N = 48;
  const at = (t: number): Pt => {
    const u = 1 - t;
    return {
      x: u * u * u * p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * q.x,
      y: u * u * u * p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * q.y,
    };
  };
  const pts = Array.from({ length: N + 1 }, (_, i) => at(i / N));
  const positions: number[] = [];
  const index: number[] = [];
  pts.forEach((pt, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(N, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (-(b.y - a.y) / len) * (width / 2);
    const ny = ((b.x - a.x) / len) * (width / 2);
    positions.push(pt.x + nx, pt.y + ny, 0, pt.x - nx, pt.y - ny, 0);
    if (i < N) index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  return g;
}

/** A wire drawn from `p` to `q`; where it can be pointed at, a wider band round it that the pointer takes. */
function WireLine({ p, q, color, onHover }: { p: Pt; q: Pt; color: string; onHover?: (on: boolean) => void }) {
  const line = useMemo(() => ribbon(p, q, 1.6 * PX), [p.x, p.y, q.x, q.y]); // eslint-disable-line react-hooks/exhaustive-deps
  const hit = useMemo(() => (onHover ? ribbon(p, q, 10 * PX) : null), [p.x, p.y, q.x, q.y, !!onHover]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => line.dispose(), [line]);
  useEffect(() => () => hit?.dispose(), [hit]);
  return (
    <group position={[0, 0, 0.012]}>
      <mesh geometry={line} renderOrder={4}>
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {hit && (
        <mesh
          geometry={hit}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover!(true);
          }}
          onPointerOut={() => onHover!(false)}
        >
          <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Where on the page's layer of HTML a point of the page is: the layer's
 * origin is the page's, its pixels `PX` world units, downwards.
 */
const onLayer = (x: number, y: number): React.CSSProperties => ({ position: "absolute", left: x / PX, top: -y / PX });

/**
 * A workflow on the page (docs/WORKFLOWS.md): its boxes, its steps and the
 * wires between them, drawn at the page's scale - and the port on the
 * selection's right edge that makes it an input, while it holds whole
 * structures or molecules in 3D. Boxes and steps are HTML laid on the
 * page, wires the canvas's own; what is dragged, drawn or pointed at is
 * worked here, and what changes the page is an edit to the document.
 */
export default function Workflow2D() {
  const store = useEditorStore();
  const boxes = useEditor((s) => s.boxes);
  const steps = useEditor((s) => s.steps);
  const wires = useEditor((s) => s.wires);
  const model = useEditor((s) => s.model);
  const molecules3d = useEditor((s) => s.molecules3d);
  const hoveredBox = useEditor((s) => s.hoveredBox);
  const chosenBox = useEditor((s) => s.chosenBox);
  const hoveredWire = useEditor((s) => s.hoveredWire);
  const openStep = useEditor((s) => s.openStep);
  const wireDrag = useEditor((s) => s.wireDrag);
  const sel = useEditor((s) => s.sel);
  const sel3d = useEditor((s) => s.sel3d);
  const turns3d = useEditor((s) => s.turns3d);
  const frames3d = useEditor((s) => s.frames3d);
  const style3d = useStyle3D();
  const { camera, gl, invalidate } = useThree();

  // the zoom, where it crosses what a card's words need to be read
  const [compact, setCompact] = useState(false);
  useFrame(() => {
    const small = SMALLEST * PX * (camera as THREE.OrthographicCamera).zoom < 9;
    if (small !== compact) setCompact(small);
  });

  const worldOf = (cx: number, cy: number): Pt => {
    const r = gl.domElement.getBoundingClientRect();
    const p = pageAt(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), camera);
    return { x: p.x, y: p.y };
  };

  /** A press followed: each move past MOV_PX, at its place on the page, and the button coming up - whether it moved. */
  const follow = (e: ReactPointerEvent, move: (p: Pt, ev: PointerEvent) => void, up: (moved: boolean, ev: PointerEvent) => void) => {
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOV_PX) return;
      moved = true;
      move(worldOf(ev.clientX, ev.clientY), ev);
      invalidate();
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("keydown", onKey, true);
      up(moved, ev);
      invalidate();
    };
    // (Escape lets a wire being drawn go)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !store.getState().wireDrag) return;
      ev.preventDefault();
      ev.stopPropagation();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("keydown", onKey, true);
      store.getState().setWorkflowView({ wireDrag: null });
      invalidate();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("keydown", onKey, true);
  };

  /** What lies under the pointer where a wire is let go: a port that takes or gives, empty space, or something else. */
  const dropTarget = (ev: PointerEvent): { take: number } | { give: WireEnd } | "empty" | null => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    const take = el?.closest("[data-take]")?.getAttribute("data-take");
    if (take) return { take: Number(take) };
    const giveBox = el?.closest("[data-give-box]")?.getAttribute("data-give-box");
    if (giveBox) return { give: { box: Number(giveBox) } };
    const giveStep = el?.closest("[data-give-step]")?.getAttribute("data-give-step");
    if (giveStep) return { give: { step: Number(giveStep) } };
    if (el !== gl.domElement) return null;
    const s = store.getState();
    const onSomething =
      s.hovered.atomId != null || s.hovered.bondId != null || s.hovered3d || s.hoveredArrow != null || s.hoveredPlus != null || s.hoveredCaption != null || s.hoveredWire != null;
    return onSomething ? null : "empty";
  };

  /** A wire drawn out of what gives: into a step's port, or - let go on empty space - Quick Add there, at the steps that take it. */
  const drawFrom = (e: ReactPointerEvent, from: WireEnd) => {
    if (e.button !== 0) return;
    store.getState().setWorkflowView({ wireDrag: { from, at: worldOf(e.clientX, e.clientY) } });
    follow(
      e,
      (at) => store.getState().setWorkflowView({ wireDrag: { from, at } }),
      (moved, ev) => {
        const st = store.getState();
        st.setWorkflowView({ wireDrag: null });
        if (!moved) return;
        const there = dropTarget(ev);
        if (there && there !== "empty" && "take" in there) st.connect(from, there.take);
        else if (there === "empty") {
          const r = (gl.domElement.parentElement ?? gl.domElement).getBoundingClientRect();
          st.setQuickAdd({ at: worldOf(ev.clientX, ev.clientY), x: ev.clientX - r.left, y: ev.clientY - r.top, within: { width: r.width, height: r.height }, wire: from });
        }
      },
    );
  };

  /** A press on a step's port that takes: the wire into it picked up - into another, or let go on nothing, deleted - or, with none, one drawn back from it to what gives. */
  const drawInto = (e: ReactPointerEvent, step: number) => {
    if (e.button !== 0) return;
    const st = store.getState();
    const was = st.wires.find((w) => w.to === step);
    const at = worldOf(e.clientX, e.clientY);
    const drag = (p: Pt) => (was ? { from: was.from, at: p, was: was.id } : { to: step, at: p });
    st.setWorkflowView({ wireDrag: drag(at) });
    follow(
      e,
      (p) => store.getState().setWorkflowView({ wireDrag: drag(p) }),
      (moved, ev) => {
        const s = store.getState();
        s.setWorkflowView({ wireDrag: null });
        if (!moved) return;
        const there = dropTarget(ev);
        if (was) {
          if (there && there !== "empty" && "take" in there) s.rewire(was.id, there.take);
          else s.removeWire(was.id);
        } else if (there && there !== "empty" && "give" in there) s.connect(there.give, step);
      },
    );
  };

  /** A box dragged by its tab, with all it holds; clicked, chosen. */
  const dragBox = (e: ReactPointerEvent, box: WorkflowBox) => {
    if (e.button !== 0) return;
    let last = worldOf(e.clientX, e.clientY);
    const gesture = `${performance.now()}`;
    follow(
      e,
      (p) => {
        store.getState().moveBox(box.id, p.x - last.x, p.y - last.y, gesture);
        last = p;
      },
      (moved) => {
        if (!moved) store.getState().setWorkflowView({ chosenBox: box.id });
      },
    );
  };

  /** A box sized by an edge or a corner: what it holds is what then lies inside it. */
  const sizeBox = (edge: Edge, e: ReactPointerEvent, box: WorkflowBox) => {
    if (e.button !== 0) return;
    const start = worldOf(e.clientX, e.clientY);
    const was = { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 };
    const gesture = `${performance.now()}`;
    follow(
      e,
      (p) => {
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        const f = { ...was };
        if (edge.includes("e")) f.x1 = Math.max(was.x1 + dx, was.x0 + LEAST);
        if (edge.includes("w")) f.x0 = Math.min(was.x0 + dx, was.x1 - LEAST);
        if (edge.includes("n")) f.y1 = Math.max(was.y1 + dy, was.y0 + LEAST);
        if (edge.includes("s")) f.y0 = Math.min(was.y0 + dy, was.y1 - LEAST);
        store.getState().setBoxFrame(box.id, f, gesture);
      },
      () => {},
    );
  };

  /** A step dragged by its card; clicked, opened to its options, or shut. */
  const dragStep = (e: ReactPointerEvent, step: WorkflowStep) => {
    if (e.button !== 0) return;
    const start = worldOf(e.clientX, e.clientY);
    const gesture = `${performance.now()}`;
    follow(
      e,
      (p) => store.getState().moveStep(step.id, step.x + p.x - start.x, step.y + p.y - start.y, gesture),
      (moved) => {
        if (moved) return;
        const s = store.getState();
        s.setWorkflowView({ openStep: s.openStep === step.id ? null : step.id });
      },
    );
  };

  /** A right-click on a box's tab or a step's card: its menu. */
  const menuOf = (kind: "box" | "step", id: number) => (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    store.getState().setWorkflowView({ workflowMenu: { kind, id, clientX: e.clientX, clientY: e.clientY } });
  };

  // a step open to its options: shut by Escape, or a press anywhere else
  useEffect(() => {
    if (openStep == null) return;
    const shut = () => store.getState().setWorkflowView({ openStep: null });
    const onPress = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(`[data-step-card="${openStep}"]`)) shut();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      shut();
    };
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [openStep, store]);

  // a box chosen: let go by a press anywhere but its tab, or Escape
  useEffect(() => {
    if (chosenBox == null) return;
    const letGo = () => store.getState().setWorkflowView({ chosenBox: null });
    const onPress = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(`[data-box-tab="${chosenBox}"]`)) letGo();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") letGo();
    };
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [chosenBox, store]);

  // --- what is drawn ---------------------------------------------------------
  const flow = useMemo(() => ({ model, molecules3d, boxes, steps, wires }), [model, molecules3d, boxes, steps, wires]);
  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);
  const boxById = useMemo(() => new Map(boxes.map((b) => [b.id, b])), [boxes]);
  const gives = (end: WireEnd): Pt | null => {
    if ("box" in end) {
      const b = boxById.get(end.box);
      return b ? boxGives(b) : null;
    }
    const s = stepById.get(end.step);
    return s ? stepGives(s) : null;
  };
  const states = useMemo(() => new Map(steps.map((s) => [s.id, stateOf(flow, s, byOf(s))])), [flow, steps]);
  // each box's tab and list: what it holds, worked out as the page changes, not as the pointer moves
  const boxInfo = useMemo(
    () =>
      new Map(
        boxes.map((b) => {
          const count = countOf(flow, b);
          const molecules = boxMembers(flow, b).molecules.map((id) => molecules3d.find((m) => m.id === id)!);
          const made = b.made ? steps.find((s) => s.id === b.made!.step) : undefined;
          const aside = b.aside?.length ?? 0;
          const counted = !count.entries
            ? "Empty"
            : count.set === "structures"
              ? plural(count.entries, "structure")
              : count.set === "molecules"
                ? `${plural(count.compounds, "compound")}${aside ? ` · ${count.entries} of ${count.entries + aside}` : ""}`
                : `${plural(count.compounds, "compound")} · ${aside ? `${count.entries} of ${count.entries + aside}` : count.entries}`;
          return [b.id, { name: made ? madeName(made.kind, made.options) : "Input", count: counted, rows: boxList(molecules, b.aside ?? [], count.set) }];
        }),
      ),
    [flow, boxes, steps, molecules3d],
  );

  // while a wire is drawn: the ports that would take it lit, the others faint
  const portLook = (side: "take" | "give", id: WireEnd | number): PortLook => {
    if (!wireDrag) return "plain";
    if (side === "take" && wireDrag.from && typeof id === "number") return canWire(flow, wireDrag.from, id) ? "lit" : "dim";
    if (side === "give" && wireDrag.to != null && typeof id !== "number") return canWire(flow, id, wireDrag.to) ? "lit" : "dim";
    if (side === "give" && wireDrag.from && typeof id !== "number" && JSON.stringify(id) === JSON.stringify(wireDrag.from)) return "lit";
    return "dim";
  };

  // the selection, where it holds whole structures or molecules in 3D: the frame an input box would take
  const boxable = useMemo(
    () => selectionFrame(model, sel.atoms, molecules3d, sel3d, style3d, turns3d, frames3d),
    [sel, sel3d, model, molecules3d, style3d, turns3d, frames3d],
  );

  /** The selection boxed as an input, and a wire drawn out of it. */
  const boxSelection = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !boxable) return;
    const st = store.getState();
    const id = st.addBox(boxable);
    st.clearSel();
    drawFrom(e, { box: id });
  };

  const hover = (patch: Partial<Pick<EditorState, "hoveredBox" | "hoveredStep" | "hoveredWire">>) => store.getState().setWorkflowView(patch);
  const unhover = (key: "hoveredBox" | "hoveredStep" | "hoveredWire", id: number) => {
    if (store.getState()[key] === id) hover({ [key]: null });
  };

  // a wire being drawn: from its port to the pointer, or from the pointer to the step it is drawn back from
  const drawn = (() => {
    if (!wireDrag) return null;
    if (wireDrag.from) {
      const p = gives(wireDrag.from);
      return p ? { p, q: wireDrag.at } : null;
    }
    const s = wireDrag.to != null ? stepById.get(wireDrag.to) : undefined;
    return s ? { p: wireDrag.at, q: stepTakes(s) } : null;
  })();

  return (
    <group>
      {/* wires: those drawn, and each step's to the box it made */}
      {wires.map((w) => {
        if (w.id === wireDrag?.was) return null;
        const p = gives(w.from);
        const s = stepById.get(w.to);
        if (!p || !s) return null;
        const failed = states.get(s.id) === "failed";
        return (
          <WireLine
            key={`w${w.id}`}
            p={p}
            q={stepTakes(s)}
            color={hoveredWire === w.id ? COLORS.highlight : failed ? ATTENTION : FRAME_GREY}
            onHover={(on) => (on ? hover({ hoveredWire: w.id }) : unhover("hoveredWire", w.id))}
          />
        );
      })}
      {boxes.map((b) => {
        const s = b.made ? stepById.get(b.made.step) : undefined;
        return s ? <WireLine key={`m${b.id}`} p={stepGives(s)} q={boxTakes(b)} color={FRAME_GREY} /> : null;
      })}
      {drawn && <WireLine p={drawn.p} q={drawn.q} color={COLORS.highlight} />}

      {/* Boxes and steps drawn in HTML on one layer laid on the page at its
          scale: one, so that what is under the pointer is found among them
          in the order they are drawn - boxes, then steps, then the
          selection's port - and not behind a layer of another's. */}
      <PageHtml transform distanceFactor={HTML_DISTANCE} position={[0, 0, 0]} zIndexRange={[18, 18]} pointerEvents="none">
        <div style={{ position: "relative", width: 0, height: 0 }}>
          {boxes.map((b) => {
            const info = boxInfo.get(b.id)!;
            return (
              <div key={`b${b.id}`} style={onLayer(b.x0, b.y1)}>
                <BoxFrame
                  box={b}
                  name={info.name}
                  count={info.count}
                  rows={info.rows}
                  hovered={hoveredBox === b.id}
                  chosen={chosenBox === b.id}
                  give={portLook("give", { box: b.id })}
                  onTabDown={(e) => dragBox(e, b)}
                  onEdgeDown={(edge, e) => sizeBox(edge, e, b)}
                  onGiveDown={(e) => drawFrom(e, { box: b.id })}
                  onContextMenu={menuOf("box", b.id)}
                  onHover={(on) => (on ? hover({ hoveredBox: b.id }) : unhover("hoveredBox", b.id))}
                />
              </div>
            );
          })}

          {steps.map((s) => {
            const info = kindInfo(s.kind);
            const doer = doerOf(s);
            const how = howOf(s.kind, s.options);
            return (
              // (its top at its place: the card grows downwards as it opens)
              <div key={`s${s.id}`} data-step-card={s.id} style={onLayer(s.x, s.y)}>
                <StepCard
                  step={s}
                  info={info}
                  who={[doer?.name ?? "Nothing added does this", how].filter(Boolean).join(" · ")}
                  state={states.get(s.id) ?? "ready"}
                  compact={compact}
                  open={openStep === s.id}
                  ports={{ take: portLook("take", s.id), give: portLook("give", { step: s.id }) }}
                  options={optionsOf(s.kind, s.options)}
                  doers={doersOf(s.kind)}
                  by={byOf(s)}
                  onOptions={(values) => store.getState().updateStep(s.id, { options: values })}
                  onBy={(id) => store.getState().updateStep(s.id, { by: id })}
                  onCardDown={(e) => dragStep(e, s)}
                  onTakeDown={(e) => drawInto(e, s.id)}
                  onGiveDown={(e) => drawFrom(e, { step: s.id })}
                  onContextMenu={menuOf("step", s.id)}
                  onHover={(on) => (on ? hover({ hoveredStep: s.id }) : unhover("hoveredStep", s.id))}
                />
              </div>
            );
          })}
    
          {/* the selection's port: pulled, the selection becomes an input box */}
          {boxable && !wireDrag && (
            <div className="meno-fade-in" style={{ ...onLayer(boxable.x1, (boxable.y0 + boxable.y1) / 2), width: 0, height: 0 }}>
              <Port look="plain" label="Box as input" data={{}} onPointerDown={boxSelection} style={{ left: 0, top: 0 }} />
            </div>
          )}
        </div>
      </PageHtml>
    </group>
  );
}
