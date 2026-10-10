/**
 * A text coloured by what it is (docs/PDF.md, *A text*): a Python script,
 * JSON or XML by their usual grammars - Lezer's (MIT), parsed as far as it
 * is read, and from where it was changed, the rest kept - and a
 * calculation's input or output by what its plugin says of its kind
 * (lib/plugins/manifest `Colours`): its keywords, comments, warnings and
 * errors, by marks tried a line at a time, and its numbers, which Meno
 * finds itself. Meno knows no program's format of itself.
 *
 * Each line's colours come as spans of it, each a tone; Meno draws the
 * tones (TextEditor/linePictures).
 */
import { TreeFragment, type Parser, type Tree } from "@lezer/common";
import { highlightTree, tagHighlighter, tags as t, type Highlighter } from "@lezer/highlight";
import { parser as pythonParser } from "@lezer/python";
import { parser as jsonParser } from "@lezer/json";
import { parser as xmlParser } from "@lezer/xml";
import { folded, holdsMark, type Colours, type Mark } from "../plugins/manifest";
import { extensionOf, kindOf, kinds, writtenKinds, type Kind, type WrittenKind } from "../io/kinds";
import type { Lines } from "./editing";

/** What a part of a line is, as it is coloured. */
export type Tone = "keyword" | "string" | "number" | "comment" | "name" | "tag" | "attribute" | "property" | "warning" | "error";
/** A part of a line, in the line's offsets, and what it is. */
export type Span = { from: number; to: number; tone: Tone };

/** A text's colouring: each line's spans, in order and apart, as the text is now. */
export interface Colouring {
  spans(lines: Lines, line: number): Span[];
}

// --- by a grammar -----------------------------------------------------------

/** How much further than the lines asked for a text is parsed at a time. */
const CHUNK = 128 * 1024;

/** The tones of a grammar's parts, each language's: a JSON object's keys, an XML element's names and attributes. */
const SHARED = [
  { tag: t.keyword, class: "keyword" },
  { tag: [t.string, t.character, t.attributeValue], class: "string" },
  { tag: [t.number, t.bool, t.null], class: "number" },
  { tag: t.comment, class: "comment" },
];
const PYTHON = tagHighlighter([...SHARED, { tag: [t.function(t.definition(t.variableName)), t.definition(t.className)], class: "name" }]);
const JSON_TONES = tagHighlighter([...SHARED, { tag: t.propertyName, class: "property" }]);
const XML = tagHighlighter([...SHARED, { tag: t.tagName, class: "tag" }, { tag: t.attributeName, class: "attribute" }]);

/** A text coloured by a grammar: parsed as far as its lines are asked for, and again from where it changed. */
class GrammarColouring implements Colouring {
  private text: string | null = null;
  private tree: Tree | null = null;
  /** How far the tree reaches. */
  private upTo = 0;
  private fragments: readonly TreeFragment[] = [];

  constructor(
    private readonly parser: Parser,
    private readonly highlighter: Highlighter,
  ) {}

  /** The text as it is now: what is the same at either end kept from the tree before. */
  private take(text: string): void {
    if (text === this.text) return;
    if (this.text != null && this.fragments.length) {
      const a = this.text;
      const most = Math.min(a.length, text.length);
      let s = 0;
      while (s < most && a.charCodeAt(s) === text.charCodeAt(s)) s++;
      let e = 0;
      while (e < most - s && a.charCodeAt(a.length - 1 - e) === text.charCodeAt(text.length - 1 - e)) e++;
      this.fragments = TreeFragment.applyChanges(this.fragments, [{ fromA: s, toA: a.length - e, fromB: s, toB: text.length - e }]);
    } else this.fragments = [];
    this.text = text;
    this.tree = null;
    this.upTo = 0;
  }

  /** The tree, reaching `pos` at least. */
  private treeTo(pos: number): Tree {
    const text = this.text!;
    if (this.tree && this.upTo >= Math.min(pos, text.length)) return this.tree;
    const want = Math.min(text.length, Math.max(pos, this.upTo) + CHUNK);
    const parse = this.parser.startParse(text, this.fragments);
    if (want < text.length) parse.stopAt(want);
    let tree: Tree | null = null;
    while (!(tree = parse.advance()));
    this.tree = tree;
    this.upTo = want;
    this.fragments = TreeFragment.addTree(tree, this.fragments, want < text.length);
    return tree;
  }

  spans(lines: Lines, line: number): Span[] {
    this.take(lines.text);
    const from = lines.start(line);
    const to = lines.end(line);
    if (to <= from) return [];
    const out: Span[] = [];
    highlightTree(
      this.treeTo(to),
      this.highlighter,
      (a, b, classes) => {
        const f = Math.max(a, from);
        const e = Math.min(b, to);
        if (e > f) out.push({ from: f - from, to: e - from, tone: classes.split(" ")[0] as Tone });
      },
      from,
      to,
    );
    return out;
  }
}

// --- by a plugin's marks ----------------------------------------------------

/** A number as programs write them: a sign, a point, an exponent - a Fortran D's too. */
const NUMBER = /[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eEdD][-+]?\d+)?/g;
const WORDLIKE = /[\p{L}\p{N}_.]/u;

/** The numbers in a line, from `from` to `to`: each standing alone - no part of a name, as 6-31G or def2. */
function numbersIn(line: string, from: number, to: number, out: Span[]): void {
  NUMBER.lastIndex = from;
  for (let m = NUMBER.exec(line); m && m.index < to; m = NUMBER.exec(line)) {
    const a = m.index;
    const b = Math.min(to, a + m[0].length);
    const before = a > 0 ? line[a - 1] : "";
    const rest = line.slice(a + m[0].length, a + m[0].length + 2);
    // (a letter after it, or a hyphen and more of a name - 6-31G - and it is part of one)
    if ((before && WORDLIKE.test(before)) || /^[\p{L}_]|^[-+][\p{L}\p{N}]/u.test(rest)) continue;
    out.push({ from: a, to: b, tone: "number" });
  }
}

/** Where in a line a mark is, as it is written there; -1 where it is not. */
function placeOf(line: string, mark: Mark): number {
  const said = mark.text.trim();
  const where = mark.anyCase ? line.toLowerCase() : line;
  const what = mark.anyCase ? said.toLowerCase() : said;
  if (mark.at === "line-start") {
    const lead = line.length - line.trimStart().length;
    return where.startsWith(what, lead) ? lead : -1;
  }
  return where.indexOf(what);
}

/**
 * A line coloured as its kind's plugin says: all of it an error, or a
 * warning, where it holds one's mark; else a comment from where one's mark
 * begins it, and before that keywords, where it holds one's mark, or its
 * numbers.
 */
export function lineSpans(line: string, c: Colours): Span[] {
  if (!line.trim()) return [];
  const head = folded(line);
  const holds = (marks: Mark[] | undefined, within = head) => (marks ?? []).some((m) => holdsMark(within, m));
  if (holds(c.errors)) return [{ from: 0, to: line.length, tone: "error" }];
  if (holds(c.warnings)) return [{ from: 0, to: line.length, tone: "warning" }];
  let comment = line.length;
  for (const m of c.comments ?? []) {
    const at = placeOf(line, m);
    if (at >= 0 && at < comment) comment = at;
  }
  const out: Span[] = [];
  const before = line.slice(0, comment);
  if (before.trim()) {
    if (holds(c.keywords, folded(before))) out.push({ from: line.length - line.trimStart().length, to: before.trimEnd().length, tone: "keyword" });
    else numbersIn(line, 0, comment, out);
  }
  if (comment < line.length) out.push({ from: comment, to: line.length, tone: "comment" });
  return out;
}

class LineColouring implements Colouring {
  constructor(private readonly colours: Colours) {}
  spans(lines: Lines, line: number): Span[] {
    return lineSpans(lines.line(line), this.colours);
  }
}

// --- which ------------------------------------------------------------------

/** The grammars, by the names their files go by. */
const GRAMMARS: Record<string, { parser: Parser; highlighter: Highlighter }> = {
  ".py": { parser: pythonParser, highlighter: PYTHON },
  ".json": { parser: jsonParser, highlighter: JSON_TONES },
  ".xml": { parser: xmlParser, highlighter: XML },
};

/**
 * How a text is coloured: by a grammar, where its name says it is Python,
 * JSON or XML; else as the kind it is told to be says, where a plugin
 * added colours it - by what it holds (lib/io/kinds), or, a kind a plugin
 * writes, by its name; else not at all.
 */
export function colouringFor(name: string, text: string, among: readonly Kind[] = kinds(), written: readonly WrittenKind[] = writtenKinds()): Colouring | null {
  const ext = extensionOf(name);
  const grammar = GRAMMARS[ext];
  if (grammar) return new GrammarColouring(grammar.parser, grammar.highlighter);
  const kind = kindOf(name, text, among);
  if (kind?.colours) return new LineColouring(kind.colours);
  const w = ext ? written.find((k) => k.extensions.includes(ext)) : undefined;
  return w ? new LineColouring(w.colours) : null;
}
