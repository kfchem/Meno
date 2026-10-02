import { describe, expect, it } from "vitest";
import { placedAbbreviation } from "../chem/abbreviationPlace";
import { layout2D } from "./engine";
import { FORESHORTEN, metalSlots } from "./hapto";
import { METAL_BOND } from "./perceive";

type Placed = NonNullable<ReturnType<typeof placedAbbreviation>>;
const laid = (label: string): Placed => placedAbbreviation(label, null, 1)!;
const find = (s: Placed, el: string) => s.atoms.flatMap((a, i) => (a.el === el ? [i] : []));
const at = (s: Placed, i: number) => ({ x: s.atoms[i].x, y: s.atoms[i].y });
const dist = (s: Placed, i: number, j: number) => Math.hypot(s.atoms[i].x - s.atoms[j].x, s.atoms[i].y - s.atoms[j].y);
const angleAt = (s: Placed, centre: number, i: number, j: number) => {
  const u = { x: s.atoms[i].x - s.atoms[centre].x, y: s.atoms[i].y - s.atoms[centre].y };
  const v = { x: s.atoms[j].x - s.atoms[centre].x, y: s.atoms[j].y - s.atoms[centre].y };
  return (Math.acos((u.x * v.x + u.y * v.y) / Math.hypot(u.x, u.y) / Math.hypot(v.x, v.y)) * 180) / Math.PI;
};

describe("a metal's slots", () => {
  it("put two rings opposite, leaning from any other ligands; one ring over its legs; else all evenly", () => {
    const deg = (t: { angle: number }) => Math.round((t.angle * 180) / Math.PI) + 0;
    expect(metalSlots(2, 0).map(deg)).toEqual([0, 180]);
    expect(metalSlots(2, 2).map(deg)).toEqual([-20, 200, 60, 120]);
    expect(metalSlots(1, 3).map(deg)).toEqual([0, 120, 180, 240]);
    expect(metalSlots(0, 4).map(deg)).toEqual([0, 90, 180, 270]);
  });
});

describe("a ring bound face-on to a metal", () => {
  it("is foreshortened across its metal's axis, its centre a bond from the metal, its lower half near and bold", () => {
    const fc = laid("Cp2Fe");
    const [fe] = find(fc, "Fe");
    const stars = find(fc, "*");
    expect(stars).toHaveLength(2);
    // a sandwich, upright: the rings above and below the metal, a bond from it
    for (const s of stars) expect(dist(fc, fe, s)).toBeCloseTo(1, 6);
    expect(angleAt(fc, fe, stars[0], stars[1])).toBeCloseTo(180, 6);
    expect(Math.abs(at(fc, stars[0]).x - at(fc, fe).x)).toBeLessThan(1e-6);
    // each ring as deep as FORESHORTEN of its width
    for (const h of fc.haptic!) {
      const xs = h.atoms.map((i) => fc.atoms[i].x);
      const ys = h.atoms.map((i) => fc.atoms[i].y);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);
      expect(height / width).toBeGreaterThan(FORESHORTEN * 0.8);
      expect(height / width).toBeLessThan(FORESHORTEN * 1.2);
      // seen from a little above: its lower atoms nearer, the edges between them bold
      const centre = ys.reduce((t, y) => t + y, 0) / ys.length;
      for (const i of h.atoms) {
        const z = fc.atoms[i].z!;
        if (Math.abs(fc.atoms[i].y - centre) > 1e-6) expect(Math.sign(z)).toBe(fc.atoms[i].y < centre ? 1 : -1);
      }
      const bold = fc.bonds.filter((b) => b.display === "bold" && h.atoms.includes(b.a1) && h.atoms.includes(b.a2));
      expect(bold.length).toBeGreaterThanOrEqual(2);
      for (const b of bold) expect(fc.atoms[b.a1].z! + fc.atoms[b.a2].z!).toBeGreaterThan(0);
    }
  });

  it("leans in a bent metallocene, away from the metal's other ligands", () => {
    const zr = laid("Cp2ZrCl2");
    const [m] = find(zr, "Zr");
    const stars = find(zr, "*");
    expect(angleAt(zr, m, stars[0], stars[1])).toBeCloseTo(140, 4);
    const [cl1, cl2] = find(zr, "Cl");
    // the chlorides on the side the rings lean from
    const side = (i: number) => Math.sign(zr.atoms[i].x - zr.atoms[m].x);
    expect(side(cl1)).toBe(side(cl2));
    expect(side(stars[0])).toBe(-side(cl1));
  });

  it("stands over a half-sandwich's legs", () => {
    const ru = laid("Cp*RuCl(PPh3)2");
    const [m] = find(ru, "Ru");
    const [star] = find(ru, "*");
    expect(ru.atoms[star].y).toBeGreaterThan(ru.atoms[m].y);
    for (const leg of [...find(ru, "P"), ...find(ru, "Cl")]) expect(ru.atoms[leg].y).toBeLessThan(ru.atoms[m].y + 1e-6);
    // what hangs from the ring lies in its plane: Cp*'s methyls foreshortened with it
    const methyls = ru.bonds.filter((b) => ru.atoms[b.a1].el === "C" && ru.atoms[b.a2].el === "C" && ru.atoms[b.a2].z != null && !ru.haptic![0].atoms.includes(b.a2));
    expect(methyls.length).toBeGreaterThan(0);
  });

  it("is drawn alone face-on to a star where the ligand is a label's picture", () => {
    expect(laid("dppf").bonds.some((b) => b.display === "bold")).toBe(true);
  });
});

describe("ligands round a metal", () => {
  it("are a bond and a half off, the bulky ones trans, what a donor carries spread away from the metal", () => {
    const pd = laid("PdCl2(PPh3)2");
    const [m] = find(pd, "Pd");
    const ps = find(pd, "P");
    for (const l of [...ps, ...find(pd, "Cl")]) expect(dist(pd, m, l)).toBeCloseTo(METAL_BOND, 4);
    expect(angleAt(pd, m, ps[0], ps[1])).toBeCloseTo(180, 4);
    for (const p of ps) {
      for (const b of pd.bonds.filter((x) => (x.a1 === p || x.a2 === p) && x.a1 !== m && x.a2 !== m)) {
        const c = b.a1 === p ? b.a2 : b.a1;
        // (turned a little where that clears them, but never back over the metal)
        expect(angleAt(pd, p, m, c)).toBeGreaterThan(75);
      }
    }
  });

  it("close a chelate through a ferrocene at the metal, its two bonds alike", () => {
    const pd = laid("PdCl2(dppf)");
    const [m] = find(pd, "Pd");
    const [p1, p2] = find(pd, "P");
    expect(dist(pd, m, p1)).toBeCloseTo(dist(pd, m, p2), 4);
    expect(angleAt(pd, m, p1, p2)).toBeGreaterThan(60);
    // (the whole engine on a complex this size: slower on CI's runners)
  }, 30_000);

  it("turn crowded aryl rings as a propeller where that reads better, their near edges bold", () => {
    const pd = laid("Pd(PPh3)4");
    const turned = pd.atoms.filter((a) => a.el === "C" && a.z != null);
    expect(turned.length).toBeGreaterThan(0);
    expect(pd.bonds.some((b) => b.display === "bold")).toBe(true);
  }, 30_000);
});

describe("a structure with no metal", () => {
  it("has nothing drawn bold, and no depth outside a cage", () => {
    const out = layout2D({
      atoms: [{ el: "C" }, { el: "C" }, { el: "O" }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "C" }],
      bonds: [
        { a: 0, b: 1, order: 1 },
        { a: 1, b: 2, order: 2 },
        { a: 1, b: 3, order: 1 },
        { a: 3, b: 4, order: 1 },
        { a: 4, b: 5, order: 1 },
        { a: 5, b: 6, order: 1 },
      ],
    });
    expect(out.bold).toEqual([]);
    expect(out.depth.every((d) => d == null)).toBe(true);
  });
});
