import PageHtml from "./PageHtml";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import {
  fontStack,
  labelBox,
  labelSetOf,
  type LabelBox,
} from "../../../../lib/chem/layout2d";
import {
  bondSide,
  exitDistance,
  MARK_MIN_PX,
  MARK_SCALE,
  placeMark,
  stereoTextEms,
  stereoWaysOut,
  valenceMessage,
  type ChemMarks,
  type Rect,
} from "../chem/marks";
import { useEditor } from "../store";
import type { Model } from "../store/types";
import { useDrawnLayout } from "./drawnLayoutContext";
import { usePresence } from "../../../theme/presence";
import StereoText from "./StereoText";

/** Marks sit over the drawing, and under the canvas's buttons and cards. */
const Z_RANGE = [20, 10];

/** Half a capital letter's height, as a share of the labels' size: how far R or S stands off its atom where the style does not say. */
const HALF_CAPITAL = 0.35;

/** Half the height of a mark's letters, in ems of their size: a capital's, and a little round it. */
const MARK_HALF_HEIGHT = 0.42;

/** How far apart two of R, S, E and Z keep at the least, in ems of their size. */
const MARKS_APART = 0.6;

/**
 * RDKit's marks on the structure: a ring round each atom with more bonds
 * than it can have - saying what is wrong while the pointer is on it - and
 * R, S, E and Z beside stereocentres and double bonds, each placed clear of
 * the bonds and labels, and written as the drawing's labels are - in its
 * typeface and its colour, in italics, in parentheses if its style says
 * so. They are the editor's, laid over the drawing where it stands this
 * frame; they are not part of it, and no picture of it has them.
 */
export default function ChemMarks2D({ marks }: { marks: ChemMarks | null }) {
  const { atoms, layout, opts, zoom } = useDrawnLayout();
  const model = useEditor((s) => s.model);
  const hoveredAtom = useEditor((s) => s.hovered.atomId);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [marks, invalidate]);

  // the structure where it is drawn this frame: a dragged atom where it is
  const drawn: Model = useMemo(() => {
    const at = new Map(atoms.map((a) => [a.id, a]));
    return {
      atoms: model.atoms.map((a) => {
        const d = at.get(a.id);
        return d ? { ...a, x: d.x, y: d.y } : a;
      }),
      bonds: model.bonds,
    };
  }, [atoms, model]);
  const boxes = useMemo(() => {
    const set = labelSetOf(opts);
    const out = new Map<number, LabelBox>();
    for (const t of layout.texts) {
      const id = t.atom != null ? atoms[t.atom]?.id : undefined;
      if (id == null) continue;
      const size = opts.units === "px" ? t.fontPx / Math.max(zoom, 1e-6) : t.fontPx;
      out.set(id, labelBox(t, size, set));
    }
    return out;
  }, [layout, atoms, opts, zoom]);

  const z = Math.max(zoom, 1e-6);
  const labelFont = opts.units === "px" ? opts.fontPx / z : opts.fontPx;
  const fontPx = Math.max(MARK_MIN_PX, labelFont * MARK_SCALE * z);
  // (R, S, E and Z as the drawing's style writes them)
  const parentheses = !!opts.stereoParentheses;
  const gap = opts.stereoGap ?? HALF_CAPITAL;
  const writing = { family: fontStack(labelSetOf(opts).fontFamily ?? "Arial"), color: opts.labelColor ?? "#000000" };

  // R, S, E and Z, each placed clear of the bonds, the labels and the
  // marks placed before it
  const stereo = useMemo(() => {
    if (!marks) return [];
    const L = NOMINAL_BOND_LENGTH;
    const at = new Map(drawn.atoms.map((a) => [a.id, a]));
    const segments = drawn.bonds.flatMap((b) => {
      const p = at.get(b.a);
      const q = at.get(b.b);
      return p && q ? [[p, q] as [typeof p, typeof q]] : [];
    });
    const rects: Rect[] = [];
    for (const [id, box] of boxes) {
      const a = at.get(id);
      if (!a) continue;
      rects.push({
        minX: a.x - box.left,
        maxX: a.x + box.right,
        minY: a.y - box.bottom,
        maxY: a.y + box.top,
      });
    }
    const half = (cip: string) => ({
      x: (fontPx * stereoTextEms(cip, parentheses)) / 2 / z,
      y: (fontPx * MARK_HALF_HEIGHT) / z,
    });
    const out: { key: string; x: number; y: number; text: string }[] = [];
    // (a mark placed keeps the next a little way off, not just clear of
    // it: two side by side read as one, and as either atom's)
    const apart = (MARKS_APART * fontPx) / z;
    const put = (key: string, text: string, r: Rect) => {
      rects.push({ minX: r.minX - apart, maxX: r.maxX + apart, minY: r.minY - apart, maxY: r.maxY + apart });
      out.push({ key, text, x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 });
    };
    for (const [id, cip] of marks.centres) {
      const a = at.get(id);
      if (!a) continue;
      const box = boxes.get(id);
      // (opposite a wedge where it has one, as IUPAC's recommendations for
      // structure diagrams place it - GR-11.1 - as far off its atom as the
      // style says, or as far beyond its label)
      const r = placeMark({
        from: a,
        dirs: stereoWaysOut(drawn, id),
        start: (dir) => (box ? exitDistance(box, dir) : 0) + gap * labelFont,
        half: half(cip),
        step: 0.15 * L,
        segments,
        rects,
      });
      put(`centre-${id}`, cip, r);
    }
    for (const [id, cip] of marks.doubleBonds) {
      const side = bondSide(drawn, id);
      if (!side) continue;
      const r = placeMark({
        from: side.at,
        dirs: [side.out, side.back],
        // clear of the second line, which is not among the segments
        start: () => 0.3 * L,
        half: half(cip),
        step: 0.15 * L,
        segments,
        rects,
      });
      put(`bond-${id}`, cip, r);
    }
    return out;
  }, [marks, drawn, boxes, fontPx, z, parentheses, labelFont, gap]);

  // Each mark where it goes: a valence problem's box round its atom's label
  // (or a ring round its atom), and the stereodescriptors.
  const at = new Map(drawn.atoms.map((a) => [a.id, a]));
  const boxesOf: { key: string; id: number; x: number; y: number; w: number; h: number; round: boolean; message: string }[] = [];
  for (const [id, problem] of marks ? [...marks.valence] : []) {
    const a = at.get(id);
    if (!a) continue;
    const box = boxes.get(id);
    const pad = 0.12 * labelFont;
    const r = box
      ? { left: box.left + pad, right: box.right + pad, top: box.top + pad, bottom: box.bottom + pad }
      : { left: 0.3 * labelFont, right: 0.3 * labelFont, top: 0.3 * labelFont, bottom: 0.3 * labelFont };
    boxesOf.push({
      key: `valence-${id}`,
      id,
      x: a.x + (r.right - r.left) / 2,
      y: a.y + (r.top - r.bottom) / 2,
      w: (r.left + r.right) * z,
      h: (r.top + r.bottom) * z,
      round: !box,
      message: valenceMessage(a.el, problem),
    });
  }
  // (each comes into view and goes out of it, rather than appearing and
  // vanishing as the marks are worked out again after an edit)
  const valenceShown = usePresence(boxesOf, (m) => m.key);
  const stereoShown = usePresence(marks ? stereo : [], (m) => m.key);
  if (!valenceShown.length && !stereoShown.length) return null;

  return (
    <group>
      {valenceShown.map(({ key, item: m, leaving }) => (
        <PageHtml key={key} position={[m.x, m.y, 0]} center zIndexRange={Z_RANGE} style={{ pointerEvents: "none" }}>
          <div
            role="img"
            aria-label={m.message}
            className={"relative border-[1.5px] border-accel-accent bg-accel-accent/10 " + (leaving ? "meno-fade-out" : "meno-fade-in")}
            style={{ width: m.w, height: m.h, borderRadius: m.round ? "50%" : 3 }}
          >
            {hoveredAtom === m.id && !leaving && (
              <div className="meno-fade-in absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-gh-line bg-white px-2 py-1 text-[11px] text-gh-black shadow-sm">
                {m.message}
              </div>
            )}
          </div>
        </PageHtml>
      ))}
      {stereoShown.map(({ key, item: m, leaving }) => (
        <PageHtml key={key} position={[m.x, m.y, 0]} center zIndexRange={Z_RANGE} style={{ pointerEvents: "none" }}>
          <div className={leaving ? "meno-fade-out" : "meno-fade-in"}>
            <StereoMark text={m.text} fontPx={fontPx} parentheses={parentheses} {...writing} />
          </div>
        </PageHtml>
      ))}
    </group>
  );
}

/** A stereodescriptor as the drawing writes it (StereoText), in its typeface and colour. */
function StereoMark({ text, fontPx, parentheses, family, color }: { text: string; fontPx: number; parentheses: boolean; family: string; color: string }) {
  return (
    <span className="whitespace-nowrap select-none" style={{ fontSize: fontPx, lineHeight: 1, fontFamily: family, color }}>
      <StereoText cip={text} parentheses={parentheses} />
    </span>
  );
}
