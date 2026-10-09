import PageHtml from "./PageHtml";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { CAPTION_LINE, captionLines, captionPlace, captionSet } from "../../../../lib/chem/captions";
import { fontStack, labelSetOf } from "../../../../lib/chem/layout2d";
import { useEditor, useEditorStore } from "../store";
import { useDrawnLayout } from "./drawnLayoutContext";

/**
 * Words written in place (lib/chem/captions): a box where they stand - or,
 * new, where Quick Add or the menu was opened - in the drawing's typeface
 * at its size. Enter keeps them, Shift+Enter starts another line, Escape
 * lets them go, and a press elsewhere keeps them too. New words put down
 * near an arrow go over it or under it; words written anew over an arrow
 * stay clear of it as they grow. Words made as wide as something are
 * written as wide, broken into lines as they will be. Words written away
 * are gone.
 */
export default function CaptionEditor2D() {
  const edit = useEditor((s) => s.captionEdit);
  const captions = useEditor((s) => s.captions);
  const store = useEditorStore();
  const { opts } = useDrawnLayout();
  const { camera } = useThree();
  // (the box is drawn in the screen's pixels: as large as the words at this zoom)
  const [zoom, setZoom] = useState((camera as THREE.OrthographicCamera).zoom);
  useEffect(() => {
    let raf = requestAnimationFrame(function onFrame() {
      const z = (camera as THREE.OrthographicCamera).zoom;
      setZoom((was) => (was === z ? was : z));
      raf = requestAnimationFrame(onFrame);
    });
    return () => cancelAnimationFrame(raf);
  }, [camera]);
  const box = useRef<HTMLTextAreaElement | null>(null);
  // (kept, or let go, once: the box's going takes its focus with it)
  const done = useRef(false);
  const composing = useRef(false);
  const caption = edit?.id != null ? captions.find((c) => c.id === edit.id) : undefined;
  const [lines, setLines] = useState<string[]>([""]);
  // each edit its box anew, given its words as it opens
  const session = edit ? `${edit.id ?? "new"}:${edit.at.x}:${edit.at.y}` : null;
  useEffect(() => {
    if (!session) return;
    done.current = false;
    setLines((caption?.text ?? "").split("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
  if (!edit) return null;
  const at = caption ? { x: caption.x, y: caption.y } : edit.at;
  const fontPx = opts.fontPx * Math.max(zoom, 1e-6);
  const family = fontStack(opts.fontFamily ?? "Arial");

  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    const s = store.getState();
    const text = (box.current?.value ?? "").replace(/\s+$/, "").replace(/^\s*\n/, "");
    if (keep) {
      const set = labelSetOf(opts);
      const half = (t: string) => {
        const r = captionSet(t, 0, 0, opts.fontPx, set, caption?.width);
        return { w: r.halfW, h: r.halfH };
      };
      const others = s.captions
        .filter((o) => o.id !== edit.id)
        .map((o) => {
          const r = captionSet(o.text, o.x, o.y, opts.fontPx, set, o.width);
          return { ...o, halfW: r.halfW, halfH: r.halfH };
        });
      if (edit.id == null) {
        if (text.trim()) {
          const placed = captionPlace(edit.at, half(text), s.arrows, opts.fontPx, others);
          s.addCaption(text, placed.x, placed.y, placed.arrow);
        }
      } else if (!text.trim()) s.removeCaption(edit.id);
      else if (caption && text !== caption.text) {
        // (over an arrow: kept clear of it as it grows or shrinks)
        const arrow = caption.arrow != null ? s.arrows.find((a) => a.id === caption.arrow) : undefined;
        const placed = arrow ? captionPlace({ x: caption.x, y: caption.y }, half(text), [arrow], opts.fontPx, others) : null;
        s.updateCaption(edit.id, placed ? { text, x: placed.x, y: placed.y, arrow: placed.arrow ?? null } : { text });
      }
    }
    s.setCaptionEdit(null);
  };

  // as wide as its longest line - or as it was made - and as tall as its lines: measured in its own typeface
  const wide = caption?.width;
  const widest = wide ? wide * zoom : Math.max(1, ...lines.map((l) => measure(l || " ", fontPx, family)));
  const rows = wide ? captionLines(lines.join("\n"), opts.fontPx, labelSetOf(opts), wide).length : lines.length;
  return (
    <PageHtml position={[at.x, at.y, 0]} center transform={false} style={{ pointerEvents: "auto", zIndex: 30 }}>
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          padding: `${Math.max(2, fontPx * 0.15)}px ${Math.max(4, fontPx * 0.3)}px`,
          background: "rgba(255,255,255,0.96)",
          borderRadius: Math.max(4, fontPx * 0.25),
          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        }}
      >
        <textarea
          key={session ?? ""}
          ref={box}
          aria-label="Text"
          // (its own undo, as it is written: the words are the document's once kept)
          data-native-undo=""
          autoFocus
          defaultValue={caption?.text ?? ""}
          // (written as typed: no curly quotes, corrections or capitals from the system)
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          rows={Math.max(1, rows)}
          onInput={(e) => setLines(e.currentTarget.value.split("\n"))}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => (composing.current = false)}
          onKeyDown={(e) => {
            // (Enter and Escape while an input method composes are its own)
            if (composing.current || e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              finish(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              finish(false);
            }
          }}
          onBlur={() => finish(true)}
          style={{
            display: "block",
            width: Math.ceil(widest + fontPx * 0.6),
            fontSize: fontPx,
            lineHeight: CAPTION_LINE,
            fontFamily: family,
            textAlign: "center",
            padding: 0,
            border: "none",
            outline: "none",
            resize: "none",
            overflow: "hidden",
            background: "transparent",
            color: opts.labelColor ?? "black",
          }}
        />
      </div>
    </PageHtml>
  );
}

let measurer: CanvasRenderingContext2D | null = null;

/** How wide `text` is set at `px` in `family`, in the screen's pixels. */
function measure(text: string, px: number, family: string): number {
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) return text.length * px * 0.6;
  measurer.font = `${px}px ${family}`;
  return measurer.measureText(text).width;
}
