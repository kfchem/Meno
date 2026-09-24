import { describe, expect, it } from "vitest";
import {
  buildAllPrimitives,
  buildBondPrimitives,
  buildTextLabels,
  implicitHydrogens,
  layoutMolecule,
  mitreJoinPolys,
  roundPolyCorners,
  type Atom,
  type Bond,
  type LayoutOptions,
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

  it("rounds the wedge and caps the joins by default", () => {
    const o = opts();
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
    const cut = wedgeOf(opts()).points;
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
    const o = opts();
    const { fills } = buildAllPrimitives(atoms, bonds, o, 40);
    expect(capAt(fills, atoms[0])).toBe(true); // the end of the chain
    expect(capAt(fills, atoms[1])).toBe(true); // where the bonds meet
    for (const f of fills) expect(f.r).toBeCloseTo(o.lineWidthPx / 2, 9);
  });

  it("leaves a hashed wedge and a label alone", () => {
    const { fills } = buildAllPrimitives(atoms, bonds, opts(), 40);
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
    // the double bond runs along +x from the atom; its lines sit either side
    const ys = lines
      .filter((l) => l.x1 > -0.1 && l.x2 > 1)
      .map((l) => l.y1);
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
