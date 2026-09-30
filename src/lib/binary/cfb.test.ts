import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cfbStreams } from "./cfb";

// what Word for Mac put on the pasteboard for a structure Meno served on
// Windows (an alanine and, apart from it, a bond): the object's storage
const object = new Uint8Array(readFileSync(fileURLToPath(new URL("./testdata/word-mac-object.cfb", import.meta.url))));

describe("cfbStreams", () => {
  it("reads every stream of an object Office hands over, small ones from the mini stream", () => {
    const streams = cfbStreams(object)!;
    const sizes = Object.fromEntries([...streams].map(([k, v]) => [k, v.length]));
    expect(sizes).toEqual({
      "/\u0001Ole": 20,
      "/\u0003EPRINT": 15640,
      "/\u0003ObjInfo": 6,
      "/MenoPicture": 15640,
      "/\u0002OlePres000": 18744,
      "/\u0001CompObj": 103,
      "/Meno": 1114,
    });
    const record = JSON.parse(new TextDecoder().decode(streams.get("/Meno")));
    expect(record.format).toBe("meno-structure");
    expect([record.atoms.length, record.bonds.length]).toEqual([8, 6]);
    // the picture is an EMF: its signature where [MS-EMF] puts it
    const pic = streams.get("/MenoPicture")!;
    expect(new DataView(pic.buffer, pic.byteOffset).getUint32(40, true)).toBe(0x464d4520);
  });

  it("reads nothing out of what is not one, or is cut short", () => {
    expect(cfbStreams(new Uint8Array(1024))).toBeNull();
    expect(cfbStreams(object.subarray(0, 700))).toBeNull();
  });
});
