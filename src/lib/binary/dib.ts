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
 * A DIB's pixels - RGBA, top row first, as a canvas takes them - and its
 * resolution, where it gives one: what Windows' clipboard holds of a
 * screenshot (CF_DIB, CF_DIBV5). Uncompressed, 24 or 32 bits to a pixel
 * (with BI_BITFIELDS in the usual order); its fourth byte read as how
 * opaque, where a V5 header says so and some of it is, else opaque. None,
 * for any other.
 */
export function rgbaOfDib(dib: Uint8Array): { width: number; height: number; rgba: Uint8ClampedArray; dpi?: number } | null {
  if (dib.length < HEADER) return null;
  const v = new DataView(dib.buffer, dib.byteOffset, dib.byteLength);
  const size = v.getUint32(0, true);
  const width = v.getInt32(4, true);
  const signed = v.getInt32(8, true);
  const bits = v.getUint16(14, true);
  const compression = v.getUint32(16, true);
  const height = Math.abs(signed);
  if (size < HEADER || width <= 0 || height <= 0 || (bits !== 24 && bits !== 32)) return null;
  // BI_RGB, or BI_BITFIELDS - its masks after a 40-byte header - in the order everyone writes
  if (compression !== 0 && compression !== 3) return null;
  const masks = compression === 3 && size === HEADER ? 12 : 0;
  const colours = v.getUint32(32, true);
  const start = size + masks + colours * 4;
  const stride = Math.ceil((width * bits) / 32) * 4;
  if (start + stride * height > dib.length) return null;
  const alphaMask = size >= 56 ? v.getUint32(52, true) : 0;
  const rgba = new Uint8ClampedArray(width * height * 4);
  let seen = false;
  for (let y = 0; y < height; y++) {
    const row = start + (signed > 0 ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      const p = row + x * (bits / 8);
      const i = (y * width + x) * 4;
      rgba[i] = dib[p + 2];
      rgba[i + 1] = dib[p + 1];
      rgba[i + 2] = dib[p];
      rgba[i + 3] = bits === 32 && alphaMask ? dib[p + 3] : 255;
      if (rgba[i + 3]) seen = true;
    }
  }
  // (an alpha that leaves all of it clear is one no program meant)
  if (!seen) for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  const perMetre = v.getInt32(24, true);
  return { width, height, rgba, ...(perMetre > 0 ? { dpi: perMetre * 0.0254 } : {}) };
}

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
