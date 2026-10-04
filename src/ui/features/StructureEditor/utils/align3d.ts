import type { Turn3D } from "../store/types";

/**
 * The turn that lays points in 3D best over points on the page: of all
 * rotations, the one taking `from` (x, y and z in turn, about their own
 * centre) nearest to `to` (x and y in turn, about theirs, on the page) - as
 * the quaternion x, y, z, w. Horn's: the eigenvector of the largest
 * eigenvalue of his 4 x 4 matrix, found by Jacobi's sweeps.
 */
export function turnOnto(from: ArrayLike<number>, to: ArrayLike<number>): Turn3D {
  const n = Math.min(from.length / 3, to.length / 2);
  if (n < 2) return [0, 0, 0, 1];
  let fx = 0, fy = 0, fz = 0, tx = 0, ty = 0;
  for (let i = 0; i < n; i++) {
    fx += from[3 * i];
    fy += from[3 * i + 1];
    fz += from[3 * i + 2];
    tx += to[2 * i];
    ty += to[2 * i + 1];
  }
  fx /= n; fy /= n; fz /= n; tx /= n; ty /= n;
  // the cross-covariance, S[a][b] = sum of from_a * to_b (to's z is 0)
  let sxx = 0, sxy = 0, syx = 0, syy = 0, szx = 0, szy = 0;
  for (let i = 0; i < n; i++) {
    const px = from[3 * i] - fx, py = from[3 * i + 1] - fy, pz = from[3 * i + 2] - fz;
    const qx = to[2 * i] - tx, qy = to[2 * i + 1] - ty;
    sxx += px * qx; sxy += px * qy;
    syx += py * qx; syy += py * qy;
    szx += pz * qx; szy += pz * qy;
  }
  const sxz = 0, syz = 0, szz = 0;
  const m = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  const { values, vectors } = jacobi(m);
  let best = 0;
  for (let k = 1; k < 4; k++) if (values[k] > values[best]) best = k;
  const [w, x, y, z] = [0, 1, 2, 3].map((r) => vectors[r][best]);
  const len = Math.hypot(w, x, y, z) || 1;
  // (the same turn either way round: w kept positive, so the same points give the same quaternion)
  const s = w < 0 ? -1 / len : 1 / len;
  return [x * s, y * s, z * s, w * s];
}

/** The eigenvalues and eigenvectors (by column) of a small symmetric matrix, by Jacobi's sweeps. */
function jacobi(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length;
  const a = input.map((row) => [...row]);
  const v: number[][] = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 64; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}
