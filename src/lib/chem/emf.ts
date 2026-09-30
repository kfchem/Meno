/**
 * The drawing as an enhanced metafile (EMF), the vector picture Windows
 * draws natively and Office on either system keeps as it is: the same
 * lines, shapes and labels as the SVG export draws (createSVG), at the
 * style's own size, and a comment carrying whatever the caller puts there -
 * Meno's record of the structure, so that the picture can be read back.
 *
 * Each shape and label is written twice: as EMF+ (GDI+) records, which
 * Office draws smoothly, and as plain EMF (GDI) records, which it draws
 * with jagged edges but which every reader of EMF understands. A reader
 * that knows EMF+ draws those and passes over the rest ("EMF+ Dual").
 *
 * Records follow [MS-EMF] and [MS-EMFPLUS]; every record's size is a
 * multiple of four, which PowerPoint's reader is strict about.
 */
import { labelFont } from "./labelFonts";
import { labelSetOf, placeLabel, type Layout, type LayoutOptions, type Poly } from "./layout2d";

/** Logical units to the pixel: coordinates are whole numbers, so they are kept fine. */
const S = 20;
/** The reference device: 96 pixels to the inch. */
const DEVICE = { px: [1920, 1080], mm: [508, 286], um: [508000, 285750] } as const;

const EMR = {
  HEADER: 1,
  POLYGON: 3,
  POLYLINE: 4,
  SETWINDOWEXTEX: 9,
  SETVIEWPORTEXTEX: 11,
  EOF: 14,
  SETMAPMODE: 17,
  SETBKMODE: 18,
  SETPOLYFILLMODE: 19,
  SETTEXTALIGN: 22,
  SETTEXTCOLOR: 24,
  SELECTOBJECT: 37,
  CREATEBRUSHINDIRECT: 39,
  DELETEOBJECT: 40,
  ELLIPSE: 42,
  COMMENT: 70,
  EXTCREATEFONTINDIRECTW: 82,
  EXTTEXTOUTW: 84,
  EXTCREATEPEN: 95,
} as const;
const NULL_BRUSH = 0x80000005;
const NULL_PEN = 0x80000008;

/** EMF+ record types. */
const PLUS = {
  HEADER: 0x4001,
  END_OF_FILE: 0x4002,
  OBJECT: 0x4008,
  FILL_POLYGON: 0x400c,
  DRAW_LINES: 0x400d,
  FILL_ELLIPSE: 0x400e,
  DRAW_ELLIPSE: 0x400f,
  SET_ANTI_ALIAS_MODE: 0x401e,
  SET_TEXT_RENDERING_HINT: 0x401f,
  SET_PAGE_TRANSFORM: 0x4030,
  DRAW_DRIVER_STRING: 0x4036,
} as const;
/** What starts a comment that holds EMF+ records: "EMF+". */
const PLUS_COMMENT = 0x2b464d45;
/** The metafile signature and the GDI+ version the records are written for (1.1). */
const PLUS_VERSION = 0xdbc01002;
const PLUS_OBJECT = { PEN: 2, FONT: 6 } as const;
/** The high bit of a drawing record's flags: its brush is a colour given in place. */
const SOLID = 0x8000;
/** EMF+ has only 64 object slots; the drawing needs a pen per width and a font per size. */
const PLUS_SLOTS = 64;

/** A record: its type, and a body written by `fill` into a view of `size` bytes. */
class Writer {
  records: Uint8Array[] = [];
  handles = 0;
  add(type: number, size: number, fill: (v: DataView, bytes: Uint8Array) => void): void {
    const total = 8 + size + ((4 - (size % 4)) % 4);
    const bytes = new Uint8Array(total);
    const v = new DataView(bytes.buffer);
    v.setUint32(0, type, true);
    v.setUint32(4, total, true);
    fill(new DataView(bytes.buffer, 8), bytes.subarray(8));
    this.records.push(bytes);
  }
  handle(): number {
    return ++this.handles;
  }
  /** An EMF+ record, in a comment of its own. */
  plus(type: number, flags: number, size: number, fill: (v: DataView) => void): void {
    const padded = size + ((4 - (size % 4)) % 4);
    this.add(EMR.COMMENT, 4 + 4 + 12 + padded, (v) => {
      v.setUint32(0, 4 + 12 + padded, true);
      v.setUint32(4, PLUS_COMMENT, true);
      v.setUint16(8, type, true);
      v.setUint16(10, flags, true);
      v.setUint32(12, 12 + padded, true);
      v.setUint32(16, padded, true); // (aligned, as GDI+ writes it)
      fill(new DataView(v.buffer, v.byteOffset + 20, padded));
    });
  }
}

/** A COLORREF (0x00BBGGRR) as EMF+'s opaque ARGB (0xAARRGGBB). */
const argb = (c: number) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/** A CSS colour as a COLORREF (0x00BBGGRR); black if it is not one this reads. */
export function colorRef(css: string | undefined): number {
  const c = (css ?? "black").trim().toLowerCase();
  const named: Record<string, string> = { black: "#000000", white: "#ffffff" };
  const hex = named[c] ?? c;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(hex);
  const six = short ? short[1] + short[1] + short[2] + short[2] + short[3] + short[3] : /^#([0-9a-f]{6})$/.exec(hex)?.[1];
  if (six) {
    const n = parseInt(six, 16);
    return ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff);
  }
  const rgb = /^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
  return rgb ? (Number(rgb[3]) << 16) | (Number(rgb[2]) << 8) | Number(rgb[1]) : 0;
}

/**
 * The drawing `layout` as an EMF, `comment` carried in it (the first record
 * after EMF+'s header), and its size in points.
 */
export function layoutEmf(
  layout: Layout,
  opts: LayoutOptions,
  comment?: Uint8Array,
): { emf: Uint8Array; widthPt: number; heightPt: number } {
  const zoom = layout.zoom > 0 ? layout.zoom : 1;
  const pad = opts.paddingPx / zoom;
  const min = { x: layout.bounds.min.x - pad, y: layout.bounds.min.y - pad };
  const max = { x: layout.bounds.max.x + pad, y: layout.bounds.max.y + pad };
  const widthPx = (max.x - min.x) * zoom;
  const heightPx = (max.y - min.y) * zoom;
  // world to logical units: y down, from the top left
  const X = (x: number) => Math.round((x - min.x) * zoom * S);
  const Y = (y: number) => Math.round((max.y - y) * zoom * S);
  const L = (world: number) => Math.round(world * zoom * S);
  const stroke = colorRef(opts.bondColor);
  const ink = colorRef(opts.labelColor);

  const w = new Writer();
  // EMF+'s header comes first of all, as it must, saying that the records
  // after it draw the picture twice over
  w.plus(PLUS.HEADER, 0x0001, 16, (v) => {
    v.setUint32(0, PLUS_VERSION, true);
    v.setUint32(4, 1, true); // made for a display, not a printer
    v.setUint32(8, 96, true);
    v.setUint32(12, 96, true);
  });
  if (comment) {
    w.add(EMR.COMMENT, 4 + comment.length, (v, b) => {
      v.setUint32(0, comment.length, true);
      b.set(comment, 4);
    });
  }
  // EMF+: in the reference device's pixels, lines and letters drawn smooth
  w.plus(PLUS.SET_PAGE_TRANSFORM, 2, 4, (v) => v.setFloat32(0, 1, true)); // UnitTypePixel
  w.plus(PLUS.SET_ANTI_ALIAS_MODE, (4 << 1) | 1, 0, () => {}); // SmoothingModeAntiAlias, on
  w.plus(PLUS.SET_TEXT_RENDERING_HINT, 4, 0, () => {}); // TextRenderingHintAntiAlias
  w.add(EMR.SETMAPMODE, 4, (v) => v.setUint32(0, 8, true)); // MM_ANISOTROPIC
  w.add(EMR.SETWINDOWEXTEX, 8, (v) => {
    v.setInt32(0, 1000 * S, true);
    v.setInt32(4, 1000 * S, true);
  });
  w.add(EMR.SETVIEWPORTEXTEX, 8, (v) => {
    v.setInt32(0, 1000, true);
    v.setInt32(4, 1000, true);
  });
  w.add(EMR.SETBKMODE, 4, (v) => v.setUint32(0, 1, true)); // TRANSPARENT
  w.add(EMR.SETPOLYFILLMODE, 4, (v) => v.setUint32(0, 2, true)); // WINDING

  const select = (h: number) => w.add(EMR.SELECTOBJECT, 4, (v) => v.setUint32(0, h, true));
  const remove = (h: number) => w.add(EMR.DELETEOBJECT, 4, (v) => v.setUint32(0, h, true));
  const brush = (color: number) => {
    const h = w.handle();
    w.add(EMR.CREATEBRUSHINDIRECT, 16, (v) => {
      v.setUint32(0, h, true);
      v.setUint32(4, 0, true); // BS_SOLID
      v.setUint32(8, color, true);
      v.setUint32(12, 0, true);
    });
    return h;
  };
  const pen = (widthLogical: number, color: number) => {
    const h = w.handle();
    w.add(EMR.EXTCREATEPEN, 20 + 24, (v) => {
      v.setUint32(0, h, true);
      // no pattern bitmap: offBmi, cbBmi, offBits, cbBits all 0
      // PS_GEOMETRIC | PS_SOLID | PS_ENDCAP_FLAT | PS_JOIN_MITER, as the SVG's butt caps and miter joins
      v.setUint32(20, 0x00010000 | 0x00000200 | 0x00002000, true);
      v.setUint32(24, Math.max(1, widthLogical), true);
      v.setUint32(28, 0, true); // BS_SOLID
      v.setUint32(32, color, true);
      v.setUint32(36, 0, true);
      v.setUint32(40, 0, true); // no style entries
    });
    return h;
  };
  const points = (pts: { x: number; y: number }[]) => pts.map((p) => [X(p.x), Y(p.y)] as const);
  const bounds = (pts: readonly (readonly [number, number])[], v: DataView) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    v.setInt32(0, Math.min(...xs), true);
    v.setInt32(4, Math.min(...ys), true);
    v.setInt32(8, Math.max(...xs), true);
    v.setInt32(12, Math.max(...ys), true);
  };
  const poly = (type: number, pts: readonly (readonly [number, number])[]) =>
    w.add(type, 20 + 8 * pts.length, (v) => {
      bounds(pts, v);
      v.setUint32(16, pts.length, true);
      pts.forEach(([x, y], i) => {
        v.setInt32(20 + 8 * i, x, true);
        v.setInt32(24 + 8 * i, y, true);
      });
    });
  /** A circle's box: left, top, right, bottom. */
  const box = (c: { x: number; y: number }, r: number) =>
    [X(c.x - r), Y(c.y + r), X(c.x + r), Y(c.y - r)] as const;
  const ellipse = (c: { x: number; y: number }, r: number) =>
    w.add(EMR.ELLIPSE, 16, (v) => box(c, r).forEach((n, i) => v.setInt32(4 * i, n, true)));

  // EMF+ draws from the same whole logical units, in pixels, so that the
  // two drawings agree to the last
  const px = (logical: number) => logical / S;
  const plusPoints = (v: DataView, at: number, pts: readonly (readonly [number, number])[]) =>
    pts.forEach(([x, y], i) => {
      v.setFloat32(at + 8 * i, px(x), true);
      v.setFloat32(at + 8 * i + 4, px(y), true);
    });
  const plusBox = (v: DataView, at: number, c: { x: number; y: number }, r: number) => {
    const [l, t, rt, b] = box(c, r);
    [l, t, rt - l, b - t].forEach((n, i) => v.setFloat32(at + 4 * i, px(n), true));
  };
  // its pens and fonts, each in a slot of its own while there are slots
  // enough (there always are); past that, the last slot is defined afresh
  const objects = new Map<string, number>();
  const object = (key: string, type: number, size: number, fill: (v: DataView) => void) => {
    let id = objects.get(key);
    if (id != null) return id;
    id = Math.min(objects.size, PLUS_SLOTS - 1);
    for (const [k, i] of objects) if (i === id) objects.delete(k);
    w.plus(PLUS.OBJECT, (type << 8) | id, size, fill);
    objects.set(key, id);
    return id;
  };
  const plusPen = (widthLogical: number) =>
    object(`pen ${widthLogical}`, PLUS_OBJECT.PEN, 32, (v) => {
      v.setUint32(0, PLUS_VERSION, true);
      v.setUint32(4, 0, true);
      v.setUint32(8, 0, true); // nothing optional: flat ends and mitred joins, as the GDI pen has
      v.setUint32(12, 0, true); // its width in the drawing's own units
      v.setFloat32(16, px(Math.max(1, widthLogical)), true);
      // its brush, a solid colour
      v.setUint32(20, PLUS_VERSION, true);
      v.setUint32(24, 0, true);
      v.setUint32(28, argb(stroke), true);
    });

  // filled: join caps, then wedges and the like
  const fills = (layout.fills ?? []).length + layout.polys.length;
  if (fills) {
    const b = brush(stroke);
    select(NULL_PEN);
    select(b);
    for (const c of layout.fills ?? []) {
      w.plus(PLUS.FILL_ELLIPSE, SOLID, 20, (v) => {
        v.setUint32(0, argb(stroke), true);
        plusBox(v, 4, c.c, c.r);
      });
      ellipse(c.c, c.r);
    }
    for (const p of layout.polys as Poly[]) {
      if (p.points.length < 3) continue;
      const pts = points(p.points);
      w.plus(PLUS.FILL_POLYGON, SOLID, 8 + 8 * pts.length, (v) => {
        v.setUint32(0, argb(stroke), true);
        v.setUint32(4, pts.length, true);
        plusPoints(v, 8, pts);
      });
      poly(EMR.POLYGON, pts);
    }
    select(NULL_BRUSH);
    remove(b);
  }
  // stroked: aromatic circles, then lines, a pen for each width (selected
  // for GDI; EMF+ names its own in each record)
  const pens = new Map<number, number>();
  const penFor = (widthPx: number) => {
    const width = Math.round(widthPx * S);
    let h = pens.get(width);
    if (h == null) {
      h = pen(width, stroke);
      pens.set(width, h);
    }
    select(h);
    return plusPen(width);
  };
  if ((layout.circles ?? []).length) {
    const id = penFor(opts.lineWidthPx);
    select(NULL_BRUSH);
    for (const c of layout.circles) {
      w.plus(PLUS.DRAW_ELLIPSE, id, 16, (v) => plusBox(v, 0, c.c, c.r));
      ellipse(c.c, c.r);
    }
  }
  for (const l of layout.lines) {
    const id = penFor(l.widthPx > 0 ? l.widthPx : 1);
    const pts = points([{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }]);
    w.plus(PLUS.DRAW_LINES, id, 4 + 8 * pts.length, (v) => {
      v.setUint32(0, pts.length, true);
      plusPoints(v, 4, pts);
    });
    poly(EMR.POLYLINE, pts);
  }
  if (pens.size) {
    select(NULL_PEN);
    for (const h of pens.values()) remove(h);
  }

  // labels: each run at its pen position on its baseline, at the typeface's own advances
  if (layout.texts.length) {
    const set = labelSetOf(opts);
    const family = set.fontFamily ?? "Arial";
    const face = family.slice(0, 31);
    const font = labelFont(family);
    const fontSize = opts.units === "world" ? opts.fontPx : opts.fontPx / zoom;
    w.add(EMR.SETTEXTALIGN, 4, (v) => v.setUint32(0, 24, true)); // TA_BASELINE | TA_LEFT
    w.add(EMR.SETTEXTCOLOR, 4, (v) => v.setUint32(0, ink, true));
    const fonts = new Map<number, number>();
    for (const t of layout.texts) {
      for (const run of placeLabel(t, fontSize, set)) {
        if (run.mark || !run.text) continue; // (a mark is drawn with the lines and shapes)
        const height = L(run.size);
        let h = fonts.get(height);
        if (h == null) {
          h = w.handle();
          const handle = h;
          w.add(EMR.EXTCREATEFONTINDIRECTW, 4 + 92, (v) => {
            v.setUint32(0, handle, true);
            v.setInt32(4, -height, true); // the em, not the cell
            v.setInt32(20, 400, true); // FW_NORMAL
            v.setUint8(27, 1); // DEFAULT_CHARSET
            v.setUint8(28, 4); // OUT_TT_PRECIS
            v.setUint8(30, 4); // ANTIALIASED_QUALITY
            [...face].forEach((ch, i) => v.setUint16(32 + 2 * i, ch.charCodeAt(0), true));
          });
          fonts.set(height, h);
        }
        select(h);
        const units = [...run.text].flatMap((ch) => {
          const advance = L(font.advance(ch) * run.size);
          const code = ch.codePointAt(0)!;
          return code > 0xffff
            ? [
                { unit: 0xd800 + ((code - 0x10000) >> 10), dx: advance },
                { unit: 0xdc00 + ((code - 0x10000) & 0x3ff), dx: 0 },
              ]
            : [{ unit: code, dx: advance }];
        });

        // EMF+: each letter where GDI's advances put it. A letter beyond the
        // BMP cannot be looked up this way, so is left to the GDI record.
        let at = X(run.x);
        const glyphs = units.flatMap((u) => {
          const x = at;
          at += u.dx;
          return u.unit >= 0xd800 && u.unit < 0xe000 ? [] : [{ unit: u.unit, x }];
        });
        if (glyphs.length) {
          const id = object(`font ${height}`, PLUS_OBJECT.FONT, 24 + 2 * face.length, (v) => {
            v.setUint32(0, PLUS_VERSION, true);
            v.setFloat32(4, px(height), true); // the em
            v.setUint32(8, 0, true); // in the drawing's own units
            v.setUint32(12, 0, true); // regular
            v.setUint32(16, 0, true);
            v.setUint32(20, face.length, true);
            for (let i = 0; i < face.length; i++) v.setUint16(24 + 2 * i, face.charCodeAt(i), true);
          });
          const n = glyphs.length;
          w.plus(PLUS.DRAW_DRIVER_STRING, SOLID | id, 16 + 2 * n + 8 * n, (v) => {
            v.setUint32(0, argb(ink), true);
            v.setUint32(4, 1, true); // DriverStringOptionsCmapLookup: characters, not glyph numbers
            v.setUint32(8, 0, true); // no transform
            v.setUint32(12, n, true);
            glyphs.forEach((g, i) => {
              v.setUint16(16 + 2 * i, g.unit, true);
              v.setFloat32(16 + 2 * n + 8 * i, px(g.x), true);
              v.setFloat32(16 + 2 * n + 8 * i + 4, px(Y(run.y)), true);
            });
          });
        }

        const strBytes = units.length * 2 + ((4 - ((units.length * 2) % 4)) % 4);
        const offString = 8 + 68; // from the record's start: the fixed part
        w.add(EMR.EXTTEXTOUTW, 68 + strBytes + 4 * units.length, (v) => {
          // bounds unknown: 0,0,-1,-1
          v.setInt32(8, -1, true);
          v.setInt32(12, -1, true);
          v.setUint32(16, 1, true); // GM_COMPATIBLE
          const scale = 2540 / 96 / S; // .01 mm to the logical unit
          v.setFloat32(20, scale, true);
          v.setFloat32(24, scale, true);
          v.setInt32(28, X(run.x), true);
          v.setInt32(32, Y(run.y), true);
          v.setUint32(36, units.length, true);
          v.setUint32(40, offString, true);
          v.setUint32(44, 0, true); // no options
          // no clipping rectangle (48..63)
          v.setUint32(64, offString + strBytes, true);
          units.forEach((u, i) => v.setUint16(68 + 2 * i, u.unit, true));
          units.forEach((u, i) => v.setUint32(68 + strBytes + 4 * i, u.dx, true));
        });
      }
    }
    if (fonts.size) {
      w.add(EMR.SELECTOBJECT, 4, (v) => v.setUint32(0, 0x8000000d, true)); // SYSTEM_FONT
      for (const h of fonts.values()) remove(h);
    }
  }
  w.plus(PLUS.END_OF_FILE, 0, 0, () => {});
  w.add(EMR.EOF, 12, (v) => {
    v.setUint32(0, 0, true);
    v.setUint32(4, 16, true);
    v.setUint32(8, 20, true);
  });

  // the header, now that the rest is known
  const description = [..."Meno\0structure\0\0"].map((c) => c.charCodeAt(0));
  const descBytes = description.length * 2 + ((4 - ((description.length * 2) % 4)) % 4);
  const headerSize = 108;
  const header = new Uint8Array(headerSize + descBytes);
  const h = new DataView(header.buffer);
  const body = w.records;
  const total = header.length + body.reduce((n, r) => n + r.length, 0);
  h.setUint32(0, EMR.HEADER, true);
  h.setUint32(4, header.length, true);
  h.setInt32(8, 0, true);
  h.setInt32(12, 0, true);
  h.setInt32(16, Math.max(0, Math.ceil(widthPx) - 1), true);
  h.setInt32(20, Math.max(0, Math.ceil(heightPx) - 1), true);
  h.setInt32(24, 0, true);
  h.setInt32(28, 0, true);
  h.setInt32(32, Math.round((widthPx * 2540) / 96), true);
  h.setInt32(36, Math.round((heightPx * 2540) / 96), true);
  h.setUint32(40, 0x464d4520, true); // " EMF"
  h.setUint32(44, 0x10000, true);
  h.setUint32(48, total, true);
  h.setUint32(52, body.length + 1, true);
  h.setUint16(56, w.handles + 1, true);
  h.setUint32(60, description.length, true);
  h.setUint32(64, headerSize, true);
  h.setUint32(68, 0, true);
  h.setInt32(72, DEVICE.px[0], true);
  h.setInt32(76, DEVICE.px[1], true);
  h.setInt32(80, DEVICE.mm[0], true);
  h.setInt32(84, DEVICE.mm[1], true);
  // no pixel format, not OpenGL (88..99)
  h.setInt32(100, DEVICE.um[0], true);
  h.setInt32(104, DEVICE.um[1], true);
  description.forEach((c, i) => h.setUint16(headerSize + 2 * i, c, true));

  const emf = new Uint8Array(total);
  emf.set(header, 0);
  let at = header.length;
  for (const r of body) {
    emf.set(r, at);
    at += r.length;
  }
  return { emf, widthPt: (widthPx * 72) / 96, heightPt: (heightPx * 72) / 96 };
}

/** The records of an EMF, as type and body; null if it is not one. */
export function emfRecords(emf: Uint8Array): { type: number; body: Uint8Array }[] | null {
  const v = new DataView(emf.buffer, emf.byteOffset, emf.byteLength);
  if (emf.length < 88 || v.getUint32(0, true) !== EMR.HEADER || v.getUint32(40, true) !== 0x464d4520) return null;
  const out: { type: number; body: Uint8Array }[] = [];
  for (let at = 0; at + 8 <= emf.length; ) {
    const type = v.getUint32(at, true);
    const size = v.getUint32(at + 4, true);
    if (size < 8 || size % 4 || at + size > emf.length) return null;
    out.push({ type, body: emf.subarray(at + 8, at + size) });
    at += size;
    if (type === EMR.EOF) break;
  }
  return out;
}

/** Every comment of an EMF, as what it holds. */
function comments(emf: Uint8Array): Uint8Array[] {
  return (emfRecords(emf) ?? [])
    .filter((r) => r.type === EMR.COMMENT && r.body.length >= 4)
    .map((r) => {
      const n = new DataView(r.body.buffer, r.body.byteOffset, r.body.byteLength).getUint32(0, true);
      return r.body.subarray(4, 4 + Math.min(n, r.body.length - 4));
    });
}
const isPlus = (c: Uint8Array) =>
  c.length >= 4 && new DataView(c.buffer, c.byteOffset, 4).getUint32(0, true) === PLUS_COMMENT;

/** What the comments of an EMF carry, its EMF+ drawing aside. */
export function emfComments(emf: Uint8Array): Uint8Array[] {
  return comments(emf).filter((c) => !isPlus(c));
}

/** The EMF+ records of an EMF, in order, as type, flags and data. */
export function emfPlusRecords(emf: Uint8Array): { type: number; flags: number; data: DataView }[] {
  const out: { type: number; flags: number; data: DataView }[] = [];
  for (const c of comments(emf).filter(isPlus)) {
    const v = new DataView(c.buffer, c.byteOffset, c.byteLength);
    for (let at = 4; at + 12 <= c.length; ) {
      const size = v.getUint32(at + 4, true);
      if (size < 12 || at + size > c.length) break;
      out.push({
        type: v.getUint16(at, true),
        flags: v.getUint16(at + 2, true),
        data: new DataView(c.buffer, c.byteOffset + at + 12, v.getUint32(at + 8, true)),
      });
      at += size;
    }
  }
  return out;
}
