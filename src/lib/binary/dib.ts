/**
 * A device-independent bitmap (DIB): what Windows' programs that take only a
 * bitmap - Paint, and many more - paste from the clipboard (CF_DIB). A
 * BITMAPINFOHEADER and the rows after it, bottom row first, three bytes to a
 * pixel in blue-green-red order, each row filled out to a whole number of
 * words.
 *
 * Transparency is laid over white: a program that reads a fourth byte as
 * nothing would otherwise show the empty parts of the drawing black.
 */

const HEADER = 40;

/**
 * The DIB of an image's pixels - RGBA, top row first, as a canvas hands
 * them out - at `dpi`.
 */
export function dibOf(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, dpi: number): Uint8Array {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const out = new Uint8Array(HEADER + stride * height);
  const v = new DataView(out.buffer);
  const perMetre = Math.round(dpi / 0.0254);
  v.setUint32(0, HEADER, true);
  v.setInt32(4, width, true);
  v.setInt32(8, height, true); // (positive: bottom row first)
  v.setUint16(12, 1, true); // planes
  v.setUint16(14, 24, true); // bits to a pixel
  v.setUint32(16, 0, true); // BI_RGB
  v.setUint32(20, stride * height, true);
  v.setInt32(24, perMetre, true);
  v.setInt32(28, perMetre, true);
  for (let y = 0; y < height; y++) {
    const row = HEADER + (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3] / 255;
      const over = (c: number) => Math.round(c * a + 255 * (1 - a));
      out[row + 3 * x] = over(rgba[i + 2]);
      out[row + 3 * x + 1] = over(rgba[i + 1]);
      out[row + 3 * x + 2] = over(rgba[i]);
    }
  }
  return out;
}
