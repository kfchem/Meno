import { describe, expect, it } from "vitest";
import { ARROW_CLEAR, captionPlace, captionRuns, captionSet, CAPTION_LINE } from "./captions";
import { labelBox, placeLabel, runsWidth } from "./layout2d";

const shown = (line: string) =>
  captionRuns(line)
    .map((r) => (r.sub ? `_${r.text}` : r.sup ? `^${r.text}` : r.italic ? `/${r.text}/` : r.text))
    .join("|");

describe("a caption's words", () => {
  it("are set as formulas are: counts low, a group's own count too", () => {
    expect(shown("K2CO3, DMF, 60 °C")).toBe("K|_2|CO|_3|, DMF, 60 °C");
    expect(shown("Pd2(dba)3")).toBe("Pd|_2|(dba)|_3");
    expect(shown("Et3N, CH2Cl2")).toBe("Et|_3|N, CH|_2|Cl|_2");
    expect(shown("Pd(PPh3)4")).toBe("Pd(PPh|_3|)|_4");
  });

  it("set a prefix in italics only at a word's start, and a sign at a formula's end as its charge", () => {
    expect(shown("t-BuOK, THF")).toBe("/t/|-BuOK, THF");
    expect(shown("co-solvent")).toBe("co-solvent");
    expect(shown("NH4+")).toBe("NH|_4|^+");
    expect(shown("BF4-")).toBe("BF|_4|^−");
  });

  it("leave what has no letters as typed: numbers, signs, ratios", () => {
    expect(shown("−78 °C, 2 h")).toBe("−78 °C, 2 h");
    expect(shown("A + B")).toBe("A + B");
    expect(shown("THF/H2O (1:1)")).toBe("THF/H|_2|O (1:1)");
    expect(shown("1M HCl")).toBe("1M HCl");
  });
});

describe("a caption set", () => {
  it("centres each line on its middle, line under line", () => {
    const set = captionSet("Pd(PPh3)4\nK2CO3, 80 °C", 10, 5, 1);
    expect(set.items).toHaveLength(2);
    expect(set.items[0].y - set.items[1].y).toBeCloseTo(CAPTION_LINE);
    expect((set.items[0].y + set.items[1].y) / 2).toBeCloseTo(5);
    for (const item of set.items) {
      const placed = placeLabel(item, 1);
      const start = placed[0].x;
      const width = runsWidth(item.runs!, 1);
      expect(start + width / 2).toBeCloseTo(10, 6);
      expect(width / 2).toBeLessThanOrEqual(set.halfW + 1e-9);
    }
    expect(set.halfH).toBeGreaterThan(CAPTION_LINE / 2);
    // (its ink inside what it reaches: a subscript's drop below the last line among it)
    for (const item of set.items) {
      const ink = labelBox(item, 1);
      expect(item.y - ink.bottom).toBeGreaterThanOrEqual(5 - set.halfH - 1e-9);
      expect(item.y + ink.top).toBeLessThanOrEqual(5 + set.halfH + 1e-9);
    }
    // (a blank line keeps its room, and draws nothing)
    expect(captionSet("a\n\nb", 0, 0, 1).items.map((i) => i.text)).toEqual(["a", "b"]);
  });
});

describe("where a caption put down goes", () => {
  const arrow = { id: 7, x: 0, y: 0, angle: 0, length: 4.8 };
  const half = { w: 1.5, h: 0.6 };

  it("near an arrow: over it, or under it, centred on its middle and clear of it - the arrow's", () => {
    const over = captionPlace({ x: 1, y: 1.2 }, half, [arrow], 1);
    expect(over.arrow).toBe(7);
    expect(over.x).toBeCloseTo(0);
    expect(over.y).toBeCloseTo(ARROW_CLEAR + 0.6);
    const under = captionPlace({ x: -1.5, y: -0.4 }, half, [arrow], 1);
    expect(under.y).toBeCloseTo(-(ARROW_CLEAR + 0.6));
    // (a vertical arrow: beside it)
    const down = captionPlace({ x: 0.5, y: 0 }, half, [{ ...arrow, angle: -Math.PI / 2 }], 1);
    expect(down.x).toBeCloseTo(ARROW_CLEAR + 1.5);
    expect(down.y).toBeCloseTo(0);
  });

  it("beyond a caption already over it", () => {
    const first = { x: 0, y: ARROW_CLEAR + 0.6, arrow: 7, halfW: 1.5, halfH: 0.6 };
    const second = captionPlace({ x: 0, y: 0.5 }, half, [arrow], 1, [first]);
    expect(second.y).toBeCloseTo(first.y + 0.6 + 0.25 + 0.6);
  });

  it("where it was put, away from any arrow or past its ends", () => {
    expect(captionPlace({ x: 0, y: 6 }, half, [arrow], 1)).toEqual({ x: 0, y: 6 });
    expect(captionPlace({ x: 3, y: 0.5 }, half, [arrow], 1)).toEqual({ x: 3, y: 0.5 });
  });
});
