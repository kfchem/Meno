import { describe, expect, it } from "vitest";
import {
  buildBondPrimitives,
  buildTextLabels,
  implicitHydrogens,
  type Atom,
  type Bond,
  type LayoutOptions,
} from "./layout2d";
import { acsWorldOptions } from "./acs";

const opts = (over: Partial<LayoutOptions> = {}): LayoutOptions =>
  acsWorldOptions([], [], { units: "world", ...over });

describe("implicitHydrogens", () => {
  it("fills the usual valences", () => {
    expect(implicitHydrogens("O", 1)).toBe(1); // hydroxyl
    expect(implicitHydrogens("O", 2)).toBe(0); // ether
    expect(implicitHydrogens("N", 1)).toBe(2); // primary amine
    expect(implicitHydrogens("N", 3)).toBe(0);
    expect(implicitHydrogens("C", 3)).toBe(1);
    expect(implicitHydrogens("S", 1)).toBe(1);
    expect(implicitHydrogens("Cl", 1)).toBe(0);
  });

  it("never goes negative, and leaves unknown elements alone", () => {
    // sulfone: more bonds than the default valence
    expect(implicitHydrogens("S", 6)).toBe(0);
    expect(implicitHydrogens("Fe", 2)).toBe(0);
    expect(implicitHydrogens("R", 1)).toBe(0);
  });
});

describe("buildTextLabels", () => {
  // O bonded to a carbon that sits up and to the left
  const hydroxyl: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1.3, y: -0.75, el: "O" },
  ];
  const oneBond: Bond[] = [{ a1: 0, a2: 1, order: 1 }];

  it("writes the hydrogens an atom carries", () => {
    const [label] = buildTextLabels(hydroxyl, opts(), oneBond);
    expect(label.text).toBe("OH");
    expect(label.runs).toEqual([{ text: "O" }, { text: "H" }]);
    // the element symbol is what sits on the atom
    expect(label.anchorRun).toBe(0);
  });

  it("puts a count in a subscript run", () => {
    const amine: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.3, y: -0.75, el: "N" },
    ];
    const [, ...rest] = buildTextLabels(amine, opts(), oneBond);
    const label = rest[0] ?? buildTextLabels(amine, opts(), oneBond)[0];
    expect(label.text).toBe("NH2");
    expect(label.runs).toEqual([
      { text: "N" },
      { text: "H" },
      { text: "2", sub: true },
    ]);
  });

  it("keeps the hydrogens away from the bonds", () => {
    // neighbour on the right: the label has to read HO, anchored on the O
    const rightward: Atom[] = [
      { id: 1, x: 0, y: 0, el: "O" },
      { id: 2, x: 1.3, y: 0, el: "C" },
    ];
    const [label] = buildTextLabels(rightward, opts(), oneBond);
    expect(label.text).toBe("HO");
    expect(label.runs?.[label.anchorRun ?? 0]).toEqual({ text: "O" });
  });

  it("leaves carbons unlabelled and can be switched off", () => {
    expect(buildTextLabels(hydroxyl, opts(), oneBond)).toHaveLength(1);
    const plain = buildTextLabels(
      hydroxyl,
      opts({ showImplicitHydrogens: false }),
      oneBond,
    );
    expect(plain[0].text).toBe("O");
  });

  it("does not depend on bonds being given", () => {
    const [label] = buildTextLabels(
      [{ id: 1, x: 0, y: 0, el: "Cl" }],
      opts(),
      [],
    );
    // no bonds known: Cl would carry one hydrogen
    expect(label.text).toBe("ClH");
  });
});

describe("wedge geometry", () => {
  // the camera zoom the canvas draws at; world sizes are converted with it
  const ZOOM = 40;
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" }, // stereocentre, higher degree
    { id: 2, x: 1.5, y: 0, el: "C" },
  ];
  const deg = new Map([
    [0, 3],
    [1, 1],
  ]);
  const wedge: Bond = { a1: 0, a2: 1, order: 1, stereo: "up" };

  it("ends in a flat tip as wide as a bond, not a point", () => {
    const o = opts();
    const { polys } = buildBondPrimitives(atoms, wedge, o, ZOOM, deg);
    expect(polys).toHaveLength(1);
    const pts = polys[0].points;
    expect(pts).toHaveLength(4);

    // the tip is at the stereocentre (x = 0); its two corners straddle the
    // bond axis by half a line width
    const tip = pts.filter((p) => p.x < 0.75);
    expect(tip).toHaveLength(2);
    const halfWidth = Math.abs(tip[0].y - tip[1].y) / 2;
    expect(halfWidth).toBeCloseTo(o.lineWidthPx / 2, 6);

    // and it reaches just past the atom, so the join has no notch
    for (const p of tip) expect(p.x).toBeLessThan(0);
    for (const p of tip) expect(p.x).toBeGreaterThan(-o.lineWidthPx);
  });

  it("keeps the wide end at the far atom", () => {
    const o = opts();
    const { polys } = buildBondPrimitives(atoms, wedge, o, ZOOM, deg);
    const base = polys[0].points.filter((p) => p.x > 0.75);
    expect(base).toHaveLength(2);
    expect(Math.abs(base[0].y - base[1].y)).toBeCloseTo(o.wedgeWidthPx, 6);
  });

  it("gives the hashed wedge a last hash of bond width", () => {
    const o = opts();
    const hashed: Bond = { ...wedge, stereo: "down" };
    const { lines } = buildBondPrimitives(atoms, hashed, o, ZOOM, deg);
    expect(lines.length).toBeGreaterThan(3);
    const widths = lines.map((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1));
    const narrowest = Math.min(...widths);
    // a pointed wedge used to end in a hash of almost no length
    expect(narrowest).toBeGreaterThan(o.lineWidthPx * 0.5);
    expect(Math.max(...widths)).toBeLessThanOrEqual(o.wedgeWidthPx + 1e-9);
  });
});
