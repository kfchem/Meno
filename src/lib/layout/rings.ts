/**
 * The rings of a molecule's graph: the smallest set of smallest rings, as
 * many as the graph has independent cycles, each as small as it can be.
 *
 * Candidates are Horton's - for every atom and every bond, the shortest path
 * from the atom to each end of the bond, closed by the bond - taken shortest
 * first, and kept when they are independent of those already kept (over
 * GF(2), a ring being the set of its bonds). Every cage and bridged system
 * gets its faces this way, which the shortest cycle through each bond alone
 * does not always give.
 */

export type Edge = readonly [number, number];

/** Rings as atom indices in order round the ring. */
export function smallestRings(atomCount: number, edges: readonly Edge[]): number[][] {
  const n = atomCount;
  const adj: { to: number; edge: number }[][] = Array.from({ length: n }, () => []);
  edges.forEach(([a, b], e) => {
    adj[a].push({ to: b, edge: e });
    adj[b].push({ to: a, edge: e });
  });

  // how many independent cycles: bonds - atoms + pieces
  const seen = new Array<boolean>(n).fill(false);
  let pieces = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    pieces++;
    const todo = [s];
    seen[s] = true;
    while (todo.length) {
      for (const { to } of adj[todo.pop()!]) {
        if (!seen[to]) {
          seen[to] = true;
          todo.push(to);
        }
      }
    }
  }
  const want = edges.length - n + pieces;
  if (want <= 0) return [];

  // shortest paths from every atom (breadth first), as parents
  const parent: Int32Array[] = [];
  const dist: Int32Array[] = [];
  for (let s = 0; s < n; s++) {
    const p = new Int32Array(n).fill(-1);
    const d = new Int32Array(n).fill(-1);
    d[s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const { to } of adj[u]) {
        if (d[to] < 0) {
          d[to] = d[u] + 1;
          p[to] = u;
          q.push(to);
        }
      }
    }
    parent.push(p);
    dist.push(d);
  }
  const path = (s: number, t: number): number[] => {
    const out = [t];
    let u = t;
    while (u !== s) {
      u = parent[s][u];
      out.push(u);
    }
    return out.reverse(); // s ... t
  };

  // Horton's candidates: atom v, bond (x, y), paths v..x and v..y meeting only at v
  const candidates = new Map<string, number[]>();
  for (let v = 0; v < n; v++) {
    edges.forEach(([x, y]) => {
      if (dist[v][x] < 0 || dist[v][y] < 0) return;
      if (Math.abs(dist[v][x] - dist[v][y]) > 1) return;
      const px = path(v, x);
      const py = path(v, y);
      const inX = new Set(px);
      if (py.some((a, i) => i > 0 && inX.has(a))) return; // they meet again
      const ring = [...px, ...py.slice(1).reverse()]; // v .. x, y .. back
      if (ring.length < 3) return;
      const key = [...ring].sort((a, b) => a - b).join(",");
      if (!candidates.has(key)) candidates.set(key, ring);
    });
  }

  // shortest first, kept while independent of those kept (GF(2) elimination)
  const edgeIndex = new Map<string, number>();
  edges.forEach(([a, b], e) => edgeIndex.set(a < b ? `${a},${b}` : `${b},${a}`, e));
  const words = Math.ceil(edges.length / 32);
  const vectorOf = (ring: number[]) => {
    const v = new Uint32Array(words);
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const e = edgeIndex.get(a < b ? `${a},${b}` : `${b},${a}`)!;
      v[e >>> 5] ^= 1 << (e & 31);
    });
    return v;
  };
  const basis: { pivot: number; v: Uint32Array }[] = [];
  const kept: number[][] = [];
  const sorted = [...candidates.values()].sort((a, b) => a.length - b.length);
  for (const ring of sorted) {
    const v = vectorOf(ring);
    for (const { pivot, v: b } of basis) {
      if (v[pivot >>> 5] & (1 << (pivot & 31))) {
        for (let w = 0; w < words; w++) v[w] ^= b[w];
      }
    }
    let pivot = -1;
    for (let w = 0; w < words && pivot < 0; w++) {
      if (v[w]) pivot = w * 32 + (31 - Math.clz32(v[w] & -v[w]));
    }
    if (pivot < 0) continue; // a sum of rings already kept
    basis.push({ pivot, v });
    kept.push(ring);
    if (kept.length === want) break;
  }
  return kept;
}
