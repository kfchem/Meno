/**
 * Surfaces worked out off the main thread (./isosurface): a grid sent once,
 * kept by its id - the last few - and its surface at a value asked for as
 * often as the value changes.
 */
import { isosurface, type MeshGrid } from "./isosurface";

const KEPT = 4;
const grids = new Map<number, MeshGrid>();

type Question = { id: number; grid: number; data?: MeshGrid; iso: number; signed: boolean };

self.onmessage = (e: MessageEvent<Question>) => {
  const q = e.data;
  if (q.data) {
    grids.set(q.grid, q.data);
    while (grids.size > KEPT) grids.delete(grids.keys().next().value!);
  }
  const grid = grids.get(q.grid);
  if (!grid) {
    self.postMessage({ id: q.id, lost: true });
    return;
  }
  const plus = isosurface(grid, q.iso, 1);
  const minus = q.signed ? isosurface(grid, q.iso, -1) : null;
  const buffers = [plus.positions.buffer, plus.normals.buffer, ...(minus ? [minus.positions.buffer, minus.normals.buffer] : [])];
  (self as unknown as Worker).postMessage({ id: q.id, plus, minus }, buffers as Transferable[]);
};
