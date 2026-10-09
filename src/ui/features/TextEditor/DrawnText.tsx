/**
 * A text to read and edit, drawn by Meno with WebGL (docs/PDF.md, *A
 * text*): its lines pictures drawn in the system's type (linePictures),
 * numbered; the caret, what is selected and what the IME is composing
 * drawn over them. Typing comes through a field kept out of sight under
 * the drawing (typingField). Only the lines in view are drawn, so a long
 * log scrolls as a short file does; one growing at its end keeps its last
 * lines in view, unless it was scrolled up from them.
 */
import * as THREE from "three";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode } from "react";
import { Canvas, flushSync, useFrame, useThree } from "@react-three/fiber";
import { COLORS } from "../../theme/colors";
import { selFrom, selTo } from "../../../lib/text/editing";
import { Editor, GUTTER_PX, PAD_PX } from "./editor";
import { BAND_PX, FONT, INK, LINE_PX, linePicture, TAB, typeReady, xAt } from "./linePictures";
import { hasEditContext, typingField, type TypingField } from "./typingField";
import { typingProbe } from "./typingProbe";

type Props = { value: string; onChange: (v: string) => void };

/** The column of line numbers: its colour, and its numbers'. */
const GUTTER = "rgb(246, 248, 250)";
const NUMBER = "rgb(89, 99, 110)";
/** How far in from the gutter's right edge its numbers end. */
const NUMBER_PAD = 8;
/** What is selected, lit as words selected in a PDF are; less, where the text has not the keys. */
const SELECTED = 0.3;
const SELECTED_AWAY = 0.15;
/** The caret: how wide, how long it shows and hides, and how long it stays after a key. */
const CARET_PX = 2;
const BLINK_MS = 530;

export default function DrawnText({ value, onChange }: Props) {
  const ed = useMemo(() => new Editor(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const boxRef = useRef<HTMLDivElement>(null);
  // (typed through an EditContext on the text's own element, where the webview has one; else a textarea)
  const ec = useMemo(hasEditContext, []);
  const fieldRef = useRef<HTMLTextAreaElement & HTMLDivElement>(null);
  const field = useRef<TypingField | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  // (typed: the workspace's text changed, one step to undo for a run of typing - its own coalescing)
  useEffect(() => {
    ed.onEdited = (t) => changed.current(t);
  }, [ed]);
  // (changed from outside - a job's log grown, an undo)
  useEffect(() => {
    ed.setText(value);
    field.current?.sync();
  }, [ed, value]);

  useLayoutEffect(() => {
    const f = typingField(fieldRef.current!, ed);
    field.current = f;
    return () => f.dispose();
  }, [ed]);

  useLayoutEffect(() => {
    const box = boxRef.current!;
    const sized = () => {
      ed.viewW = box.clientWidth;
      ed.viewH = box.clientHeight;
      ed.scrollTo(ed.scrollTop);
      ed.onChange();
    };
    const seen = new ResizeObserver(sized);
    seen.observe(box);
    sized();
    // (the wheel, and a trackpad's two fingers: the text scrolled, not the column)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) return;
      const k = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? ed.viewH : 1;
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      ed.scrollTo(ed.scrollTop + dy * k, ed.scrollLeft + dx * k);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      seen.disconnect();
      box.removeEventListener("wheel", onWheel);
    };
  }, [ed]);

  // (a press: the caret there, the field given the keys; a drag selects on, the text scrolling on past its edges)
  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    field.current?.focus();
    const box = boxRef.current!.getBoundingClientRect();
    const clicks = Math.min(e.detail || 1, 3);
    const from = ed.pressAt(e.clientX - box.left, e.clientY - box.top, clicks, e.shiftKey);
    field.current?.sync();
    const onMove = (m: MouseEvent) => {
      const y = m.clientY - box.top;
      if (y < 0) ed.scrollTo(ed.scrollTop + y / 2);
      else if (y > ed.viewH) ed.scrollTo(ed.scrollTop + (y - ed.viewH) / 2);
      ed.dragTo(m.clientX - box.left, y, from, clicks);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      field.current?.sync();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      ref={boxRef}
      className="relative w-full h-full overflow-hidden cursor-text"
      style={{ isolation: "isolate" }}
      onMouseDown={onMouseDown}
      // (the field, laid at the caret, never scrolls the text's box to show itself)
      onScroll={(e) => {
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
    >
      <Canvas
        orthographic
        flat
        frameloop="demand"
        dpr={typeof window !== "undefined" ? window.devicePixelRatio : 1}
        camera={{ position: [0, 0, 10], zoom: 1, near: 0.1, far: 100 }}
        gl={{ antialias: false }}
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
      >
        <Scene ed={ed} field={field} />
      </Canvas>
      {ec ? (
        <div ref={fieldRef} data-text-field="" tabIndex={-1} aria-label="Text" style={{ position: "absolute", inset: 0, zIndex: -1, outline: "none" }} />
      ) : (
        <textarea
          ref={fieldRef}
          data-text-field=""
          aria-label="Text"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          wrap="off"
          style={{
            position: "absolute",
            zIndex: -1,
            margin: 0,
            padding: 0,
            border: 0,
            outline: "none",
            resize: "none",
            overflow: "hidden",
            whiteSpace: "pre",
            font: FONT,
            lineHeight: `${LINE_PX}px`,
            tabSize: TAB,
            color: "transparent",
            background: "transparent",
            caretColor: "transparent",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

function Scene({ ed, field }: { ed: Editor; field: MutableRefObject<TypingField | null> }) {
  const { size, camera, invalidate } = useThree();
  const dpr = useThree((s) => s.viewport.dpr);
  // (a box's middle, from its top left on the view - in the scene's units, CSS pixels, down negative - its edges on the screen's pixels)
  const at = (x: number, top: number, w: number, h: number): [number, number, number] => [Math.round(x * dpr) / dpr + w / 2, -(Math.round(top * dpr) / dpr + h / 2), 0];
  const [, setTick] = useState(0);
  const [typeIn, setTypeIn] = useState(false);
  useEffect(() => {
    void typeReady().then(() => setTypeIn(true));
  }, []);
  useEffect(() => {
    // (drawn again before the next frame, once for all a task changed: an update made in an event React
    // does not know - an EditContext's textupdate - would wait otherwise for a task after that frame)
    let due = false;
    ed.onChange = () => {
      if (!due) {
        due = true;
        queueMicrotask(() => {
          due = false;
          flushSync(() => setTick((t) => t + 1));
        });
      }
      field.current?.place();
      invalidate();
    };
    return () => {
      ed.onChange = () => {};
    };
  }, [ed, field, invalidate]);
  useLayoutEffect(() => {
    camera.position.set(size.width / 2, -size.height / 2, 10);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size, invalidate]);
  // (the caret blinking, while the text has the keys)
  useEffect(() => {
    const t = window.setInterval(() => ed.focused && invalidate(), BLINK_MS / 2);
    return () => window.clearInterval(t);
  }, [ed, invalidate]);
  const caretRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    typingProbe.drawn();
    const since = performance.now() - ed.stirred;
    if (caretRef.current) caretRef.current.visible = ed.focused && (since < BLINK_MS || Math.floor(since / BLINK_MS) % 2 === 0);
  });

  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  if (!typeIn) return null;
  typingProbe.rendered();
  const first = Math.max(0, Math.floor(ed.scrollTop / LINE_PX));
  const last = Math.min(ed.lines.count - 1, Math.floor((ed.scrollTop + ed.viewH) / LINE_PX));
  const left = GUTTER_PX + PAD_PX - ed.scrollLeft;
  const comp = ed.composing;
  const compLine = comp ? ed.lines.at(comp.from) : -1;
  const out: ReactNode[] = [];
  const box = (key: string, x: number, top: number, w: number, h: number, color: string, opacity: number, order: number) =>
    out.push(
      <mesh key={key} geometry={plane} position={at(x, top, w, h)} scale={[w, h, 1]} renderOrder={order}>
        <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>,
    );
  const from = selFrom(ed.sel);
  const to = selTo(ed.sel);
  for (let i = first; i <= last; i++) {
    const top = ed.topOf(i);
    const start = ed.lines.start(i);
    const end = ed.lines.end(i);
    let line = ed.lines.line(i);
    // (what the IME has so far, in place of what it takes the place of)
    if (i === compLine && comp) line = line.slice(0, comp.from - start) + comp.text + (comp.to <= end ? line.slice(comp.to - start) : "");
    for (let band = Math.max(0, Math.floor(ed.scrollLeft / BAND_PX)); band * BAND_PX < ed.scrollLeft + ed.viewW; band++) {
      const p = linePicture(line, band, dpr);
      if (!p) break;
      out.push(
        <mesh key={`l${i}:${band}`} geometry={plane} position={at(left + band * BAND_PX, top, p.w, p.h)} scale={[p.w, p.h, 1]} renderOrder={0}>
          <meshBasicMaterial map={p.texture} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>,
      );
    }
    // (what is selected on the line - and past its end, where it goes on to the next)
    if (!comp && from !== to && from <= end && to > start) {
      const a = Math.max(from, start);
      const b = Math.min(to, end);
      const x0 = ed.xOf(a);
      const x1 = ed.xOf(b) + (to > end ? 6 : 0);
      box(`s${i}`, x0, top, Math.max(1, x1 - x0), LINE_PX, COLORS.highlight, ed.focused ? SELECTED : SELECTED_AWAY, 1);
    }
    if (i === compLine && comp) {
      // (underlined, clause by clause as the system says - the one being converted thick - or else
      // all of it, and what the IME has selected in it more strongly; a gap between clauses)
      const at = (k: number) => left + xAt(line, comp.from - start + k);
      const clauses = comp.clauses?.length ? comp.clauses : [{ from: 0, to: comp.text.length, thick: false }];
      clauses.forEach((c, k) => {
        const x0 = at(c.from) + (k > 0 ? 1 : 0);
        const x1 = at(c.to) - (k < clauses.length - 1 ? 1 : 0);
        box(`u${k}`, x0, top + LINE_PX - (c.thick ? 4 : 3), Math.max(1, x1 - x0), c.thick ? 2 : 1, INK, 1, 2);
      });
      const [a, b] = comp.sel;
      if (!comp.clauses?.length && b > a) box("U", at(a), top + LINE_PX - 4, Math.max(1, at(b) - at(a)), 2, INK, 1, 2);
    }
  }
  // the caret - in what the IME has so far, where it says
  const caretLine = comp ? compLine : ed.lines.at(ed.sel.head);
  if (caretLine >= first && caretLine <= last && (!comp || comp.sel[0] === comp.sel[1])) {
    const start = ed.lines.start(caretLine);
    const x = comp ? left + xAt(ed.lines.line(caretLine).slice(0, comp.from - start) + comp.text, comp.from - start + comp.sel[0]) : ed.xOf(ed.sel.head);
    out.push(
      <mesh key="caret" ref={caretRef} geometry={plane} position={at(x - CARET_PX / 2, ed.topOf(caretLine) + 1, CARET_PX, LINE_PX - 2)} scale={[CARET_PX, LINE_PX - 2, 1]} renderOrder={3}>
        <meshBasicMaterial color="#1f2328" depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>,
    );
  }
  // the line numbers, over what has scrolled under them
  box("gutter", 0, 0, GUTTER_PX, ed.viewH, GUTTER, 1, 4);
  for (let i = first; i <= last; i++) {
    const p = linePicture(String(i + 1), 0, dpr, NUMBER, GUTTER);
    if (!p) continue;
    out.push(
      <mesh key={`n${i}`} geometry={plane} position={at(GUTTER_PX - NUMBER_PAD - p.w, ed.topOf(i), p.w, p.h)} scale={[p.w, p.h, 1]} renderOrder={5}>
        <meshBasicMaterial map={p.texture} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>,
    );
  }
  return (
    <>
      <color attach="background" args={["#ffffff"]} />
      {out}
    </>
  );
}
