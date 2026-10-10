/**
 * The surface where values on a grid take a value: marching cubes, the
 * tables three.js carries for its own (Paul Bourke's), over a grid whose
 * axes may lean - each corner of each cell where the value is, each edge
 * crossed where it crosses, and each point's normal across the values'
 * slope, so that the surface is shaded smooth. Pure, for a worker
 * (./surfaceWorker) to run off the main thread.
 */
import { edgeTable, triTable } from "three/examples/jsm/objects/MarchingCubes.js";

export type Vec3 = [number, number, number];

/** A grid as the mesher takes it: its values, last axis fastest; its counts, origin and axes, in the units the mesh is wanted in. */
export type MeshGrid = { values: Float32Array; counts: Vec3; origin: Vec3; axes: [Vec3, Vec3, Vec3] };

/** A surface as drawn: three numbers a point, three points a triangle, and each point's normal. */
export type Mesh = { positions: Float32Array; normals: Float32Array };

/** A cell's corners, as the tables number them: offsets along the three axes. */
const CORNER: Vec3[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];
/** Each edge's two corners. */
const EDGE: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/** The inverse of a 3 × 3 matrix's transpose, its columns the axes: what turns a slope along the grid's indices into one in space. */
function dual(axes: [Vec3, Vec3, Vec3]): [Vec3, Vec3, Vec3] {
  const [a, b, c] = axes;
  const cross = (u: Vec3, v: Vec3): Vec3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const bc = cross(b, c);
  const det = a[0] * bc[0] + a[1] * bc[1] + a[2] * bc[2] || 1;
  const ca = cross(c, a);
  const ab = cross(a, b);
  return [bc.map((v) => v / det) as Vec3, ca.map((v) => v / det) as Vec3, ab.map((v) => v / det) as Vec3];
}

/**
 * The surface where `sign` × the grid's values come to `iso`: for a positive
 * `sign`, round where they are above it; for a negative one, round where
 * they are below its negative - an orbital's other phase.
 */
export function isosurface(grid: MeshGrid, iso: number, sign: 1 | -1 = 1): Mesh {
  const { values, counts, origin, axes } = grid;
  const [nx, ny, nz] = counts;
  const at = (i: number, j: number, k: number) => sign * values[(i * ny + j) * nz + k];
  // the slope at a grid point, along each index (one-sided at the edges)
  const slope = (i: number, j: number, k: number): Vec3 => {
    const d = (lo: number, hi: number, f: (t: number) => number, t: number) =>
      (f(Math.min(t + 1, hi)) - f(Math.max(t - 1, lo))) / (Math.min(t + 1, hi) - Math.max(t - 1, lo) || 1);
    return [
      d(0, nx - 1, (t) => at(t, j, k), i),
      d(0, ny - 1, (t) => at(i, t, k), j),
      d(0, nz - 1, (t) => at(i, j, t), k),
    ];
  };
  const [da, db, dc] = dual(axes);
  const positions: number[] = [];
  const normals: number[] = [];
  const v = new Float64Array(8);
  const edgePoint = new Float64Array(12 * 3);
  const edgeNormal = new Float64Array(12 * 3);
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let k = 0; k < nz - 1; k++) {
        let index = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = at(i + CORNER[c][0], j + CORNER[c][1], k + CORNER[c][2]);
          // (a corner inside - at or above the value - as the tables count it: below)
          if (v[c] < iso) index |= 1 << c;
        }
        const edges = edgeTable[index];
        if (!edges) continue;
        for (let e = 0; e < 12; e++) {
          if (!(edges & (1 << e))) continue;
          const [c0, c1] = EDGE[e];
          const t = v[c1] === v[c0] ? 0.5 : (iso - v[c0]) / (v[c1] - v[c0]);
          const p0 = CORNER[c0];
          const p1 = CORNER[c1];
          const fi = i + p0[0] + (p1[0] - p0[0]) * t;
          const fj = j + p0[1] + (p1[1] - p0[1]) * t;
          const fk = k + p0[2] + (p1[2] - p0[2]) * t;
          for (let x = 0; x < 3; x++) edgePoint[3 * e + x] = origin[x] + fi * axes[0][x] + fj * axes[1][x] + fk * axes[2][x];
          const g0 = slope(i + p0[0], j + p0[1], k + p0[2]);
          const g1 = slope(i + p1[0], j + p1[1], k + p1[2]);
          const g = [g0[0] + (g1[0] - g0[0]) * t, g0[1] + (g1[1] - g0[1]) * t, g0[2] + (g1[2] - g0[2]) * t];
          // (outwards: down the slope, away from where the values are higher)
          let nxw = -(g[0] * da[0] + g[1] * db[0] + g[2] * dc[0]);
          let nyw = -(g[0] * da[1] + g[1] * db[1] + g[2] * dc[1]);
          let nzw = -(g[0] * da[2] + g[1] * db[2] + g[2] * dc[2]);
          const len = Math.hypot(nxw, nyw, nzw) || 1;
          nxw /= len;
          nyw /= len;
          nzw /= len;
          edgeNormal[3 * e] = nxw;
          edgeNormal[3 * e + 1] = nyw;
          edgeNormal[3 * e + 2] = nzw;
        }
        const row = index * 16;
        for (let t = 0; triTable[row + t] !== -1; t++) {
          const e = triTable[row + t];
          positions.push(edgePoint[3 * e], edgePoint[3 * e + 1], edgePoint[3 * e + 2]);
          normals.push(edgeNormal[3 * e], edgeNormal[3 * e + 1], edgeNormal[3 * e + 2]);
        }
      }
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals) };
}
