/** The measurement's worker (./cases): a case run off the page, its result sent back - as it is, as JSON text, or (an XYZ file) as numbers in one buffer. */
import { runCase, type CaseId } from "./cases";

type Form = "objects" | "json" | "buffer";

self.onmessage = (e: MessageEvent<{ id: number; case: CaseId; text: string; form: Form }>) => {
  const t0 = performance.now();
  const result = runCase(e.data.case, e.data.text);
  const work = performance.now() - t0;
  if (e.data.form === "json") {
    self.postMessage({ id: e.data.id, json: JSON.stringify(result), work });
  } else if (e.data.form === "buffer" && e.data.case === "xyz") {
    // each frame's coordinates in one buffer, handed over rather than copied; the first frame's atoms and bonds as they are
    const frames = result as { atoms: { el: string; x: number; y: number; z: number }[]; bonds: unknown[] }[];
    const n = frames[0]?.atoms.length ?? 0;
    const xyz = new Float64Array(frames.length * n * 3);
    frames.forEach((f, k) => f.atoms.forEach((a, i) => xyz.set([a.x, a.y, a.z], (k * n + i) * 3)));
    self.postMessage({ id: e.data.id, first: { els: frames[0]?.atoms.map((a) => a.el), bonds: frames[0]?.bonds }, xyz, work }, { transfer: [xyz.buffer] });
  } else {
    self.postMessage({ id: e.data.id, result, work });
  }
};
