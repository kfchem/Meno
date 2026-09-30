import { describe, expect, it } from "vitest";
import { dibOf } from "./dib";

describe("dibOf", () => {
  // two pixels across, two down: red, clear / half-clear black, blue
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 255, 255]);
  const dib = dibOf(rgba, 2, 2, 300);
  const v = new DataView(dib.buffer);

  it("is a BITMAPINFOHEADER at 24 bits, bottom row first, at its resolution", () => {
    expect(v.getUint32(0, true)).toBe(40);
    expect([v.getInt32(4, true), v.getInt32(8, true)]).toEqual([2, 2]);
    expect(v.getUint16(14, true)).toBe(24);
    expect(v.getUint32(16, true)).toBe(0);
    // 300 dpi, in pixels to the metre
    expect(v.getInt32(24, true)).toBe(11811);
    // rows of 6 bytes filled out to 8
    expect(dib.length).toBe(40 + 8 * 2);
    expect(v.getUint32(20, true)).toBe(16);
  });

  it("puts each pixel blue-green-red, the image's top row last, over white", () => {
    const px = (row: number, x: number) => Array.from(dib.subarray(40 + row * 8 + 3 * x, 40 + row * 8 + 3 * x + 3));
    // the bottom row of the image comes first: half-clear black, blue
    expect(px(0, 0)).toEqual([127, 127, 127]);
    expect(px(0, 1)).toEqual([255, 0, 0]);
    // then the top row: red, and the clear pixel white
    expect(px(1, 0)).toEqual([0, 0, 255]);
    expect(px(1, 1)).toEqual([255, 255, 255]);
  });
});
