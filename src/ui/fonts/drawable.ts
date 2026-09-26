/**
 * Whether the canvas's text renderer can draw from a font file. It reads
 * TrueType and CFF outlines - not CFF2 - and looks up characters only in a
 * Unicode (0, 3 or 4), Windows Unicode (3, 1) or Mac Roman (1, 0) map of
 * format 0, 4 or 12; given anything else it logs an error and never draws.
 * The system's fonts come through the app with their maps made plain (see
 * src-tauri/src/fonts.rs), so this mostly guards against the unforeseen.
 */
export function drawableByTextRenderer(bytes: ArrayBuffer): boolean {
  const view = new DataView(bytes);
  if (view.byteLength < 12) return false;
  const tables = new Map<string, number>();
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const at = 12 + 16 * i;
    if (at + 16 > view.byteLength) return false;
    const tag = String.fromCharCode(
      view.getUint8(at),
      view.getUint8(at + 1),
      view.getUint8(at + 2),
      view.getUint8(at + 3),
    );
    tables.set(tag, view.getUint32(at + 8));
  }
  if (!tables.has("glyf") && !tables.has("CFF ")) return false;
  const cmap = tables.get("cmap");
  if (cmap === undefined || cmap + 4 > view.byteLength) return false;
  const known = new Set(["0/4", "3/1", "1/0", "0/3"]);
  const subtables = view.getUint16(cmap + 2);
  for (let i = 0; i < subtables; i++) {
    const at = cmap + 4 + 8 * i;
    if (at + 8 > view.byteLength) return false;
    const listing = `${view.getUint16(at)}/${view.getUint16(at + 2)}`;
    const table = cmap + view.getUint32(at + 4);
    if (!known.has(listing) || table + 2 > view.byteLength) continue;
    if ([0, 4, 12].includes(view.getUint16(table))) return true;
  }
  return false;
}
