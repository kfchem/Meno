import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { crc32, unzip, zipStored } from "../binary/zip";
import { textOf, withText } from "../binary/png";
import { gvmlImages, gvmlPicture } from "./gvml";

const utf8 = new TextEncoder();

describe("zip", () => {
  it("writes stored entries that it reads back", async () => {
    const zip = zipStored([
      { name: "a.txt", data: "hello" },
      { name: "dir/b.bin", data: new Uint8Array([0, 1, 2, 255]) },
    ]);
    const files = (await unzip(zip))!;
    expect(new TextDecoder().decode(files.get("a.txt"))).toBe("hello");
    expect([...files.get("dir/b.bin")!]).toEqual([0, 1, 2, 255]);
    expect(await unzip(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("reads deflated entries, as Office writes them", async () => {
    const data = utf8.encode("deflated ".repeat(50));
    const packed = new Uint8Array(deflateRawSync(data));
    // a stored archive, its one entry re-made deflated by hand
    const name = utf8.encode("x.txt");
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, 8, true);
    local.setUint32(14, crc32(data), true);
    local.setUint32(18, packed.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(10, 8, true);
    central.setUint32(16, crc32(data), true);
    central.setUint32(20, packed.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, 1, true);
    end.setUint16(10, 1, true);
    end.setUint32(12, 46 + name.length, true);
    end.setUint32(16, 30 + name.length + packed.length, true);
    const parts = [new Uint8Array(local.buffer), name, packed, new Uint8Array(central.buffer), name, new Uint8Array(end.buffer)];
    const zip = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      zip.set(p, at);
      at += p.length;
    }
    expect((await unzip(zip))!.get("x.txt")).toEqual(data);
  });

  it("checks with the CRC-32 everyone uses", () => {
    expect(crc32(utf8.encode("123456789"))).toBe(0xcbf43926);
  });
});

// the smallest PNG: one white pixel
const PIXEL = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"),
  (c) => c.charCodeAt(0),
);

describe("text in a PNG", () => {
  it("is put in before its end and read back, and is not found where it is not", () => {
    const png = withText(PIXEL, "meno-structure", '{"a":"é"}');
    expect(textOf(png, "meno-structure")).toBe('{"a":"é"}');
    expect(textOf(png, "other")).toBeNull();
    expect(textOf(PIXEL, "meno-structure")).toBeNull();
    // still ending as a PNG must
    expect(new TextDecoder().decode(png.subarray(png.length - 8, png.length - 4))).toBe("IEND");
    expect(() => withText(new Uint8Array(4), "k", "t")).toThrow();
  });
});

describe("gvmlPicture", () => {
  it("packages one picture, at its size, and gives the picture back", async () => {
    const image = new Uint8Array([1, 2, 3, 4]);
    const pkg = gvmlPicture(image, "emf", 100, 50, "Structure", 'a "quoted" <name>');
    const files = (await unzip(pkg))!;
    expect([...files.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "clipboard/drawings/_rels/drawing1.xml.rels",
      "clipboard/drawings/drawing1.xml",
      "clipboard/media/image1.emf",
    ]);
    const drawing = new TextDecoder().decode(files.get("clipboard/drawings/drawing1.xml"));
    expect(drawing).toContain('cx="1270000" cy="635000"');
    expect(drawing).toContain('descr="a &quot;quoted&quot; &lt;name&gt;"');
    expect(await gvmlImages(pkg)).toEqual([{ name: "clipboard/media/image1.emf", data: image }]);
    expect(await gvmlImages(new Uint8Array([9, 9]))).toEqual([]);
  });
});
