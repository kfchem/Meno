/**
 * Pictures held this session (docs/PDF.md, *A picture*): each image's bytes,
 * by their SHA-256 - what a picture on the page is drawn from, what its
 * workspace's file keeps (`files/<sha256>`), and what a copy and a paste
 * carry it by. A workspace's file opened holds the pictures it keeps, each
 * read from it only when first wanted.
 */
import type { MenoFile } from "../doc/menoFile";
import { imageInfo, type ImageInfo } from "./image";

/** A picture held: what it is known by, and what it is. */
export type HeldPicture = ImageInfo & { sha256: string };

const held = new Map<string, { bytes?: Uint8Array; read?: () => Uint8Array | null }>();

/** Bytes' SHA-256, in hex. */
export async function sha256OfBytes(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** An image's bytes held for the session: what it is, and what it is known by; none, where they are no PNG or JPEG. */
export async function holdPicture(bytes: Uint8Array): Promise<HeldPicture | null> {
  const info = imageInfo(bytes);
  if (!info) return null;
  const sha256 = await sha256OfBytes(bytes);
  if (!held.get(sha256)?.bytes) held.set(sha256, { bytes });
  return { ...info, sha256 };
}

/** A picture's bytes, held this session; read from its workspace's file the first time; none where it is held nowhere. */
export function pictureBytes(sha256: string): Uint8Array | null {
  const h = held.get(sha256);
  if (!h) return null;
  if (!h.bytes) {
    const bytes = h.read?.() ?? null;
    if (!bytes) return null;
    h.bytes = bytes;
    h.read = undefined;
  }
  return h.bytes;
}

/** Each picture a workspace's file keeps, held - its bytes read from the file when first wanted. */
export function holdPicturesOf(file: Pick<MenoFile, "files" | "data">): void {
  for (const f of file.files) {
    if ((f.media !== "image/png" && f.media !== "image/jpeg") || held.has(f.sha256)) continue;
    held.set(f.sha256, { read: () => file.data(f.sha256) });
  }
}
