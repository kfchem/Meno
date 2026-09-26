import { describe, expect, it } from "vitest";
import {
  buildAllPrimitives,
  buildBondPrimitives,
  joinsAtAtoms,
  buildTextLabels,
  implicitHydrogens,
  layoutMolecule,
  mitreJoinPolys,
  roundPolyCorners,
  type Atom,
  type Bond,
  type LayoutOptions,
  type LineSeg,
  type Vec2,
} from "./layout2d";
import { acsWorldOptions } from "./acs";

const opts = (over: Partial<LayoutOptions> = {}): LayoutOptions =>
  acsWorldOptions([], [], { units: "world", ...over });

const polyArea = (pts: Vec2[]) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
};

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

  it("writes OH for a bond within 10 degrees of vertical, whichever way it leans", () => {
    // the neighbour sits `deg` degrees right of straight up (or down) from O
    const at = (deg: number, below = false): Atom[] => {
      const t = (deg * Math.PI) / 180;
      return [
        { id: 1, x: 0, y: 0, el: "O" },
        { id: 2, x: 1.3 * Math.sin(t), y: (below ? -1.3 : 1.3) * Math.cos(t), el: "C" },
      ];
    };
    const text = (atoms: Atom[]) => buildTextLabels(atoms, opts(), oneBond)[0].text;
    for (const below of [false, true]) {
      expect(text(at(0, below))).toBe("OH");
      expect(text(at(1e-4, below))).toBe("OH");
      expect(text(at(9.9, below))).toBe("OH");
      expect(text(at(-30, below))).toBe("OH");
      expect(text(at(10.1, below))).toBe("HO");
      expect(text(at(30, below))).toBe("HO");
    }
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
  // the outline before the corners are rounded
  const raw = (over: Partial<LayoutOptions> = {}) =>
    opts({ joinStyle: "sharp", ...over });
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
    const o = raw();
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
    const o = raw();
    const { polys } = buildBondPrimitives(atoms, wedge, o, ZOOM, deg);
    const base = polys[0].points.filter((p) => p.x > 0.75);
    expect(base).toHaveLength(2);
    expect(Math.abs(base[0].y - base[1].y)).toBeCloseTo(o.wedgeWidthPx, 6);
  });

  it("cuts the wide end along a bond that continues from it", () => {
    // stereocentre at 0, wide end at 1, which carries on to 2
    const chain: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 2.3, y: -1.3, el: "C" },
    ];
    const chainDeg = new Map([
      [0, 3],
      [1, 2],
      [2, 1],
    ]);
    const chainBonds: Bond[] = [
      wedge,
      { a1: 1, a2: 2, order: 1, stereo: "none" },
    ];
    const adj = new Map([
      [0, [chainBonds[0]]],
      [1, [chainBonds[0], chainBonds[1]]],
      [2, [chainBonds[1]]],
    ]);
    const o = raw();
    const { polys } = buildBondPrimitives(
      chain,
      wedge,
      o,
      ZOOM,
      chainDeg,
      undefined,
      undefined,
      adj,
    );
    const base = polys[0].points.filter((p) => p.x > 0.75);
    expect(base).toHaveLength(2);
    // the cut runs parallel to the continuing bond
    const cut = { x: base[0].x - base[1].x, y: base[0].y - base[1].y };
    const bond = { x: 2.3 - 1.5, y: -1.3 };
    expect(cut.x * bond.y - cut.y * bond.x).toBeCloseTo(0, 6);
    // and along its far edge, so the bond is taken in whole: with nothing
    // else at the atom, that edge is the one carrying the outline round
    const len = Math.hypot(bond.x, bond.y);
    const n0 = { x: -bond.y / len, y: bond.x / len };
    const towardsTip = n0.x * (0 - 1.5) >= 0 ? 1 : -1;
    for (const p of base) {
      const off = ((p.x - 1.5) * n0.x + (p.y - 0) * n0.y) * towardsTip;
      expect(off).toBeCloseTo(-o.lineWidthPx / 2, 6);
    }
  });

  it("leaves the wide end square when a bond runs along the wedge", () => {
    // the bond at the wide end doubles back at a shallow angle: cutting to it
    // would draw the wedge out into a spike
    const shallow: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: -1.41, y: -0.51, el: "C" },
    ];
    const shallowBonds: Bond[] = [
      { a1: 1, a2: 0, order: 1, stereo: "up" },
      { a1: 0, a2: 2, order: 1, stereo: "none" },
    ];
    const shallowDeg = new Map([
      [0, 2],
      [1, 3],
      [2, 1],
    ]);
    const o = raw();
    const { polys } = buildBondPrimitives(
      shallow,
      shallowBonds[0],
      o,
      ZOOM,
      shallowDeg,
      undefined,
      undefined,
      new Map([
        [0, [shallowBonds[0], shallowBonds[1]]],
        [1, [shallowBonds[0]]],
        [2, [shallowBonds[1]]],
      ]),
    );
    const base = polys[0].points.filter((p) => p.x < 0.75);
    expect(base).toHaveLength(2);
    // square, not stretched along the wedge: both corners at the same place
    // along it, a cap's width behind the atom so they cover the join cap
    expect(base[0].x).toBeCloseTo(base[1].x, 9);
    for (const p of base) {
      expect(p.x).toBeLessThanOrEqual(0);
      expect(p.x).toBeGreaterThanOrEqual(-o.lineWidthPx);
    }
  });

  it("leaves the wide end square when nothing continues from it", () => {
    const o = raw();
    const { polys } = buildBondPrimitives(atoms, wedge, o, ZOOM, deg);
    const base = polys[0].points.filter((p) => p.x > 0.75);
    expect(base[0].x).toBeCloseTo(base[1].x, 12);
  });

  it("gives the hashed wedge a last hash of bond width", () => {
    const o = raw();
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

describe("roundPolyCorners", () => {
  const square: Vec2[] = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ];
  it("rounds a corner to the radius asked for", () => {
    const r = 0.25;
    const out = roundPolyCorners(square, r);
    // each corner loses the bit outside the arc; the arc itself is drawn as
    // segments, so the area lands just inside the exact figure
    const exact = 4 - (4 - Math.PI) * r * r;
    expect(polyArea(out)).toBeGreaterThan(exact * 0.995);
    expect(polyArea(out)).toBeLessThanOrEqual(exact);
    for (const p of out) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("keeps the shape when there is no room for the radius", () => {
    // a radius wider than the shape itself still stays inside it
    const out = roundPolyCorners(square, 10);
    expect(polyArea(out)).toBeLessThanOrEqual(4);
    expect(polyArea(out)).toBeGreaterThan(2);
  });

  it("leaves a polygon alone when the radius is zero", () => {
    expect(roundPolyCorners(square, 0)).toBe(square);
  });
});

describe("mitreJoinPolys", () => {
  it("fills each gap out to where the two outlines cross", () => {
    // two bonds 120 degrees apart
    const dirs: Vec2[] = [
      { x: 1, y: 0 },
      { x: Math.cos((2 * Math.PI) / 3), y: Math.sin((2 * Math.PI) / 3) },
    ];
    const h = 0.05;
    const polys = mitreJoinPolys({ x: 0, y: 0 }, dirs, h);
    expect(polys).toHaveLength(2);
    for (const p of polys) {
      expect(p.points).toHaveLength(4);
      const apex = p.points[2];
      // the mitre point of two outlines h from the centre
      const gap = Math.hypot(apex.x, apex.y);
      expect(gap).toBeGreaterThan(h);
      expect(gap).toBeLessThan(h * 4);
    }
  });

  it("cuts the mitre off when the gap is too shallow for it", () => {
    const dirs: Vec2[] = [
      { x: 1, y: 0 },
      { x: Math.cos(0.05), y: Math.sin(0.05) },
    ];
    const polys = mitreJoinPolys({ x: 0, y: 0 }, dirs, 0.05);
    const squared = polys.filter((p) => p.points.length === 3);
    expect(squared.length).toBeGreaterThan(0);
  });

  it("needs two bonds", () => {
    expect(mitreJoinPolys({ x: 0, y: 0 }, [{ x: 1, y: 0 }], 0.05)).toEqual([]);
  });
});

describe("joinStyle", () => {
  // a bent chain with a wedge whose wide end carries two bonds on
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 1.5, el: "C" },
    { id: 2, x: 0, y: 0, el: "C" },
    { id: 3, x: 1.3, y: -0.75, el: "C" },
    { id: 4, x: -1.3, y: -0.75, el: "C" },
    // a plain corner well away from the wedge
    { id: 5, x: 2.6, y: 0, el: "C" },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 1, stereo: "up", stereoOrient: "reverse" },
    { a1: 1, a2: 2, order: 1, stereo: "none" },
    { a1: 1, a2: 3, order: 1, stereo: "none" },
    { a1: 2, a2: 4, order: 1, stereo: "none" },
  ];

  it("rounds the wedge and caps the joins when ends are round", () => {
    const o = opts({ joinStyle: "round" });
    const { polys, fills } = buildAllPrimitives(atoms, bonds, o, 40);
    expect(fills.length).toBeGreaterThan(0);
    // a cap at the plain corner, and the wedge drawn as arcs not corners
    expect(polys).toHaveLength(1);
    expect(polys[0].points.length).toBeGreaterThan(8);
  });

  it("rounds only the corners no bond runs into", () => {
    const wedgeOf = (o: LayoutOptions) => {
      const { polys } = buildAllPrimitives(atoms, bonds, o, 40);
      return polys.reduce((big, p) =>
        polyArea(p.points) > polyArea(big.points) ? p : big,
      );
    };
    const cut = wedgeOf(opts({ joinStyle: "round" })).points;
    const square = wedgeOf(opts({ joinStyle: "sharp" })).points;
    // the wide end is cut along two bonds, so those corners and the dent are
    // left as they are; only the free narrow end is rounded
    for (const p of square.slice(0, 3)) {
      expect(
        cut.some(
          (q) => Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9,
        ),
      ).toBe(true);
    }
    expect(cut.length).toBeGreaterThan(square.length);
  });

  it("dents in to the atom, where the join is filled", () => {
    const o = opts({ joinStyle: "sharp" });
    const { polys } = buildAllPrimitives(atoms, bonds, o, 40);
    const wedge = polys.reduce((big, p) =>
      polyArea(p.points) > polyArea(big.points) ? p : big,
    );
    const dent = wedge.points[1];
    // the branching atom itself
    expect(dent.x).toBeCloseTo(0, 9);
    expect(dent.y).toBeCloseTo(0, 9);
  });

  it("mitres the joins and leaves the wedge cut when asked", () => {
    const o = opts({ joinStyle: "sharp" });
    const { polys, fills } = buildAllPrimitives(atoms, bonds, o, 40);
    expect(fills).toHaveLength(0);
    // the wedge is the shape with some size to it; the joins are slivers
    const wedge = polys.reduce((big, p) =>
      polyArea(p.points) > polyArea(big.points) ? p : big,
    );
    // base left, dent, base right, and the two tip corners
    expect(wedge.points).toHaveLength(5);
    // the dent points back towards the thin end
    const dent = wedge.points[1];
    expect(dent.y).toBeGreaterThan(wedge.points[0].y);
    expect(dent.y).toBeGreaterThan(wedge.points[2].y);
    // and the joins are filled
    expect(polys.length).toBeGreaterThan(1);
  });
});

describe("how a bond ends", () => {
  // a chain ending free, a hashed wedge, and a labelled atom
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1.5, y: 0, el: "C" },
    { id: 3, x: 2.3, y: 1.3, el: "C" },
    { id: 4, x: 2.3, y: -1.3, el: "O" },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 1, stereo: "none" },
    { a1: 1, a2: 2, order: 1, stereo: "down" },
    { a1: 1, a2: 3, order: 1, stereo: "none" },
  ];
  const capAt = (fills: { c: Vec2 }[], a: Atom) =>
    fills.some((f) => Math.hypot(f.c.x - a.x, f.c.y - a.y) < 1e-9);

  it("rounds a free end as much as a join", () => {
    const o = opts({ joinStyle: "round" });
    const { fills } = buildAllPrimitives(atoms, bonds, o, 40);
    expect(capAt(fills, atoms[0])).toBe(true); // the end of the chain
    expect(capAt(fills, atoms[1])).toBe(true); // where the bonds meet
    for (const f of fills) expect(f.r).toBeCloseTo(o.lineWidthPx / 2, 9);
  });

  it("leaves a hashed wedge and a label alone", () => {
    const { fills } = buildAllPrimitives(atoms, bonds, opts({ joinStyle: "round" }), 40);
    // a cap past the last hash would read as a loose dot
    expect(capAt(fills, atoms[2])).toBe(false);
    // a label takes the bond's end with it
    expect(capAt(fills, atoms[3])).toBe(false);
  });

  it("ends flat when asked for sharp joins", () => {
    const { fills } = buildAllPrimitives(
      atoms,
      bonds,
      opts({ joinStyle: "sharp" }),
      40,
    );
    expect(fills).toHaveLength(0);
  });
});

describe("a hashed wedge and its neighbours", () => {
  const ZOOM = 40;
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" }, // stereocentre
    { id: 2, x: 1.5, y: 0, el: "C" },
  ];
  const deg = new Map([
    [0, 3],
    [1, 1],
  ]);
  const hashed: Bond = { a1: 0, a2: 1, order: 1, stereo: "down" };

  it("puts a hash on the atom at the narrow end", () => {
    const o = opts();
    const { lines } = buildBondPrimitives(atoms, hashed, o, ZOOM, deg);
    const mid = lines.map((l) => ({
      x: (l.x1 + l.x2) / 2,
      len: Math.hypot(l.x2 - l.x1, l.y2 - l.y1),
    }));
    const narrow = mid.reduce((a, b) => (b.len < a.len ? b : a));
    const wideEnd = mid.reduce((a, b) => (b.len > a.len ? b : a));
    // the thin end is the stereocentre; a hash short of it reads as a gap
    expect(narrow.x).toBeCloseTo(0, 6);
    expect(narrow.len).toBeCloseTo(o.lineWidthPx, 6);
    expect(wideEnd.x).toBeCloseTo(1.5, 6);
    expect(wideEnd.len).toBeCloseTo(o.wedgeWidthPx, 6);
  });
});

describe("a wedge and a bond of more than one line", () => {
  // the wide end of the wedge sits on atom 1, where a double bond carries on
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 1.5, el: "C" },
    { id: 2, x: 0, y: 0, el: "C" },
    { id: 3, x: 1.5, y: 0, el: "C" },
    { id: 4, x: -1.3, y: -0.75, el: "C" },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 1, stereo: "up", stereoOrient: "reverse" },
    { a1: 1, a2: 2, order: 2, stereo: "none" },
    { a1: 1, a2: 3, order: 1, stereo: "none" },
  ];

  it("cuts past the far line, so neither line ends in mid air", () => {
    const o = opts();
    const { polys, lines } = buildAllPrimitives(atoms, bonds, o, 40);
    const wedge = polys.reduce((big, p) =>
      polyArea(p.points) > polyArea(big.points) ? p : big,
    );
    // the double bond runs along +x from the atom; its lines sit either side.
    // The lower one runs on past the atom to meet the plain bond leaving it
    // on that side, so only where they end is asked.
    const ys = lines.filter((l) => l.x2 > 1).map((l) => l.y2);
    expect(ys.length).toBe(2);
    const lowest = Math.min(...ys);
    // the wedge reaches below the lower line, so its end is covered
    const under = Math.min(...wedge.points.map((p) => p.y));
    expect(under).toBeLessThanOrEqual(lowest);
  });

  it("runs a line of a double bond up to the atom the wedge covers", () => {
    const o = opts();
    const { lines } = buildAllPrimitives(atoms, bonds, o, 40);
    // both lines start at the atom, not held back from it
    for (const l of lines.filter((s) => s.x1 > -0.1 && s.x2 > 1)) {
      expect(l.x1).toBeCloseTo(0, 6);
    }
  });
});

describe("a label must not change how a bond is drawn", () => {
  const ZOOM = 40;
  const deg = new Map([
    [0, 3],
    [1, 1],
  ]);
  const pair = (el: string): Atom[] => [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1.5, y: 0, el },
  ];
  const spacing = (lines: { x1: number; x2: number }[]) => {
    const xs = lines.map((l) => (l.x1 + l.x2) / 2).sort((a, b) => a - b);
    return xs.slice(1).map((x, i) => x - xs[i]);
  };

  it("keeps the hashes of a hashed wedge equally spaced", () => {
    const o = opts();
    const bond: Bond = { a1: 0, a2: 1, order: 1, stereo: "down" };
    const plain = buildBondPrimitives(pair("C"), bond, o, ZOOM, deg).lines;
    const labelled = buildBondPrimitives(pair("O"), bond, o, ZOOM, deg).lines;
    // the bond to a labelled atom is shorter, so it carries fewer hashes -
    // but the gap between them is the same
    expect(labelled.length).toBeLessThan(plain.length);
    const a = spacing(plain);
    const b = spacing(labelled);
    expect(b[0]).toBeCloseTo(a[0], 6);
  });

  it("keeps the wave of a wavy bond the same length", () => {
    const o = opts();
    const bond: Bond = { a1: 0, a2: 1, order: 1, stereo: "wavy" };
    // where the wave crosses the bond's own line: half a wavelength apart,
    // and at the same places along the bond whatever is drawn of it
    const crossings = (atoms: Atom[]) => {
      const out: number[] = [];
      for (const l of buildBondPrimitives(atoms, bond, o, ZOOM, deg).lines) {
        if (l.y1 === 0 || l.y1 * l.y2 < 0) {
          const f = l.y1 === 0 ? 0 : l.y1 / (l.y1 - l.y2);
          out.push(l.x1 + (l.x2 - l.x1) * f);
        }
      }
      return out;
    };
    const plain = crossings(pair("C"));
    const labelled = crossings(pair("O"));
    expect(labelled.length).toBeLessThan(plain.length);
    for (const x of labelled) {
      expect(plain.some((p) => Math.abs(p - x) < 0.02)).toBe(true);
    }
  });
});

describe("labels and the room they need", () => {
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1.5, y: 0, el: "N" }, // NH2, hanging to the right
  ];
  const bonds: Bond[] = [{ a1: 0, a2: 1, order: 1, stereo: "none" }];

  it("makes room for a label in the drawing's bounds", () => {
    const o = opts();
    const layout = layoutMolecule(atoms, bonds, o, 40);
    // the label reaches past its atom, and the drawing has to include it
    expect(layout.bounds.max.x).toBeGreaterThan(1.5 + o.fontPx * 0.2);
    expect(layout.bounds.max.y).toBeGreaterThan(0);
    expect(layout.bounds.min.y).toBeLessThan(0);
  });

  it("stops where the label actually reaches, not at a fixed distance", () => {
    const o = opts();
    const endingAt = (el: string) =>
      layoutMolecule(
        [
          { id: 1, x: 0, y: 0, el: "C" },
          { id: 2, x: 1.5, y: 0, el },
        ],
        bonds,
        o,
        40,
      ).lines[0].x2;
    // a wide symbol takes more room than a narrow one, side on
    expect(endingAt("Br")).toBeLessThan(endingAt("I"));
    // and the hydrogens, which hang the other way, take none of it
    expect(endingAt("O")).toBeCloseTo(endingAt("I"), 6);
  });

  it("does not hold a bond off a label it barely meets", () => {
    const o = opts();
    // straight down onto the same label: only its height is in the way
    const above = layoutMolecule(
      [
        { id: 1, x: 1.5, y: 1.5, el: "C" },
        { id: 2, x: 1.5, y: 0, el: "N" },
      ],
      bonds,
      o,
      40,
    ).lines[0];
    const gap = Math.min(above.y1, above.y2);
    expect(gap).toBeLessThan(o.fontPx * 0.6);
    expect(gap).toBeGreaterThan(0);
  });
});

describe("a wedge with a bond carrying straight on", () => {
  const ZOOM = 40;
  // the wide end at atom 1, with one bond carrying on in line with the wedge
  // and another leaving at an angle
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1.5, y: 0, el: "C" },
    { id: 3, x: 3, y: 0, el: "C" },
    { id: 4, x: 2.2, y: -1.3, el: "C" },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 1, stereo: "up", stereoOrient: "reverse" },
    { a1: 1, a2: 2, order: 1, stereo: "none" },
    { a1: 1, a2: 3, order: 1, stereo: "none" },
  ];

  it("squares the end across the bond that carries on", () => {
    const o = opts({ joinStyle: "sharp" });
    const { polys } = buildAllPrimitives(atoms, bonds, o, ZOOM);
    const wedge = polys.reduce((big, p) =>
      polyArea(p.points) > polyArea(big.points) ? p : big,
    );
    const end = wedge.points.filter((p) => p.x > 0.75);
    // three points at the wide end: a corner either side and the turn between
    expect(end.length).toBe(3);
    // and the end reaches past the atom, so the bond comes out of it
    expect(Math.max(...end.map((p) => p.x))).toBeGreaterThan(1.5);
  });
});

describe("a wavy bond", () => {
  it("comes back to the bond's own line at both ends", () => {
    const o = opts();
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
    ];
    const bond: Bond = { a1: 0, a2: 1, order: 1, stereo: "wavy" };
    const { lines } = buildBondPrimitives(atoms, [bond][0], o, 40);
    const first = lines[0];
    const last = lines[lines.length - 1];
    // a cap sits on the atom, so the wave has to end there too
    expect(first.y1).toBeCloseTo(0, 9);
    expect(last.y2).toBeCloseTo(0, 6);
  });
});

describe("where bonds crowd each other", () => {
  it("runs a triple bond's outer lines its whole length, as ACS 1996 does", () => {
    const o = opts();
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 2.3, y: 1.3, el: "C" }, // something else at the far end
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 3, stereo: "none" },
      { a1: 1, a2: 2, order: 1, stereo: "none" },
    ];
    const { lines } = buildAllPrimitives(atoms, bonds, o, 40);
    const triple = lines.filter((l) => l.x1 < 1.6 && l.x2 <= 1.5 + 1e-9);
    const middle = triple.find((l) => Math.abs(l.y1) < 1e-9)!;
    const outer = triple.filter((l) => Math.abs(l.y1) > 1e-9);
    expect(outer).toHaveLength(2);
    // square to the atom at both ends, the one another bond joins as well
    for (const l of outer) {
      expect(l.x1).toBeCloseTo(middle.x1, 9);
      expect(l.x2).toBeCloseTo(middle.x2, 9);
    }
  });

  it("keeps a wedge's join filled where only wedges meet", () => {
    const o = opts({ joinStyle: "round" });
    // a stereocentre carrying nothing but wedges
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: -0.75, y: 1.3, el: "C" },
      { id: 4, x: -0.75, y: -1.3, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1, stereo: "up" },
      { a1: 0, a2: 2, order: 1, stereo: "up" },
      { a1: 0, a2: 3, order: 1, stereo: "down" },
    ];
    const { fills } = buildAllPrimitives(atoms, bonds, o, 40);
    // the thin ends are each a bond wide and do not fill the join on their own
    expect(fills.some((f) => Math.hypot(f.c.x, f.c.y) < 1e-9)).toBe(true);
  });
});

describe("double bonds, as ACS 1996 draws them", () => {
  const o = () => opts({ joinStyle: "sharp" });
  const off = () => o().doubleOffsetPx; // world units: the options are in world
  const hexagon = (): Atom[] =>
    [0, 1, 2, 3, 4, 5].map((k) => ({
      id: k + 1,
      x: 1.5 * Math.cos((Math.PI / 3) * k),
      y: 1.5 * Math.sin((Math.PI / 3) * k),
      el: "C",
    }));
  const ringBonds = (): Bond[] =>
    [0, 1, 2, 3, 4, 5].map((k) => ({
      a1: k,
      a2: (k + 1) % 6,
      order: k === 0 ? 2 : 1,
    }));
  const along = (l: LineSeg, p: Vec2, q: Vec2) => {
    // where a line's ends fall along p->q, as distances from p
    const d = { x: (q.x - p.x) / Math.hypot(q.x - p.x, q.y - p.y), y: (q.y - p.y) / Math.hypot(q.x - p.x, q.y - p.y) };
    const t = (x: number, y: number) => (x - p.x) * d.x + (y - p.y) * d.y;
    return [t(l.x1, l.y1), t(l.x2, l.y2)].sort((a, b) => a - b);
  };

  it("stops a ring's inner line on the bisectors of its corners", () => {
    const atoms = hexagon();
    const { lines } = buildAllPrimitives(atoms, ringBonds(), o(), 40);
    const p = atoms[0];
    const q = atoms[1];
    const inner = lines.find((l) => {
      const mid = { x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2 };
      return Math.hypot(mid.x, mid.y) < 1.2 && Math.hypot(mid.x, mid.y) > 0.5;
    })!;
    const [t1, t2] = along(inner, p, q);
    const back = off() / Math.tan(Math.PI / 3); // half of 120 degrees
    expect(t1).toBeCloseTo(back, 9);
    expect(t2).toBeCloseTo(1.5 - back, 9);
  });

  it("shortens a chain's second line only at the end inside the zigzag", () => {
    // 0 -- 1 == 2 -- 3, zigzag at exactly 120 degrees
    const w = 1.5 * Math.cos(Math.PI / 6);
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: w, y: 0.75, el: "C" },
      { id: 3, x: 2 * w, y: 0, el: "C" },
      { id: 4, x: 3 * w, y: 0.75, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1 },
      // "left" of 1->2 is the side 3 is on
      { a1: 1, a2: 2, order: 2, doubleMode: "left" },
      { a1: 2, a2: 3, order: 1 },
    ];
    const { lines } = buildAllPrimitives(atoms, bonds, o(), 40);
    const p = atoms[1];
    const q = atoms[2];
    const second = lines.find(
      (l) => Math.abs((l.y1 + l.y2) / 2 - 0.375) > 0.05 && l.x1 > 1 && l.x2 < 2.7,
    )!;
    const [t1, t2] = along(second, p, q);
    const L = 1.5;
    // outside the corner at 1: right up to the atom
    expect(t1).toBeCloseTo(0, 9);
    // inside the corner at 2 (120 degrees): stopped on its bisector
    expect(t2).toBeCloseTo(L - off() / Math.tan(Math.PI / 3), 6);
  });

  it("never shortens double bonds that carry on in a straight line", () => {
    // 0 == 1 == 2 in a line, each placement in turn
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 3, y: 0, el: "C" },
    ];
    for (const mode of ["left", "right", "center"] as const) {
      const bonds: Bond[] = [
        { a1: 0, a2: 1, order: 2, doubleMode: mode },
        { a1: 1, a2: 2, order: 2, doubleMode: mode },
      ];
      const { lines } = buildAllPrimitives(atoms, bonds, o(), 40);
      // every line off the axis runs from one atom's end to the other's:
      // together they cover 0..3 on each side without a gap
      const off = lines.filter((l) => Math.abs(l.y1) > 1e-9);
      for (const y of new Set(off.map((l) => l.y1.toFixed(9)))) {
        const row = off
          .filter((l) => l.y1.toFixed(9) === y)
          .map((l) => [Math.min(l.x1, l.x2), Math.max(l.x1, l.x2)])
          .sort((p, q) => p[0] - q[0]);
        expect(row[0][0]).toBeCloseTo(0, 9);
        for (let i = 1; i < row.length; i++) {
          expect(row[i][0]).toBeCloseTo(row[i - 1][1], 9);
        }
        expect(row[row.length - 1][1]).toBeCloseTo(3, 9);
      }
    }
  });

  it("runs a centred double bond's lines on to the plain bonds either side", () => {
    // 1 == 2, centred, with a plain bond leaving 2 on each side
    const atoms: Atom[] = [
      { id: 1, x: -1.5, y: 0, el: "C" },
      { id: 2, x: 0, y: 0, el: "C" },
      { id: 3, x: 0.75, y: 1.3, el: "C" },
      { id: 4, x: 0.75, y: -1.3, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 2, doubleMode: "center" },
      { a1: 1, a2: 2, order: 1 },
      { a1: 1, a2: 3, order: 1 },
    ];
    const { lines, fills, polys } = buildAllPrimitives(atoms, bonds, o(), 40);
    const h = off() / 2;
    for (const [far, side] of [[2, 1], [3, -1]] as const) {
      const u = { x: atoms[far].x / 1.5, y: atoms[far].y / 1.5 };
      // where the line on this side meets the plain bond's own line
      const k = h / Math.abs(u.y);
      const meet = { x: u.x * k, y: side * h };
      const dbl = lines.find((l) => Math.abs(l.y1 - side * h) < 1e-9 && Math.abs(l.y2 - side * h) < 1e-9)!;
      expect(Math.max(dbl.x1, dbl.x2)).toBeCloseTo(meet.x, 9);
      // the plain bond still reaches the atom itself
      const plain = lines.find((l) => Math.hypot(l.x2 - atoms[far].x, l.y2 - atoms[far].y) < 1e-9)!;
      expect(plain.x1).toBeCloseTo(0, 9);
      expect(plain.y1).toBeCloseTo(0, 9);
    }
    // nothing round anywhere with square ends; the corners are mitred
    expect(fills).toHaveLength(0);
    expect(polys.length).toBeGreaterThan(0);
  });
});

describe("round or square, never some of each", () => {
  // a chain carrying one of everything: a double, a triple, a hashed wedge,
  // a wavy bond, and a label at the end of a plain bond
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1.3, y: 0.75, el: "C" },
    { id: 3, x: 2.6, y: 0, el: "C" },
    { id: 4, x: 3.9, y: 0.75, el: "C" },
    { id: 5, x: 5.2, y: 0, el: "C" },
    { id: 6, x: 2.6, y: -1.5, el: "C" },
    { id: 7, x: 0, y: -1.5, el: "C" },
    { id: 8, x: 1.3, y: 2.25, el: "O" },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 2, doubleMode: "right" },
    { a1: 1, a2: 2, order: 1 },
    { a1: 2, a2: 3, order: 3 },
    { a1: 3, a2: 4, order: 1 },
    { a1: 2, a2: 5, order: 1, stereo: "down" },
    { a1: 0, a2: 6, order: 1, stereo: "wavy" },
    { a1: 1, a2: 7, order: 1 },
  ];
  const lineEnds = (lines: { x1: number; y1: number; x2: number; y2: number }[]) =>
    lines.flatMap((l) => [
      { x: l.x1, y: l.y1 },
      { x: l.x2, y: l.y2 },
    ]);
  const near = (fills: { c: Vec2 }[], p: Vec2) =>
    fills.some((f) => Math.hypot(f.c.x - p.x, f.c.y - p.y) < 1e-9);

  it("rounds every line's ends when ends are round", () => {
    const o = opts({ joinStyle: "round" });
    const { lines, fills } = buildAllPrimitives(atoms, bonds, o, 40);
    // every end of every line has a cap over it - second lines, the triple's
    // outer ones, each hash, each piece of the wave, and the line stopping
    // short of the O - except where it meets an atom that is capped anyway
    const atomsAt = atoms.map((a) => ({ x: a.x, y: a.y }));
    for (const e of lineEnds(lines)) {
      const atAtom = atomsAt.some((p) => Math.hypot(p.x - e.x, p.y - e.y) < 1e-9);
      if (!atAtom) expect(near(fills, e)).toBe(true);
    }
  });

  it("puts nothing round in the drawing when ends are square", () => {
    const o = opts({ joinStyle: "sharp" });
    const { fills, polys } = buildAllPrimitives(atoms, bonds, o, 40);
    expect(fills).toHaveLength(0);
    // the corners along the wave are mitred instead: more polygons than the
    // atoms' own joins account for
    const noWave = buildAllPrimitives(
      atoms,
      bonds.map((b) => (b.stereo === "wavy" ? { ...b, stereo: "none" as const } : b)),
      o,
      40,
    ).polys;
    expect(polys.length).toBeGreaterThan(noWave.length);
  });
});

describe("angles and lines that reach an atom", () => {
  it("follows a bond at 150 degrees to the wedge", () => {
    const o = opts({ joinStyle: "sharp" });
    // wide end at atom 1, with a bond leaving at 150 degrees to the wedge
    const a = (150 * Math.PI) / 180;
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 1.5 + 1.5 * Math.cos(a), y: 1.5 * Math.sin(a), el: "C" },
      { id: 4, x: 1.5, y: -1.5, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1, stereo: "up", stereoOrient: "reverse" },
      { a1: 1, a2: 2, order: 1, stereo: "none" },
      { a1: 1, a2: 3, order: 1, stereo: "none" },
    ];
    const { polys } = buildAllPrimitives(atoms, bonds, o, 40);
    const wedge = polys.reduce((big, p) =>
      polyArea(p.points) > polyArea(big.points) ? p : big,
    );
    const end = wedge.points.filter((p) => p.x > 0.75);
    // cut, not left square: the two corners are at different places along it
    expect(Math.abs(end[0].x - end[end.length - 1].x)).toBeGreaterThan(0.05);
  });

  it("leaves no cap where two centred double bonds meet", () => {
    const o = opts();
    // a diene drawn with both lines either side of the bond itself
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.3, y: 0.75, el: "C" },
      { id: 3, x: 2.6, y: 0, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 2, stereo: "none", doubleMode: "center" },
      { a1: 1, a2: 2, order: 2, stereo: "none", doubleMode: "center" },
    ];
    const { fills } = buildAllPrimitives(atoms, bonds, o, 40);
    // nothing of either bond reaches the atom between them
    expect(
      fills.some((f) => Math.hypot(f.c.x - 1.3, f.c.y - 0.75) < 1e-9),
    ).toBe(false);
  });
});

describe("double bonds in a row", () => {
  it("meets its neighbour's line at the atom they share", () => {
    const o = opts();
    // two double bonds sharing atom 1
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 2.3, y: 1.3, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 2, stereo: "none" },
      { a1: 1, a2: 2, order: 2, stereo: "none" },
    ];
    const { lines } = buildAllPrimitives(atoms, bonds, o, 40);
    // the ends of the lines beside each bond, near the atom they share
    const at = { x: 1.5, y: 0 };
    const ends: { x: number; y: number; d: number }[] = [];
    for (const l of lines) {
      for (const p of [
        { x: l.x1, y: l.y1 },
        { x: l.x2, y: l.y2 },
      ]) {
        const d = Math.hypot(p.x - at.x, p.y - at.y);
        if (d > 1e-9 && d < 0.6) ends.push({ ...p, d });
      }
    }
    ends.sort((a, b) => a.d - b.d);
    expect(ends.length).toBeGreaterThanOrEqual(2);
    // they meet, rather than each stopping short on its own
    const gap = Math.hypot(ends[0].x - ends[1].x, ends[0].y - ends[1].y);
    expect(gap).toBeLessThan(o.lineWidthPx);
  });
});

describe("a wedge's wide end, at every angle a bond can leave it", () => {
  const ZOOM = 40;
  // The wide end sits at atom 1 - atom 0 carries three bonds, so it is the
  // narrow end - and one bond carries on from it at `deg` to the wedge.
  const bend = (deg: number) => {
    const L = 1.8;
    const a = (deg * Math.PI) / 180;
    const atoms: Atom[] = [
      { id: 0, x: 0, y: 0, el: "C" },
      { id: 1, x: L, y: 0, el: "C" },
      { id: 2, x: L + L * Math.cos(Math.PI - a), y: L * Math.sin(Math.PI - a), el: "C" },
      { id: 3, x: -L * 0.5, y: L * 0.87, el: "C" },
      { id: 4, x: -L * 0.5, y: -L * 0.87, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1, stereo: "up" },
      { a1: 1, a2: 2, order: 1, stereo: "none" },
      { a1: 0, a2: 3, order: 1, stereo: "none" },
      { a1: 0, a2: 4, order: 1, stereo: "none" },
    ];
    return { atoms, bonds };
  };
  const wedgeOf = (deg: number) => {
    const { atoms, bonds } = bend(deg);
    const { polys } = buildAllPrimitives(atoms, bonds, opts({ joinStyle: "sharp" }), ZOOM);
    return polys.reduce((big, p) => (polyArea(p.points) > polyArea(big.points) ? p : big));
  };
  const inside = (pts: Vec2[], q: Vec2) => {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (
        a.y > q.y !== b.y > q.y &&
        q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x
      ) {
        hit = !hit;
      }
    }
    return hit;
  };

  it("always covers the atom, so the bonds there are never cut adrift", () => {
    // 145 degrees used to cut along the bond on one side only, which slewed
    // the end across the wedge and left the atom outside it
    for (let deg = 90; deg <= 180; deg += 5) {
      expect([deg, inside(wedgeOf(deg).points, { x: 1.8, y: 0 })]).toEqual([deg, true]);
    }
  });

  it("follows the bond while the angle allows, and squares off past that", () => {
    // a cut along the bond leans the end over; a square one is across the axis
    const lean = (deg: number) => {
      const pts = wedgeOf(deg).points.filter((p) => p.x > 0.9);
      const dy = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
      const dx = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
      return dx / dy;
    };
    expect(lean(120)).toBeGreaterThan(0.4);
    expect(lean(150)).toBeGreaterThan(0.4);
    // nothing to follow: the bond is nearly the wedge's own line
    expect(lean(180)).toBeLessThan(0.1);
  });
});

describe("two double bonds sharing an atom", () => {
  // An explicit side is relative to the bond's own direction, so writing the
  // second bond the other way round genuinely puts its line on the far side
  // of the corner, with nothing there to meet. Auto and centre are read off
  // the drawing itself and must hold whichever way the bond is written.
  const modes: [Bond["doubleMode"] | undefined, boolean[]][] = [
    [undefined, [false, true]],
    ["center", [false, true]],
    ["left", [false]],
    ["right", [false]],
  ];
  // Written both ways round: the shared atom is the second bond's a1 in one
  // and its a2 in the other, and an offset read off the wrong end of a bond
  // puts its line on the side no other line will ever meet.
  const pair = (deg: number, mode: Bond["doubleMode"] | undefined, flip: boolean) => {
    const L = 1.8;
    const a = (deg * Math.PI) / 180;
    const atoms: Atom[] = [
      { id: 0, x: 0, y: 0, el: "C" },
      { id: 1, x: L, y: 0, el: "C" },
      { id: 2, x: L + L * Math.cos(Math.PI - a), y: L * Math.sin(Math.PI - a), el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 2, stereo: "none", doubleMode: mode },
      flip
        ? { a1: 2, a2: 1, order: 2, stereo: "none", doubleMode: mode }
        : { a1: 1, a2: 2, order: 2, stereo: "none", doubleMode: mode },
    ];
    return { atoms, bonds };
  };

  it("runs each line on to meet its neighbour's", () => {
    for (const [mode, flips] of modes) {
      for (const flip of flips) {
        for (const deg of [90, 120, 150]) {
          const { atoms, bonds } = pair(deg, mode, flip);
          const o = opts();
          const { lines } = buildAllPrimitives(atoms, bonds, o, 40);
          const at = { x: 1.8, y: 0 };
          // ends near the shared atom, but not on it: those are the lines
          // beside the bonds, which have to meet one another
          const loose = lines
            .flatMap((l) => [
              { x: l.x1, y: l.y1 },
              { x: l.x2, y: l.y2 },
            ])
            .filter((p) => {
              const d = Math.hypot(p.x - at.x, p.y - at.y);
              return d > 1e-6 && d < 1;
            });
          const why = `${mode ?? "auto"} ${deg} ${flip ? "flipped" : ""}`;
          expect([why, loose.length % 2]).toEqual([why, 0]);
          for (const p of loose) {
            const met = loose.some(
              (q) => q !== p && Math.hypot(q.x - p.x, q.y - p.y) < 1e-6,
            );
            expect([why, met]).toEqual([why, true]);
          }
        }
      }
    }
  });
});

describe("which atoms are finished off at all", () => {
  // The drag preview draws the atom it carries itself, so it has to ask this
  // same question: a dot the drawing does not have must not appear while the
  // atom is moving.
  const degOf = (bonds: Bond[]) => {
    const m = new Map<number, number>();
    for (const b of bonds) {
      m.set(b.a1, (m.get(b.a1) ?? 0) + 1);
      m.set(b.a2, (m.get(b.a2) ?? 0) + 1);
    }
    return m;
  };
  const caps = (atoms: Atom[], bonds: Bond[]) =>
    joinsAtAtoms(atoms, bonds, opts(), degOf(bonds)).caps;

  it("caps a plain end and a plain join", () => {
    const atoms: Atom[] = [
      { id: 0, x: 0, y: 0, el: "C" },
      { id: 1, x: 1.8, y: 0, el: "C" },
      { id: 2, x: 2.7, y: 1.6, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1, stereo: "none" },
      { a1: 1, a2: 2, order: 1, stereo: "none" },
    ];
    expect([...caps(atoms, bonds)].sort()).toEqual([0, 1, 2]);
  });

  it("leaves a label, a wedge's wide end and a centred double alone", () => {
    const atoms: Atom[] = [
      { id: 0, x: 0, y: 0, el: "C" }, // stereocentre: the wedge's narrow end
      { id: 1, x: 1.8, y: 0, el: "C" }, // the wedge's wide end
      { id: 2, x: -0.9, y: 1.6, el: "O" }, // a label
      { id: 3, x: -0.9, y: -1.6, el: "C" },
      { id: 4, x: -1.8, y: -3.2, el: "C" }, // only centred doubles meet at 3
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1, stereo: "up" },
      { a1: 0, a2: 2, order: 1, stereo: "none" },
      { a1: 0, a2: 3, order: 1, stereo: "none" },
      { a1: 3, a2: 4, order: 2, stereo: "none", doubleMode: "center" },
    ];
    const got = caps(atoms, bonds);
    expect(got.has(1)).toBe(false); // the wedge covers its own join
    expect(got.has(2)).toBe(false); // the label takes the bond's end with it
    expect(got.has(4)).toBe(false); // nothing of a centred double reaches it
    expect(got.has(0)).toBe(true); // plain bonds meet here
    expect(got.has(3)).toBe(true); // a plain bond reaches here
  });
});
