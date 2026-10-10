/**
 * Words on the page written in place (lib/chem/captions; docs/EDITOR-2D.md,
 * *Text*; docs/PDF.md, step 5): drawn by Meno as they will be kept - set
 * as the drawing sets its labels, in its typeface at its size, broken into
 * lines as wide as they are made where they are given a width - with the
 * caret, what is selected and what the IME composes drawn over them, lit
 * round as words under the pointer are. Typed through the field the
 * column's texts are typed through (TextEditor/typingField), kept out of
 * sight and laid at the caret, so that the IME's candidates show there.
 *
 * Where they stand - or, new, where Quick Add or the menu was opened. A
 * click among them puts the caret, two select a word, three a line, a drag
 * selects on. Enter keeps them, Shift+Enter starts another line, Escape
 * lets them go, and a press elsewhere keeps them too. New words put down
 * near an arrow go over it or under it; words written anew over an arrow
 * stay clear of it as they grow. Words written away are gone.
 */
import * as THREE from "three";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync, useFrame, useThree } from "@react-three/fiber";
import { CAPTION_LINE, captionPlace, captionPlaces, captionSet } from "../../../../lib/chem/captions";
import { fontStack, labelSetOf } from "../../../../lib/chem/layout2d";
import { IS_MAC } from "../../../../lib/doc/shortcuts";
import { selFrom, selTo } from "../../../../lib/text/editing";
import { COLORS } from "../../../theme/colors";
import { useEditor, useEditorStore } from "../store";
import type { Caption, EditorState } from "../store/types";
import { pageAt } from "../utils/page";
import { WordsEditor } from "../utils/wordsEditor";
import { useDrawnLayout } from "./drawnLayoutContext";
import { Texts2D } from "./Labels2D";
import { hasEditContext, typingField, type TypingField } from "../../TextEditor/typingField";

/** How far round the words they are lit, and taken as theirs by a press, in ems; how strongly the light shows. */
const MARGIN = 0.3;
const LIT = 0.16;
/** What is selected, lit as in the column. */
const SELECTED = 0.3;
/** The caret: how wide on the screen, in pixels, and how long it shows and hides - steadily, a moment after a key. */
const CARET_PX = 1.5;
const BLINK_MS = 530;
/** Two presses this near in time and place are two clicks: in ms, and in pixels. */
const CLICKS_MS = 500;
const CLICKS_PX = 4;

type Edit = NonNullable<EditorState["captionEdit"]>;
type Pt = { x: number; y: number };

export default function CaptionTyping2D() {
  const edit = useEditor((s) => s.captionEdit);
  const captions = useEditor((s) => s.captions);
  if (!edit) return null;
  const caption = edit.id != null ? captions.find((c) => c.id === edit.id) : undefined;
  // (each edit written anew, given its words as it opens)
  return <Writing key={`${edit.id ?? "new"}:${edit.at.x}:${edit.at.y}`} edit={edit} caption={caption} />;
}

let measurer: CanvasRenderingContext2D | null = null;
/** How wide a text is set in a CSS font, in the screen's pixels. */
function measured(font: string, text: string): number {
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) return text.length * 8;
  measurer.font = font;
  return measurer.measureText(text).width;
}

function Writing({ edit, caption }: { edit: Edit; caption?: Caption }) {
  const store = useEditorStore();
  const { opts } = useDrawnLayout();
  const { camera, gl, size, invalidate } = useThree();
  const [, setTick] = useState(0);
  // (its words as they were, or none: written in their own editor until they are kept)
  const [ed] = useState(() => new WordsEditor(caption?.text ?? ""));
  const field = useRef<TypingField | null>(null);
  const done = useRef(false);

  const at = caption ? { x: caption.x, y: caption.y } : edit.at;
  const fs = opts.fontPx;
  const set = useMemo(() => labelSetOf(opts), [opts]);
  const cam = camera as THREE.OrthographicCamera;
  const zoom = cam.zoom || 1;
  const px = 1 / zoom;
  const margin = MARGIN * fs;

  // the words as they are drawn: what the IME has so far in place of what it replaces
  const c = ed.composing;
  const shownText = c ? ed.text.slice(0, c.from) + c.text + ed.text.slice(c.to) : ed.text;
  const laid = captionSet(shownText, at.x, at.y, fs, set, caption?.width, caption?.align);
  const places = captionPlaces(ed.text, at.x, at.y, fs, set, caption?.width, caption?.align);
  const shown = c ? captionPlaces(shownText, at.x, at.y, fs, set, caption?.width, caption?.align) : places;
  const halfW = Math.max(laid.halfW, fs / 2);
  const halfH = Math.max(laid.halfH, fs / 2);
  const font = `${fs * zoom}px ${fontStack(opts.fontFamily ?? "Arial")}`;
  ed.layout = {
    places,
    shown,
    toScreen: (p: Pt) => ({ x: size.width / 2 + (p.x - cam.position.x) * zoom, y: size.height / 2 - (p.y - cam.position.y) * zoom }),
    linePx: fs * CAPTION_LINE * zoom,
    font,
    measure: (t: string) => measured(font, t),
  };

  /** Kept, or let go - once. */
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    const s = store.getState();
    const text = ed.text.replace(/\s+$/, "").replace(/^\s*\n/, "");
    if (keep) {
      const half = (t: string) => {
        const r = captionSet(t, 0, 0, fs, set, caption?.width, caption?.align);
        return { w: r.halfW, h: r.halfH };
      };
      const others = s.captions
        .filter((o) => o.id !== edit.id)
        .map((o) => {
          const r = captionSet(o.text, o.x, o.y, fs, set, o.width, o.align);
          return { ...o, halfW: r.halfW, halfH: r.halfH };
        });
      if (edit.id == null) {
        if (text.trim()) {
          const placed = captionPlace(edit.at, half(text), s.arrows, fs, others);
          s.addCaption(text, placed.x, placed.y, placed.arrow);
        }
      } else if (!text.trim()) s.removeCaption(edit.id);
      else if (caption && text !== caption.text) {
        // (over an arrow: kept clear of it as it grows or shrinks)
        const arrow = caption.arrow != null ? s.arrows.find((a) => a.id === caption.arrow) : undefined;
        const placed = arrow ? captionPlace({ x: caption.x, y: caption.y }, half(text), [arrow], fs, others) : null;
        s.updateCaption(edit.id, placed ? { text, x: placed.x, y: placed.y, arrow: placed.arrow ?? null } : { text });
      }
    }
    s.setCaptionEdit(null);
  };
  const finishing = useRef(finish);
  finishing.current = finish;
  /** Where on the page a point of the screen is; and whether it is among the words, theirs to take. */
  const room = useRef({ at, halfW, halfH, margin });
  room.current = { at, halfW, halfH, margin };

  // the field: made as the words are written, given the keys, laid at the caret - gone with them
  useLayoutEffect(() => {
    const host = gl.domElement.parentElement ?? document.body;
    const ec = hasEditContext();
    const el: HTMLElement = document.createElement(ec ? "div" : "textarea");
    // (its words not the document's until kept: its undo its own - and no drawing's shortcut while it has the keys)
    el.dataset.textField = "";
    el.dataset.nativeUndo = "";
    el.setAttribute("aria-label", "Text");
    if (el instanceof HTMLTextAreaElement) {
      el.spellcheck = false;
      el.setAttribute("autocorrect", "off");
      el.setAttribute("autocapitalize", "off");
      el.setAttribute("autocomplete", "off");
      el.wrap = "off";
    } else el.tabIndex = -1;
    Object.assign(el.style, {
      position: "absolute",
      margin: "0",
      padding: "0",
      border: "0",
      outline: "none",
      resize: "none",
      overflow: "hidden",
      whiteSpace: "pre",
      opacity: "0",
      pointerEvents: "none",
      background: "transparent",
      ...(ec ? { inset: "0" } : {}),
    });
    host.appendChild(el);
    // (Enter, Escape and undo the words' own - before the field takes the keys)
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || ed.composing) return;
      const mod = IS_MAC ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        stop();
        finishing.current(true);
      } else if (e.key === "Escape") {
        stop();
        finishing.current(false);
      } else if (mod && key === "z") {
        stop();
        if (e.shiftKey) ed.redo();
        else ed.undo();
        field.current?.sync();
      } else if (!IS_MAC && e.ctrlKey && key === "y") {
        stop();
        ed.redo();
        field.current?.sync();
      }
    };
    el.addEventListener("keydown", onKey);
    const f = typingField(el, ed);
    field.current = f;
    // (the keys gone elsewhere - a press away from the words, another window: kept)
    const onBlur = () =>
      window.setTimeout(() => {
        if (document.activeElement !== el) finishing.current(true);
      }, 0);
    el.addEventListener("blur", onBlur);
    f.focus();
    f.sync();
    return () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("blur", onBlur);
      f.dispose();
      field.current = null;
      el.remove();
    };
  }, [ed, gl]);

  // anything drawn changed: drawn again, the field laid at the caret
  useEffect(() => {
    // (drawn again before the next frame, once for all a task changed, as the column's text is (ColumnText): an update
    // made in an event React does not know - an EditContext's textupdate - would wait otherwise for a task after that frame)
    let due = false;
    ed.onChange = () => {
      if (!due) {
        due = true;
        queueMicrotask(() => {
          due = false;
          flushSync(() => setTick((t) => t + 1));
        });
      }
      invalidate();
      field.current?.place();
    };
    return () => {
      ed.onChange = () => {};
    };
  }, [ed, invalidate]);
  // (drawn again: the field laid at the caret)
  useEffect(() => {
    field.current?.place();
  });

  // a press among the words: the caret there, two clicks a word, three a line, a drag selecting on - the field keeping the keys
  useEffect(() => {
    const toWorld = (cx: number, cy: number): Pt => {
      const r = gl.domElement.getBoundingClientRect();
      const p = pageAt(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), camera);
      return { x: p.x, y: p.y };
    };
    const among = (e: MouseEvent) => {
      if (e.target !== gl.domElement) return null;
      const q = toWorld(e.clientX, e.clientY);
      const r = room.current;
      return Math.abs(q.x - r.at.x) <= r.halfW + r.margin && Math.abs(q.y - r.at.y) <= r.halfH + r.margin ? q : null;
    };
    let last = { t: 0, x: 0, y: 0, clicks: 0 };
    const onDown = (e: PointerEvent) => {
      const q = among(e);
      // (elsewhere: the press its own, the words kept as the field lets the keys go)
      if (!q) return;
      // (theirs: no box begun, no view moved - nor the field's keys let go)
      e.preventDefault();
      e.stopPropagation();
      if (e.button !== 0) return;
      const now = performance.now();
      const clicks = now - last.t < CLICKS_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < CLICKS_PX ? Math.min(3, last.clicks + 1) : 1;
      last = { t: now, x: e.clientX, y: e.clientY, clicks };
      const from = ed.pressAt(q, clicks, e.shiftKey);
      field.current?.focus();
      field.current?.sync();
      const onMove = (m: PointerEvent) => ed.dragTo(toWorld(m.clientX, m.clientY), from, clicks);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        field.current?.sync();
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
    };
    // (two clicks among them, or a right-click: no Quick Add, no menu)
    const swallow = (e: MouseEvent) => {
      if (!among(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("dblclick", swallow, true);
    window.addEventListener("contextmenu", swallow, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("dblclick", swallow, true);
      window.removeEventListener("contextmenu", swallow, true);
    };
  }, [ed, gl, camera]);

  // the caret blinking, while the words have the keys
  useEffect(() => {
    const t = window.setInterval(() => ed.focused && invalidate(), BLINK_MS / 2);
    return () => window.clearInterval(t);
  }, [ed, invalidate]);
  const caretRef = useRef<THREE.Mesh>(null);
  // (the view moved or zoomed: drawn again at its size, the field laid at the caret again)
  const view = useRef("");
  useFrame(() => {
    const now = `${cam.zoom},${cam.position.x},${cam.position.y},${size.width},${size.height}`;
    if (now === view.current) return;
    view.current = now;
    setTick((t) => t + 1);
  });
  useFrame(() => {
    const since = performance.now() - ed.stirred;
    if (caretRef.current) caretRef.current.visible = ed.focused && (since < BLINK_MS || Math.floor(since / BLINK_MS) % 2 === 0);
  });

  const out: ReactNode[] = [];
  const box = (key: string, x0: number, x1: number, y: number, h: number, color: string, opacity: number, order: number, ref?: React.Ref<THREE.Mesh>) =>
    out.push(
      <mesh key={key} ref={ref} position={[(x0 + x1) / 2, y, 0.05]} scale={[Math.max(px, x1 - x0), h, 1]} renderOrder={order}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>,
    );
  const lineH = fs * CAPTION_LINE;
  // what is selected, line by line
  const from = selFrom(ed.sel);
  const to = selTo(ed.sel);
  if (!c && to > from) {
    const a = places.at[from];
    const b = places.at[to];
    for (let i = a.line; i <= b.line; i++) {
      const l = places.lines[i];
      box(`s${i}`, i === a.line ? a.x : l.x0, i === b.line ? b.x : l.x1 + fs * 0.25, l.y, lineH, COLORS.highlight, SELECTED, 4);
    }
  }
  // what the IME has so far, underlined - clause by clause where the system says, the one converted thick
  if (c) {
    const clauses = c.clauses?.length ? c.clauses : [{ from: 0, to: c.text.length, thick: false }];
    clauses.forEach((k, n) => {
      const a = shown.at[c.from + k.from];
      const b = shown.at[c.from + k.to];
      for (let i = a.line; i <= b.line; i++) {
        const l = shown.lines[i];
        const x0 = (i === a.line ? a.x : l.x0) + (n > 0 ? px : 0);
        const x1 = (i === b.line ? b.x : l.x1) - (n < clauses.length - 1 ? px : 0);
        const thick = (k.thick ? 2 : 1) * px;
        box(`u${n}:${i}`, x0, x1, l.y - fs * 0.62 - thick / 2, thick, opts.labelColor ?? "#000000", 1, 6);
      }
    });
  }
  // the caret - in what the IME has so far, where it says
  if (!c || c.sel[0] === c.sel[1]) {
    const p = c ? shown.at[c.from + c.sel[1]] : places.at[ed.sel.head];
    const l = (c ? shown : places).lines[p.line];
    box("caret", p.x - (CARET_PX * px) / 2, p.x + (CARET_PX * px) / 2, l.y - fs * 0.05, fs * 1.15, opts.labelColor ?? "#000000", 1, 7, caretRef);
  }
  return (
    <group>
      {/* lit round, as words under the pointer are */}
      <mesh position={[at.x, at.y, 0.04]} renderOrder={5}>
        <planeGeometry args={[2 * (halfW + margin), 2 * (halfH + margin)]} />
        <meshBasicMaterial color={COLORS.highlight} transparent opacity={LIT} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* (the type, made as it is first needed, waited for here: not by the field, which would be taken away meanwhile, and the keys with it) */}
      <Suspense fallback={null}>
        <Texts2D texts={laid.items} />
      </Suspense>
      {out}
    </group>
  );
}
