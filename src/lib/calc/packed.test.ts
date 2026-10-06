import { describe, expect, it } from "vitest";
import { pack, unpack } from "./packed";

/** As a worker's message comes to the page: cloned, its buffers handed over. */
const across = (value: unknown) => {
  const { packed, transfer } = pack(value);
  return { back: unpack(structuredClone(packed, { transfer })), packed, transfer };
};

describe("a reader's answer carried from Meno's worker", () => {
  const frames = Array.from({ length: 3 }, (_, k) => Array.from({ length: 30 }, (_, i) => i * 0.1 + k));
  const atoms = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, x: i * 1.5, y: -i, r: 0.9, el: i % 2 ? "O" : "C", charge: i === 3 ? -1 : undefined }));
  const atoms3d = Array.from({ length: 9 }, (_, i) => ({ el: "C", x: i, y: i / 2, z: -0 + i / 3 }));
  const answer = {
    structures: {
      model: { atoms, bonds: [{ id: 20, a: 1, b: 2, order: 1 }] },
      centroid: { x: 1, y: 2 },
      molecules3d: [{ atoms: atoms3d, bonds: [], frames, energies: [-1.5, -1.25, -1], name: "m.xyz" }],
    },
    atoms: [],
    frames: [],
  };

  it("comes back as it went", () => {
    expect(across(answer).back).toEqual(answer);
    // (each field in its place, as the record writes them)
    expect(Object.keys((across(answer).back as typeof answer).structures.model.atoms[0])).toEqual(Object.keys(atoms[0]));
    expect(across({ a: [1, 2], b: "x", c: null, d: [[1], [2, 3]] }).back).toEqual({ a: [1, 2], b: "x", c: null, d: [[1], [2, 3]] });
  });

  it("carries runs of numbers - frames, atoms' coordinates - in buffers handed over, and the rest as it is", () => {
    const { transfer, packed } = across(answer);
    // three frames, and the atoms of the drawing and of the molecule in 3D
    expect(transfer).toHaveLength(5);
    expect(transfer.every((b) => b.byteLength === 0)).toBe(true); // (handed over: gone from the worker's side)
    const text = JSON.stringify(packed);
    // (the drawing's last atom stood at x 13.5: no longer among the plain data)
    expect(text).not.toContain("13.5");
    expect(text).toContain('"energies":[-1.5,-1.25,-1]');
    expect(text).toContain('"el":"O"');
    // (a short list is not worth a buffer)
    expect(pack({ energies: [-1.5, -1.25, -1] }).transfer).toEqual([]);
  });

  it("keeps a point's z where only some points have one, and what is not a number as it is", () => {
    const mixed = Array.from({ length: 8 }, (_, i) => ({ x: i, y: i, ...(i % 2 ? { z: i } : {}) }));
    expect(across(mixed).back).toEqual(mixed);
    const odd = Array.from({ length: 8 }, (_, i) => (i === 4 ? "x" : i));
    expect(across(odd).back).toEqual(odd);
    expect(across([NaN, Infinity, -0, 1, 2, 3, 4, 5]).back).toEqual([NaN, Infinity, -0, 1, 2, 3, 4, 5]);
  });
});
