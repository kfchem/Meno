import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drawableByTextRenderer } from "./drawable";

const file = (path: string) => {
  const b = readFileSync(new URL(path, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/** A font's header and table records, and a character map of one listing. */
function font(tables: string[], platform: number, encoding: number, format: number): ArrayBuffer {
  const cmapAt = 12 + 16 * tables.length;
  const bytes = new Uint8Array(cmapAt + 12 + 2);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, tables.length);
  tables.forEach((tag, i) => {
    for (let k = 0; k < 4; k++) bytes[12 + 16 * i + k] = tag.charCodeAt(k);
    view.setUint32(12 + 16 * i + 8, tag === "cmap" ? cmapAt : 0);
  });
  view.setUint16(cmapAt + 2, 1);
  view.setUint16(cmapAt + 4, platform);
  view.setUint16(cmapAt + 6, encoding);
  view.setUint32(cmapAt + 8, 12);
  view.setUint16(cmapAt + 12, format);
  return bytes.buffer;
}

describe("whether the text renderer can draw from a font", () => {
  it("takes Meno's own fonts", () => {
    expect(drawableByTextRenderer(file("../../assets/fonts/IBMPlexSans-Regular.ttf"))).toBe(true);
    expect(drawableByTextRenderer(file("../../assets/fonts/IBMPlexSansJP-Regular.ttf"))).toBe(true);
  });

  it("takes a map it looks in, of a kind it reads, over outlines it reads", () => {
    expect(drawableByTextRenderer(font(["cmap", "glyf"], 0, 4, 12))).toBe(true);
    expect(drawableByTextRenderer(font(["CFF ", "cmap"], 3, 1, 4))).toBe(true);
    // Windows full-repertoire only: it does not look there
    expect(drawableByTextRenderer(font(["cmap", "glyf"], 3, 10, 12))).toBe(false);
    // a kind of map it does not read
    expect(drawableByTextRenderer(font(["cmap", "glyf"], 0, 3, 6))).toBe(false);
    // CFF2 outlines only
    expect(drawableByTextRenderer(font(["CFF2", "cmap"], 0, 4, 12))).toBe(false);
    expect(drawableByTextRenderer(new ArrayBuffer(4))).toBe(false);
  });
});
