/**
 * How far apart two geometries of the same atoms, in the same order, are
 * once laid over each other as well as they go: the root-mean-square
 * deviation after the best fit, by the quaternion method (B. K. P. Horn,
 * J. Opt. Soc. Am. A 4, 629 (1987); E. A. Coutsias, C. Seok and K. A. Dill,
 * J. Comput. Chem. 25, 1849 (2004)) - the largest eigenvalue of a 4 x 4
 * matrix built from the two, found by Jacobi's method. Atoms are taken in
 * their own order: symmetric atoms swapped are not seen as the same.
 */

/** The RMSD between two geometries, x, y and z by atom in turn, of as many atoms, after the best fit; in their units. */
export function rmsd(p: readonly number[], q: readonly number[]): number {
  const n = Math.min(p.length, q.length) / 3;
  if (n < 1) return 0;
  const cp = centre(p, n);
  const cq = centre(q, n);
  // the correlation of the two, about their centres; and how far each spreads
  const s = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let spread = 0;
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      const x = p[3 * i + a] - cp[a];
      spread += x * x;
      const y = q[3 * i + a] - cq[a];
      spread += y * y;
      for (let b = 0; b < 3; b++) s[3 * a + b] += x * (q[3 * i + b] - cq[b]);
    }
  }
  const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = s;
  const m = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const most = Math.max(...eigenvalues(m));
  return Math.sqrt(Math.max(0, (spread - 2 * most) / n));
}

function centre(xyz: readonly number[], n: number): [number, number, number] {
  const c: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) c[a] += xyz[3 * i + a] / n;
  return c;
}

/** A symmetric matrix's eigenvalues, by Jacobi's rotations: each off-diagonal element turned to nought in turn until none is left. */
export function eigenvalues(given: readonly (readonly number[])[]): number[] {
  const a = given.map((r) => r.slice());
  const n = a.length;
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const kp = a[k][p];
          const kq = a[k][q];
          a[k][p] = c * kp - s * kq;
          a[k][q] = s * kp + c * kq;
        }
        for (let k = 0; k < n; k++) {
          const pk = a[p][k];
          const qk = a[q][k];
          a[p][k] = c * pk - s * qk;
          a[q][k] = s * pk + c * qk;
        }
      }
    }
  }
  return a.map((r, i) => r[i]);
}
