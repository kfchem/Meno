import { describe, expect, it } from "vitest";
import { findIn, letterAt, lineAt, linesOf, marksBetween, pageTextFrom, pageTextOf, placeAt, searchable, wordAt, wordsBetween, type PageText } from "./text";

/** A page of lines as PDFium reads them: each letter 6 points wide, each line 12 tall, 14 apart; its ends "\r\n" with no box. */
function page(lines: string[]): PageText {
  let text = "";
  const boxes: ([number, number, number, number] | null)[] = [];
  lines.forEach((line, l) => {
    [...line].forEach((ch, k) => {
      text += ch;
      boxes.push(ch === "\u0002" ? null : [72 + k * 6, 100 + l * 14, 78 + k * 6, 112 + l * 14]);
    });
    if (l < lines.length - 1) {
      text += "\r\n";
      boxes.push(null, null);
    }
  });
  return pageTextFrom(text, boxes);
}

const p = page(["Rotational barriers of the hy-", "droxyl group were confor\u0002", "mational, as found."]);

describe("a PDF page's words", () => {
  it("are read from the reader's answer: a letter and its box in 20 bytes", () => {
    const buf = new ArrayBuffer(40);
    const v = new DataView(buf);
    v.setUint32(0, 65, true);
    [1, 2, 3, 4].forEach((n, k) => v.setFloat32(4 + k * 4, n, true));
    v.setUint32(20, 0x3042, true);
    const t = pageTextOf(buf);
    expect([...t.codes]).toEqual([65, 0x3042]);
    expect([...t.boxes.slice(0, 4)]).toEqual([1, 2, 3, 4]);
  });

  it("lie in lines, each with the box round its letters", () => {
    const lines = linesOf(p);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatchObject({ x0: 72, y0: 114, y1: 126 });
  });

  it("are found under the pointer, and the place between letters nearest it", () => {
    expect(String.fromCodePoint(p.codes[letterAt(p, 73, 105)!])).toBe("R");
    expect(letterAt(p, 10, 10)).toBeNull();
    // (left of a letter's middle, before it; right, after it)
    expect(placeAt(p, 73, 105)).toBe(0);
    expect(placeAt(p, 77, 105)).toBe(1);
    // (beyond a line's end, after its last letter, not its end)
    const [, end] = lineAt(p, 0);
    expect(placeAt(p, 500, 105)).toBe(end);
    // (above every line, the first place; between lines, the nearer)
    expect(placeAt(p, 73, 0)).toBe(0);
    expect(placeAt(p, 73, 119)).toBe(linesOf(p)[1].start);
  });

  it("make words and lines, as two clicks and three select them", () => {
    const i = letterAt(p, 72 + 12 * 6 + 1, 105)!;
    const [a, b] = wordAt(p, i);
    expect(wordsBetween(p, a, b)).toBe("barriers");
    const [s, e] = lineAt(p, i);
    expect(wordsBetween(p, s, e)).toBe("Rotational barriers of the hy-");
    // (a space alone, or a stop)
    const space = 10;
    expect(wordAt(p, space)).toEqual([space, space + 1]);
  });

  it("are marked a line at a time, and copied with a line's end a space and a word broken at one whole", () => {
    const from = 11;
    const to = linesOf(p)[2].start + 8;
    expect(marksBetween(p, from, to)).toHaveLength(3);
    expect(marksBetween(p, from, to)[0][0]).toBe(72 + 11 * 6);
    // (a hyphen PDFium left at a line's end kept, as a word's own)
    expect(wordsBetween(p, from, to)).toBe("barriers of the hy-droxyl group were conformational");
  });

  it("are searched without regard to case, across a line's end, and whole where broken there", () => {
    const s = searchable(p);
    expect(s.text).toBe("rotational barriers of the hy-droxyl group were conformational, as found.");
    expect(s.back).toHaveLength(s.text.length);
    const hits = findIn(p, "CONFORMATIONAL");
    expect(hits).toHaveLength(1);
    expect(wordsBetween(p, hits[0][0], hits[0][1])).toBe("conformational");
    expect(findIn(p, "the   hy-droxyl")).toHaveLength(1);
    expect(findIn(p, "were confor mational")).toHaveLength(0);
    // (a word broken at a line's end, asked with its hyphen, found too - once)
    expect(findIn(p, "confor-mational")).toHaveLength(1);
    expect(findIn(p, "were confor")).toHaveLength(1);
    expect(findIn(p, "  ")).toEqual([]);
  });
});
