/**
 * Just enough of the compound file format ([MS-CFB]) to read one: the
 * streams in it, by path. An object Office holds - a structure Meno serves
 * on Windows (src-tauri/src/ole.rs) - is one, and Word and PowerPoint for
 * Mac hand it over as such when it is copied or dragged. Read only; the
 * format's own checks are kept to what reading it safely needs.
 */

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
/** A sector number that ends a chain, or marks a sector not in one. */
const LAST_SECTOR = 0xfffffffa;
const NO_STREAM = 0xffffffff;

/** The streams of a compound file, by path ("/Meno", "/\u0001Ole"); null if `bytes` is not one this reads. */
export function cfbStreams(bytes: Uint8Array): Map<string, Uint8Array> | null {
  try {
    return streamsOf(bytes);
  } catch {
    // (cut short, or its tables point outside it)
    return null;
  }
}

function streamsOf(bytes: Uint8Array): Map<string, Uint8Array> | null {
  if (bytes.length < 512 || !SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorSize = 1 << v.getUint16(30, true);
  const miniSize = 1 << v.getUint16(32, true);
  if (sectorSize !== 512 && sectorSize !== 4096) return null;
  const fatSectors = v.getUint32(44, true);
  const firstDir = v.getUint32(48, true);
  const cutoff = v.getUint32(56, true);
  const firstMiniFat = v.getUint32(60, true);
  let difatNext = v.getUint32(68, true);
  const difatSectors = v.getUint32(72, true);
  const sectorCount = Math.floor((bytes.length - sectorSize) / sectorSize) + 1;
  const sectorAt = (n: number) => sectorSize + n * sectorSize;
  const words = (at: number, count: number) => Array.from({ length: count }, (_, i) => v.getUint32(at + 4 * i, true));

  // the FAT's sectors: 109 in the header, the rest in a chain of DIFAT sectors
  const difat = words(76, 109);
  for (let n = 0; n < difatSectors && difatNext < LAST_SECTOR; n++) {
    if (difatNext >= sectorCount) return null;
    const entries = words(sectorAt(difatNext), sectorSize / 4);
    difat.push(...entries.slice(0, -1));
    difatNext = entries[entries.length - 1];
  }
  const fat: number[] = [];
  for (const s of difat.slice(0, fatSectors)) {
    if (s >= sectorCount) return null;
    fat.push(...words(sectorAt(s), sectorSize / 4));
  }
  /** The sectors of a chain, in order; null if it runs off the file or round in a loop. */
  const chain = (start: number, table: number[], limit: number): number[] | null => {
    const out: number[] = [];
    for (let s = start; s < LAST_SECTOR; s = table[s]) {
      if (s >= limit || s >= table.length || out.length > table.length) return null;
      out.push(s);
    }
    return out;
  };
  const read = (start: number, size?: number): Uint8Array | null => {
    const sectors = chain(start, fat, sectorCount);
    if (!sectors) return null;
    const out = new Uint8Array(sectors.length * sectorSize);
    sectors.forEach((s, i) => out.set(bytes.subarray(sectorAt(s), sectorAt(s) + sectorSize), i * sectorSize));
    return size == null ? out : out.subarray(0, Math.min(size, out.length));
  };

  // the directory: 128-byte entries, a red-black tree of each storage's children
  const dir = read(firstDir);
  if (!dir) return null;
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  type Entry = { name: string; type: number; left: number; right: number; child: number; start: number; size: number };
  const entries: Entry[] = [];
  for (let at = 0; at + 128 <= dir.length; at += 128) {
    const nameBytes = Math.min(64, dv.getUint16(at + 64, true));
    const name = String.fromCharCode(
      ...Array.from({ length: Math.max(0, nameBytes / 2 - 1) }, (_, i) => dv.getUint16(at + 2 * i, true)),
    );
    entries.push({
      name,
      type: dir[at + 66],
      left: dv.getUint32(at + 68, true),
      right: dv.getUint32(at + 72, true),
      child: dv.getUint32(at + 76, true),
      start: dv.getUint32(at + 116, true),
      // (a version 3 file's high half may hold anything)
      size: dv.getUint32(at + 120, true),
    });
  }
  const root = entries[0];
  if (!root || root.type !== 5) return null;

  // small streams live in the mini stream, the root's own, by the mini FAT
  const miniFat: number[] = [];
  const miniFatSectors = firstMiniFat < LAST_SECTOR ? chain(firstMiniFat, fat, sectorCount) : [];
  if (!miniFatSectors) return null;
  for (const s of miniFatSectors) miniFat.push(...words(sectorAt(s), sectorSize / 4));
  const miniStream = root.size ? read(root.start, root.size) : new Uint8Array(0);
  if (!miniStream) return null;
  const readMini = (start: number, size: number): Uint8Array | null => {
    const sectors = chain(start, miniFat, Math.floor(miniStream.length / miniSize));
    if (!sectors) return null;
    const out = new Uint8Array(sectors.length * miniSize);
    sectors.forEach((s, i) => out.set(miniStream.subarray(s * miniSize, (s + 1) * miniSize), i * miniSize));
    return out.subarray(0, Math.min(size, out.length));
  };

  const streams = new Map<string, Uint8Array>();
  const seen = new Set<number>();
  const walk = (i: number, path: string): boolean => {
    if (i === NO_STREAM) return true;
    if (i >= entries.length || seen.has(i)) return false;
    seen.add(i);
    const e = entries[i];
    if (!walk(e.left, path) || !walk(e.right, path)) return false;
    const at = `${path}/${e.name}`;
    if (e.type === 2) {
      const data = e.size < cutoff ? readMini(e.start, e.size) : read(e.start, e.size);
      if (!data) return false;
      streams.set(at, data);
    } else if (e.type === 1 && !walk(e.child, at)) return false;
    return true;
  };
  return walk(root.child, "") ? streams : null;
}
