import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useEditor } from "../store";
import { fontStack, type LayoutOptions } from "../../../../lib/chem/layout2d";
import { editorLayoutOptions } from "../layoutOptions";
import { useDrawingStyle } from "../useDrawingStyle";
import { labelKey, typedLabel } from "../utils/labelTyping";

export default function LabelEditor2D() {
  const { camera } = useThree();
  const [zoom, setZoom] = useState((camera as THREE.OrthographicCamera).zoom);
  useEffect(() => {
    const onFrame = () => {
      const z = (camera as THREE.OrthographicCamera).zoom;
      if (z !== zoom) setZoom(z);
      raf = requestAnimationFrame(onFrame);
    };
    let raf = requestAnimationFrame(onFrame);
    return () => cancelAnimationFrame(raf);
  }, [camera, zoom]);
  const {
    model,
    hovered,
    labelEdit,
    beginLabelEdit,
    setLabelEditValue,
    commitLabelEdit,
    cancelLabelEdit,
  } = useEditor();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // whether an input method is composing in the box: its text is left alone
  const composing = useRef(false);
  // Each edit a box of its own, given its text when it opens and not again:
  // the box is drawn in a React root of its own (drei's Html), a moment
  // behind the store, and a value written into it from there lands on an
  // input method's composition in progress - which then puts its text in
  // a second time. What the label's rules change is set on the box itself.
  const session = useRef({ active: false, n: 0 });
  if (labelEdit.active && !session.current.active) session.current.n++;
  session.current.active = labelEdit.active;
  /** The box's text as the label's rules have it, set in the box where it differs. */
  const settle = (el: HTMLInputElement) => {
    const v = el.value;
    const t = typedLabel(v, labelEdit.autoCap);
    if (t !== v) {
      const at = el.selectionStart ?? t.length;
      el.value = t;
      el.setSelectionRange(Math.min(at, t.length), Math.min(at, t.length));
    }
    setLabelEditValue(t);
  };
  // Fade control and position retention
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const ANIM_MS = 180;
  // Focus helper
  const focusInputEnd = () => {
    const el = inputRef.current;
    if (!el) return false;
    // (focused already, or an input method composing: the caret is left
    // where it is - moving it commits the composition, and it comes again)
    if (document.activeElement === el) return true;
    if (composing.current) return false;
    try {
      el.focus({ preventScroll: true });
      const v = el.value;
      if (typeof el.setSelectionRange === "function") {
        el.setSelectionRange(v.length, v.length);
      }
      return document.activeElement === el;
    } catch {
      return false;
    }
  };

  // Mount/unmount and focus (delayed unmount for fade-out)
  useEffect(() => {
    if (labelEdit.active) {
      setMounted(true);
      setExiting(false);
      requestAnimationFrame(() => {
        if (!focusInputEnd()) {
          setTimeout(() => {
            labelEdit.active && focusInputEnd();
          }, 0);
          setTimeout(() => {
            labelEdit.active && focusInputEnd();
          }, 60);
          setTimeout(() => {
            labelEdit.active && focusInputEnd();
          }, 120);
        }
      });
    } else if (mounted) {
      setExiting(true);
      const t = window.setTimeout(() => {
        setMounted(false);
        setExiting(false);
      }, ANIM_MS);
      return () => window.clearTimeout(t);
    }
  }, [labelEdit.active, mounted]);

  // Key events: start editing when typing letters over a hovered label
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (labelEdit.active) return;
      if (!hovered.atomId) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Typing into a box elsewhere - a setting beside the canvas - is not
      // typing a label.
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      const ch = labelKey(e);
      if (ch) {
        // First char uppercase; subsequent chars as typed
        const initial = ch.toUpperCase();
        beginLabelEdit(hovered.atomId, initial);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hovered.atomId, labelEdit.active, beginLabelEdit]);

  const atom = useMemo(() => {
    if (labelEdit.atomId == null) return null;
    return model.atoms.find((a) => a.id === labelEdit.atomId) || null;
  }, [model.atoms, labelEdit.atomId]);
  // Font size logic similar to Labels2D (world units; perceived size stable with zoom)
  const style = useDrawingStyle();
  const opts: LayoutOptions = useMemo(() => editorLayoutOptions(style), [style]);
  // Keep last position during fade-out
  useEffect(() => {
    if (atom) lastPosRef.current = { x: atom.x, y: atom.y };
  }, [atom?.x, atom?.y]);
  // Label(Text) uses world-unit font size; on screen it is scaled by zoom
  // Html(transform=false) renders in screen CSS px; to match appearance: px = world * zoom
  const fontSizePx = opts.fontPx * Math.max(zoom, 1e-6);
  // Typed in the typeface the label will be set in
  const fontFamily = fontStack(style.fontFamily);
  // Measure text width and fit input width
  const measRef = useRef<{
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } | null>(null);
  const measureTextPx = (text: string) => {
    if (!measRef.current) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return 0;
      measRef.current = { canvas, ctx };
    }
    const { ctx } = measRef.current;
    ctx.font = `${fontSizePx}px ${fontFamily}`;
    const t = text && text.length > 0 ? text : "H"; // Ensure minimum width when empty
    const m = ctx.measureText(t);
    return m.width;
  };
  const textWidthPx = useMemo(
    () => measureTextPx(labelEdit.value),
    [labelEdit.value, fontSizePx, fontFamily]
  );
  // First char half width (px) for offsetting left-aligned editor to match single-uppercase position
  const firstCharHalfWidthPx = useMemo(() => {
    if (!measRef.current) return 0;
    const { ctx } = measRef.current;
    ctx.font = `${fontSizePx}px ${fontFamily}`;
    const ch = (labelEdit.value && labelEdit.value[0]) || "H";
    return ctx.measureText(ch).width * 0.5;
  }, [labelEdit.value, fontSizePx, fontFamily]);
  // Only two-letter element symbols are centered; single uppercase is left-aligned
  const isTwoLetterElementSymbol = (s: string) => /^[A-Z][a-z]$/.test(s);
  const alignCenter = isTwoLetterElementSymbol(
    labelEdit.value || (atom?.el ?? "")
  );

  if (!mounted && !exiting) return null;
  const pos = atom ?? lastPosRef.current ?? { x: 0, y: 0 };

  const wrapperOpacity = labelEdit.active ? 1 : 0;

  return (
    <Html
      position={[
        alignCenter
          ? pos.x
          : pos.x - firstCharHalfWidthPx / Math.max(zoom, 1e-6),
        pos.y,
        0,
      ]}
      center={alignCenter}
      style={{ pointerEvents: "auto", zIndex: 30 }}
      transform={false}
    >
      <div
        onPointerDown={(e) => {
          try {
            e.stopPropagation();
          } catch {}
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: alignCenter ? "center" : "flex-start",
          // Height slightly above font height; width fits text (managed by input width)
          paddingTop: Math.max(2, fontSizePx * 0.12),
          paddingBottom: Math.max(2, fontSizePx * 0.12),
          paddingLeft: alignCenter
            ? Math.max(4, fontSizePx * 0.16)
            : Math.max(2, fontSizePx * 0.08),
          paddingRight: Math.max(4, fontSizePx * 0.16),
          background: "rgba(255,255,255,0.96)",
          borderRadius: Math.max(4, fontSizePx * 0.25),
          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
          opacity: wrapperOpacity,
          transition: `opacity ${ANIM_MS}ms ease`,
          // For left alignment, vertically center only
          transform: alignCenter ? undefined : "translateY(-50%)",
        }}
      >
        <input
          key={session.current.n}
          ref={inputRef}
          id={`atom-label-${labelEdit.atomId ?? ""}`}
          name={`atom-label-${labelEdit.atomId ?? ""}`}
          autoComplete="off"
          // a label as typed: "--" stays "--", a quote stays straight
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoFocus
          defaultValue={labelEdit.value}
          onPointerDown={(e) => {
            try {
              e.stopPropagation();
            } catch {}
          }}
          onClick={(e) => {
            try {
              e.stopPropagation();
            } catch {}
          }}
          onChange={(e) => {
            // an input method composing: its text as it is, for now
            if (composing.current || (e.nativeEvent as InputEvent).isComposing) {
              setLabelEditValue(e.currentTarget.value);
              return;
            }
            // First char auto-capitalized; others as typed
            settle(e.currentTarget);
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            settle(e.currentTarget);
          }}
          placeholder={atom?.el === "C" ? "C" : undefined}
          onKeyDown={(e) => {
            // (Enter and Escape during a composition are the input method's)
            if (composing.current || e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              commitLabelEdit();
              e.preventDefault();
            } else if (e.key === "Escape") {
              cancelLabelEdit();
              e.preventDefault();
            } else if (e.key === "Backspace") {
              // If the first char is removed (Backspace), disable autoCap for this session (length check in setLabelEditValue)
              // No special handling needed here
            }
          }}
          onBlur={() => commitLabelEdit()}
          style={{
            fontSize: `${fontSizePx}px`,
            fontFamily,
            padding: 0,
            border: "none",
            borderRadius: 0,
            outline: "none",
            background: "transparent",
            // Fit to text width (keep a tiny trailing cursor room when left-aligned)
            width: `${Math.ceil(
              textWidthPx + (alignCenter ? 0 : Math.max(1, fontSizePx * 0.04))
            )}px`,
            textAlign: alignCenter ? "center" : "left",
            color:
              labelEdit.value.length === 0 && atom?.el === "C"
                ? "#888"
                : "#000",
            lineHeight: 1,
            opacity: wrapperOpacity,
            transition: `opacity ${ANIM_MS}ms ease`,
          }}
        />
      </div>
    </Html>
  );
}
