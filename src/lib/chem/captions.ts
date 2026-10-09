/**
 * Words on the page - a reaction's reagents and conditions over its arrow,
 * or anything else (docs/EDITOR-2D.md, *Text*): set as the drawing sets a
 * label, a formula's counts low and a prefix's t- in italics, the rest as
 * typed; line under line, each centred - or to the left, to the right, or
 * spread to both edges, as it is set - broken into lines as wide as it is
 * made, where it is given a width; and, put near an arrow, set over it or
 * under it, clear of it, to go where it goes.
 */
import { italicUnits, labelUnits, unitRuns } from "./abbreviations";
import { ACS_LABEL_SET, labelBox, runsWidth, type LabelSet, type TextItem, type TextRun } from "./layout2d";
import type { SchemeArrow } from "./reactionScheme";

/** How far apart a caption's lines are, baseline to baseline, in ems. */
export const CAPTION_LINE = 1.25;

/**
 * A word of a caption as a formula is set (lib/chem/abbreviations
 * `labelRuns`): K2CO3 with its counts low, Pd2(dba)3 likewise, t-BuOK with
 * its t in italics, a sign at its end - NH4+ - a charge. A prefix is only
 * one at the word's start, or after a bracket: the o of co-solvent is no
 * ortho. Words with no letter in them - 60, +, (1:1) - stay as typed.
 */
function wordRuns(word: string): TextRun[] {
  if (!/\p{L}/u.test(word)) return [{ text: word }];
  const charge = /[a-zA-Z0-9)\]][+−-]$/.test(word) ? word.slice(-1) : null;
  const body = charge ? word.slice(0, -1) : word;
  const units = labelUnits(body);
  const italic = italicUnits(units).map((it, k) => it && (k === 0 || /[([,]$/.test(units[k - 1])));
  const runs = unitRuns(units, italic);
  if (charge) runs.push({ text: charge.replace("-", "−"), sup: true });
  return runs;
}

/** A line of a caption as the drawing sets it: each word as a formula is, what is between them as typed. */
export function captionRuns(line: string): TextRun[] {
  const runs: TextRun[] = [];
  const push = (r: TextRun) => {
    const last = runs[runs.length - 1];
    if (last && !!last.sub === !!r.sub && !!last.sup === !!r.sup && !!last.italic === !!r.italic && !last.mark && !r.mark) last.text += r.text;
    else runs.push({ ...r });
  };
  for (const piece of line.split(/([\s,;/]+)/)) {
    if (!piece) continue;
    if (/^[\s,;/]+$/.test(piece)) push({ text: piece });
    else for (const r of wordRuns(piece)) push(r);
  }
  return runs;
}

/** A number, and a unit after one: kept together on a line, as 60 °C, 12 h, 2 equiv, 10 mol% are. */
const NUMBER = /^[−-]?\d+([.,]\d+)?$/;
const UNIT = /^(°\S*|[\p{L}%µ][\p{L}%µ]{0,4}[.,;)]?)$/u;

/** A typed line's words as they are kept on a line: its words, a number with the unit after it as one. */
function unbreakable(para: string): string[] {
  const out: string[] = [];
  for (const word of para.split(/\s+/).filter(Boolean)) {
    const last = out[out.length - 1];
    if (last && NUMBER.test(last.split(" ").slice(-1)[0]) && UNIT.test(word)) out[out.length - 1] = `${last} ${word}`;
    else out.push(word);
  }
  return out;
}

/** How a caption's lines lie in its width: to its left edge, about its middle, to its right edge, or spread to both - each line a typed line ends, to the left. */
export type CaptionAlign = "left" | "center" | "right" | "justify";

/** A caption's lines, as `captionLines` breaks them, each saying whether a typed line ends with it. */
function linesOf(text: string, fontSize: number, set: LabelSet, width?: number): { text: string; ends: boolean }[] {
  const typed = text.split("\n").map((l) => l.trim());
  if (!(width != null && width > 0)) return typed.map((t) => ({ text: t, ends: true }));
  const out: { text: string; ends: boolean }[] = [];
  for (const para of typed) {
    let line = "";
    for (const word of unbreakable(para)) {
      const next = line ? `${line} ${word}` : word;
      if (!line || runsWidth(captionRuns(next), fontSize, set) <= width) line = next;
      else {
        out.push({ text: line, ends: false });
        line = word;
      }
    }
    out.push({ text: line, ends: true });
  }
  return out;
}

/**
 * A caption's lines: as typed - or, given a `width`, each typed line broken
 * at its spaces into lines no wider than it, as many words on each as fit
 * (a word wider than it alone on its line), a number never parted from the
 * unit after it.
 */
export function captionLines(text: string, fontSize: number, set: LabelSet = ACS_LABEL_SET, width?: number): string[] {
  return linesOf(text, fontSize, set, width).map((l) => l.text);
}

/** A caption set: its lines, each a text the drawing draws as it draws a label, and how far its ink reaches either way of its middle. */
export type CaptionSet = { items: TextItem[]; halfW: number; halfH: number };

/**
 * A caption's text set about (x, y), its middle: line under line
 * `CAPTION_LINE` ems apart, at `fontSize` - a label's size - in the
 * typeface `set` measures in, broken into lines as wide as `width` where it
 * is given one; each line lying in that width - or the widest line's - as
 * `align` says. Blank lines keep their room.
 */
export function captionSet(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  set: LabelSet = ACS_LABEL_SET,
  width?: number,
  align: CaptionAlign = "center",
): CaptionSet {
  const lines = linesOf(text, fontSize, set, width);
  const step = fontSize * CAPTION_LINE;
  const top = ((lines.length - 1) / 2) * step;
  const wide = (t: string) => runsWidth(captionRuns(t), fontSize, set);
  // (the width its lines lie in: as wide as it was made, or as its widest line)
  const box = width != null && width > 0 ? width : Math.max(0, ...lines.map((l) => wide(l.text)));
  // (how far it reaches: half a line's height at the least, half its width, and its ink - a subscript's drop, a capital's height)
  let halfW = box / 2;
  let halfH = fontSize / 2 + top;
  const items: TextItem[] = [];
  const put = (t: string, start: number, lineY: number) => {
    const runs = captionRuns(t);
    if (!runs.length) return;
    // (placeLabel centres the first letter on x: the start, and half of it)
    const first = runsWidth([{ text: [...runs[0].text][0] ?? " " }], fontSize, set);
    const item: TextItem = { x: start + first / 2, y: lineY, text: t, fontPx: fontSize, runs, anchorRun: 0 };
    const ink = labelBox(item, fontSize, set);
    halfW = Math.max(halfW, x - (item.x - ink.left), item.x + ink.right - x);
    halfH = Math.max(halfH, item.y + ink.top - y, y - (item.y - ink.bottom));
    items.push(item);
  };
  lines.forEach((line, i) => {
    const lineY = y + top - i * step;
    const w = wide(line.text);
    const words = line.text.split(" ").filter(Boolean);
    // spread to both edges: its words apart by what is left, each set where it falls - but not a typed line's last
    if (align === "justify" && !line.ends && words.length > 1) {
      const widths = words.map(wide);
      const gap = (box - widths.reduce((a, b) => a + b, 0)) / (words.length - 1);
      let at = x - box / 2;
      words.forEach((word, k) => {
        put(word, at, lineY);
        at += widths[k] + gap;
      });
      return;
    }
    const start = align === "left" || align === "justify" ? x - box / 2 : align === "right" ? x + box / 2 - w : x - w / 2;
    put(line.text, start, lineY);
  });
  return { items, halfW, halfH };
}

/** How near an arrow a caption put down is taken to be its: within this many ems of it, across. */
const ARROW_REACH = 2.5;
/** How far a caption over or under an arrow stands clear of it - its ink, of the arrow's line - in ems. */
export const ARROW_CLEAR = 0.5;

/**
 * Where a caption put down at `at` - reaching `half` either way of its
 * middle - goes: near an arrow, within its length and `ARROW_REACH` ems
 * across, over it or under it on that side, centred on its middle and
 * clear of it - beyond any caption already there on that side (`others`,
 * by where each stands and how far it reaches) - and the arrow's; else
 * where it was put.
 */
export function captionPlace(
  at: { x: number; y: number },
  half: { w: number; h: number },
  arrows: readonly (SchemeArrow & { id: number })[],
  fontSize: number,
  others: readonly { x: number; y: number; arrow?: number; halfW: number; halfH: number }[] = [],
): { x: number; y: number; arrow?: number } {
  let best: { a: SchemeArrow & { id: number }; across: number } | null = null;
  for (const a of arrows) {
    const ux = Math.cos(a.angle);
    const uy = Math.sin(a.angle);
    const dx = at.x - a.x;
    const dy = at.y - a.y;
    const along = dx * ux + dy * uy;
    const across = -dx * uy + dy * ux;
    if (Math.abs(along) > a.length / 2 || Math.abs(across) > ARROW_REACH * fontSize + half.h) continue;
    if (!best || Math.abs(across) < Math.abs(best.across)) best = { a, across };
  }
  if (!best) return { x: at.x, y: at.y };
  const { a } = best;
  // (the side of the arrow it was put on: over it, where it was on the line itself)
  const side = best.across < 0 ? -1 : 1;
  const nx = -Math.sin(a.angle) * side;
  const ny = Math.cos(a.angle) * side;
  const reach = (w: number, h: number) => Math.abs(nx) * w + Math.abs(ny) * h;
  let out = ARROW_CLEAR * fontSize + reach(half.w, half.h);
  // (beyond any caption already over it, or under it, on that side)
  for (const o of others) {
    if (o.arrow !== a.id) continue;
    const there = (o.x - a.x) * nx + (o.y - a.y) * ny;
    if (there <= 0) continue;
    out = Math.max(out, there + reach(o.halfW, o.halfH) + 0.25 * fontSize + reach(half.w, half.h));
  }
  return { x: a.x + nx * out, y: a.y + ny * out, arrow: a.id };
}
