import { describe, expect, it } from "vitest";
import { colouringFor, lineSpans, type Span } from "./colouring";
import { Lines } from "./editing";
import { registered } from "../io/kinds";
import { acceptManifest } from "../plugins/manifest";
import { MANIFESTS } from "../plugins/known";

/** The parts of a line coloured, as the words they colour. */
function toned(name: string, text: string, line: number, among = registered([]), colouring = colouringFor(name, text, among.kinds, among.written)): [string, string][] {
  const lines = new Lines(text);
  const l = lines.line(line);
  return (colouring?.spans(lines, line) ?? []).map((s: Span) => [l.slice(s.from, s.to), s.tone]);
}

/** A plugin that brings a kind, and writes one, each coloured. */
const plugin = acceptManifest({
  id: "demo",
  name: "Demo",
  version: "1",
  environment: { maker: "uv", lock: "requirements.lock" },
  worker: "worker.py",
  reads: ["demo-out"],
  kinds: [
    {
      id: "demo-out",
      name: "Demo output",
      extensions: [".out"],
      marks: [{ text: "D E M O program" }],
      colours: { warnings: [{ text: "[WARNING]", at: "line-start" }], errors: [{ text: "finished by error termination" }], keywords: [{ text: "#", at: "line-start" }] },
    },
  ],
  writes: [{ id: "demo-in", name: "Demo input", extensions: [".din"], takes: "molecule", options: [], colours: { keywords: [{ text: "#", at: "line-start" }, { text: "%", at: "line-start" }], comments: [{ text: "!" }] } }],
})!;

describe("a text's colours", () => {
  it("are a Python script's by its grammar: keywords, strings, numbers, comments, what a definition names", () => {
    const py = "def energy(x):\n    return 2.5 * x  # in hartree\nname = 'water'\n";
    expect(toned("run.py", py, 0)).toEqual([
      ["def", "keyword"],
      ["energy", "name"],
    ]);
    expect(toned("run.py", py, 1)).toEqual([
      ["return", "keyword"],
      ["2.5", "number"],
      ["# in hartree", "comment"],
    ]);
    expect(toned("run.py", py, 2)).toEqual([["'water'", "string"]]);
  });

  it("are JSON's and XML's", () => {
    expect(toned("a.json", '{"charge": 0, "ok": true, "name": "w"}', 0)).toEqual([
      ['"charge"', "property"],
      ["0", "number"],
      ['"ok"', "property"],
      ["true", "number"],
      ['"name"', "property"],
      ['"w"', "string"],
    ]);
    expect(toned("a.xml", '<atom id="a1"/><!-- note -->', 0)).toEqual([
      ["atom", "tag"],
      ["id", "attribute"],
      ['"a1"', "string"],
      ["<!-- note -->", "comment"],
    ]);
  });

  it("are a long text's as far as it is read, and again from where it changed", () => {
    const rows = Array.from({ length: 40_000 }, (_, i) => `  {"step": ${i}, "energy": -76.4},`);
    const text = `[\n${rows.join("\n")}\n  {"step": -1}\n]\n`;
    const colouring = colouringFor("long.json", text)!;
    const lines = new Lines(text);
    // (its end, read: parsed that far)
    expect(colouring.spans(lines, lines.count - 3).map((s) => s.tone)).toEqual(["property", "number"]);
    // (a word typed at its start: its lines as before, the line changed as it is now)
    const typed = text.replace('"step": 0,', '"step": 0, "spin": "singlet",');
    const after = new Lines(typed);
    expect(colouring.spans(after, 1).map((s) => s.tone)).toEqual(["property", "number", "property", "string", "property", "number"]);
    expect(colouring.spans(after, after.count - 3).map((s) => s.tone)).toEqual(["property", "number"]);
  });

  it("are a calculation's output's as its plugin says: errors and warnings, all the line; numbers standing alone", () => {
    const among = registered([plugin]);
    const out = "  D E M O program\n[WARNING] Hessian on incompletely optimized geometry!\nE(SCF) = -76.40892 Eh after 12 cycles with 6-31G(d) def2\nDemo finished by error termination in SCF\n";
    expect(toned("water.out", out, 1, among)).toEqual([["[WARNING] Hessian on incompletely optimized geometry!", "warning"]]);
    expect(toned("water.out", out, 2, among)).toEqual([
      ["-76.40892", "number"],
      ["12", "number"],
    ]);
    expect(toned("water.out", out, 3, among)).toEqual([["Demo finished by error termination in SCF", "error"]]);
    // (no plugin added that colours it: as it is)
    expect(colouringFor("water.out", out, registered([]).kinds, [])).toBeNull();
  });

  it("are a written kind's by its file's name: keywords, and comments to the line's end", () => {
    const among = registered([plugin]);
    const input = "%NProcShared=4\n#p B3LYP/6-31G(d) opt ! tighter later\n\n0 1\nO 0.0 0.0 0.0\n";
    expect(toned("water.din", input, 0, among)).toEqual([["%NProcShared=4", "keyword"]]);
    expect(toned("water.din", input, 1, among)).toEqual([
      ["#p B3LYP/6-31G(d) opt", "keyword"],
      ["! tighter later", "comment"],
    ]);
    expect(toned("water.din", input, 4, among)).toEqual([
      ["0.0", "number"],
      ["0.0", "number"],
      ["0.0", "number"],
    ]);
  });

  it("are told by marks, never a pattern - a manifest's colours read as data", () => {
    expect(plugin.kinds[0].colours?.errors).toEqual([{ text: "finished by error termination" }]);
    expect(lineSpans("   ", { errors: [{ text: "x" }] })).toEqual([]);
    const odd = acceptManifest({ ...plugin, kinds: [{ ...plugin.kinds[0], colours: { errors: [{ text: 4 }], keywords: "#" } }] })!;
    expect(odd.kinds[0].colours).toBeUndefined();
  });

  it("are as the plugins Meno carries say: two that bring a kind, its colours once; a Gaussian input's route and Link 0", () => {
    const among = registered(MANIFESTS);
    expect(among.kinds.find((k) => k.id === "orca")?.colours).toEqual({ errors: [{ text: "ORCA finished by error termination" }] });
    expect(toned("water.out", " * O R C A *\nORCA finished by error termination in SCF\n", 1, among)).toEqual([["ORCA finished by error termination in SCF", "error"]]);
    expect(toned("water.gjf", "%Chk=water.chk\n#p B3LYP/6-31G(d) Opt\n", 1, among)).toEqual([["#p B3LYP/6-31G(d) Opt", "keyword"]]);
  });
});
