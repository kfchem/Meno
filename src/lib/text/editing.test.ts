import { describe, expect, it } from "vitest";
import { applyEdit, caretAt, letterStep, lineAround, Lines, mapThrough, paragraphStep, plainLines, typed, wordAround, wordStep } from "./editing";
import { commandOf } from "./keys";
import { clausesWithin, composed, composingIn, editOf, lineComposing, windowOf, withTakenAway, AROUND, MOST } from "./field";

describe("a text being edited", () => {
  it("knows its lines: where each begins and ends, and which an offset is on", () => {
    const l = new Lines("ab\ncde\n\nf");
    expect(l.starts).toEqual([0, 3, 7, 8]);
    expect([l.start(1), l.end(1), l.line(1)]).toEqual([3, 6, "cde"]);
    expect(l.end(3)).toBe(9);
    expect([l.at(0), l.at(2), l.at(3), l.at(7), l.at(9)]).toEqual([0, 0, 1, 2, 3]);
  });

  it("is typed into: what is selected replaced, the caret after it; places after moved with it", () => {
    const t = typed("hello world", { anchor: 6, head: 11 }, "there");
    expect(t.text).toBe("hello there");
    expect(t.sel).toEqual(caretAt(11));
    expect(applyEdit("abc", { from: 1, to: 2, insert: "XY" })).toBe("aXYc");
    expect(mapThrough(5, { from: 1, to: 2, insert: "XY" })).toBe(6);
    expect(mapThrough(0, { from: 1, to: 2, insert: "XY" })).toBe(0);
    expect(plainLines("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("moves a letter at a time - an emoji or an accented letter as one, a line's end as one", () => {
    const l = new Lines("éx\n👍🏽y");
    expect(letterStep(l, 0, 1)).toBe(2);
    expect(letterStep(l, 2, -1)).toBe(0);
    expect(letterStep(l, 3, 1)).toBe(4);
    expect(letterStep(l, 4, 1)).toBe(8);
    expect(letterStep(l, 8, -1)).toBe(4);
    expect(letterStep(l, 4, -1)).toBe(3);
  });

  it("moves a word at a time, on to a word's end on a Mac and to the next's start on Windows", () => {
    const l = new Lines("foo bar, baz\nqux");
    expect(wordStep(l, 0, 1, "end")).toBe(3);
    expect(wordStep(l, 3, 1, "end")).toBe(7);
    expect(wordStep(l, 0, 1, "start")).toBe(4);
    expect(wordStep(l, 12, 1, "end")).toBe(13);
    expect(wordStep(l, 9, -1, "end")).toBe(4);
    expect(wordStep(l, 13, -1, "end")).toBe(12);
    expect(wordStep(l, 0, -1, "end")).toBe(0);
  });

  it("selects a word by two clicks, and a line by three; moves a paragraph's edge at a time", () => {
    const l = new Lines("foo bar\nbaz");
    expect(wordAround(l, 5)).toEqual([4, 7]);
    expect(wordAround(l, 7)).toEqual([4, 7]);
    expect(wordAround(l, 3)).toEqual([0, 3]);
    expect(lineAround(l, 2)).toEqual([0, 8]);
    expect(lineAround(l, 9)).toEqual([8, 11]);
    expect(paragraphStep(l, 5, -1)).toBe(0);
    expect(paragraphStep(l, 8, -1)).toBe(0);
    expect(paragraphStep(l, 5, 1)).toBe(7);
    expect(paragraphStep(l, 7, 1)).toBe(11);
  });

  it("selects a Japanese word as a word", () => {
    const l = new Lines("日本語の文章です");
    const [a, b] = wordAround(l, 1);
    expect(a).toBe(0);
    expect(b).toBeGreaterThan(1);
  });
});

describe("an editor's keys", () => {
  it("are a Mac's on a Mac: Option by words, Command to the ends, Control's keys", () => {
    expect(commandOf({ key: "ArrowRight", altKey: true }, true)).toEqual({ kind: "move", unit: "word", dir: 1, extend: false });
    expect(commandOf({ key: "ArrowLeft", metaKey: true, shiftKey: true }, true)).toEqual({ kind: "move", unit: "lineEdge", dir: -1, extend: true });
    expect(commandOf({ key: "ArrowDown", metaKey: true }, true)).toEqual({ kind: "move", unit: "all", dir: 1, extend: false });
    expect(commandOf({ key: "e", ctrlKey: true }, true)).toEqual({ kind: "move", unit: "lineEdge", dir: 1, extend: false });
    expect(commandOf({ key: "k", ctrlKey: true }, true)).toEqual({ kind: "delete", unit: "lineEdge", dir: 1 });
    expect(commandOf({ key: "Backspace", altKey: true }, true)).toEqual({ kind: "delete", unit: "word", dir: -1 });
    expect(commandOf({ key: "Backspace", metaKey: true }, true)).toEqual({ kind: "delete", unit: "lineEdge", dir: -1 });
    // (Home, End and a page move the view, not the caret)
    expect(commandOf({ key: "End" }, true)).toEqual({ kind: "scroll", unit: "all", dir: 1 });
    expect(commandOf({ key: "PageDown" }, true)).toEqual({ kind: "scroll", unit: "page", dir: 1 });
    expect(commandOf({ key: "PageDown", altKey: true }, true)).toEqual({ kind: "move", unit: "page", dir: 1, extend: false });
    expect(commandOf({ key: "a", metaKey: true }, true)).toEqual({ kind: "selectAll" });
    expect(commandOf({ key: "a" }, true)).toBeNull();
  });

  it("are Windows' elsewhere: Ctrl by words, Home and End a line's ends", () => {
    expect(commandOf({ key: "ArrowRight", ctrlKey: true, shiftKey: true }, false)).toEqual({ kind: "move", unit: "word", dir: 1, extend: true });
    expect(commandOf({ key: "Home" }, false)).toEqual({ kind: "move", unit: "lineEdge", dir: -1, extend: false });
    expect(commandOf({ key: "End", ctrlKey: true }, false)).toEqual({ kind: "move", unit: "all", dir: 1, extend: false });
    expect(commandOf({ key: "ArrowDown", ctrlKey: true }, false)).toEqual({ kind: "scroll", unit: "line", dir: 1 });
    expect(commandOf({ key: "Backspace", ctrlKey: true }, false)).toEqual({ kind: "delete", unit: "word", dir: -1 });
    expect(commandOf({ key: "a", ctrlKey: true }, false)).toEqual({ kind: "selectAll" });
    expect(commandOf({ key: "e", ctrlKey: true }, false)).toBeNull();
  });
});

describe("the field typed through", () => {
  it("holds the caret's line and those around it, and what is selected", () => {
    const text = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const l = new Lines(text);
    const w = windowOf(l, caretAt(l.start(10) + 2));
    expect(w.start).toBe(l.start(10 - AROUND));
    expect(w.end).toBe(l.end(10 + AROUND));
    expect(w.text.split("\n")).toHaveLength(2 * AROUND + 1);
    expect(w.sel).toEqual([l.start(10) + 2 - w.start, l.start(10) + 2 - w.start]);
    // (a selection reaching further: it too)
    const wide = windowOf(l, { anchor: l.start(3), head: l.start(10) });
    expect(wide.start).toBe(l.start(3));
    expect(wide.sel).toEqual([0, l.start(10) - l.start(3)]);
    expect(wide.whole).toBe(true);
  });

  it("holds the caret's lines alone where what is selected is too much", () => {
    const text = Array.from({ length: 2000 }, () => "0123456789").join("\n");
    const l = new Lines(text);
    const w = windowOf(l, { anchor: 0, head: text.length });
    expect(w.whole).toBe(false);
    expect(w.end - w.start).toBeLessThanOrEqual(MOST);
    expect(w.sel[0]).toBe(w.sel[1]);
  });

  it("reads what was typed as an edit: in place of what was selected, or else from both ends", () => {
    expect(editOf("ab|cd".replace("|", ""), 2, 2, "abXcd")).toEqual({ from: 2, to: 2, insert: "X" });
    // (a letter typed like the one after the caret, read where the caret was)
    expect(editOf("abc", 2, 2, "abcc")).toEqual({ from: 2, to: 2, insert: "c" });
    expect(editOf("hello world", 6, 11, "hello 世界")).toEqual({ from: 6, to: 11, insert: "世界" });
    expect(editOf("hello", 5, 5, "hello")).toBeNull();
    // (the field changed elsewhere than at the selection)
    expect(editOf("abcdef", 6, 6, "abXdef")).toEqual({ from: 2, to: 3, insert: "X" });
  });

  it("reads what a composition takes the place of: what it said it replaces, or the word it began on, put in again at the caret", () => {
    const before = "化学反応です";
    // (typed at the caret: nothing)
    expect(composingIn(before, "", 2, 2, "か")).toEqual({ at: 2, tail: 4, from: 2, to: 2 });
    // (a word selected, converted again: the word)
    expect(composingIn(before, "反応", 2, 4, "反応")).toEqual({ at: 2, tail: 2, from: 2, to: 4 });
    // (the caret in a word, the word put in again at it: the word after the caret, or before it)
    const after = composingIn(before, "反応", 2, 2, "反応");
    expect(after).toEqual({ at: 2, tail: 4, from: 2, to: 4 });
    expect(composed("化学飯能反応です", after.at, after.tail)).toBe("飯能");
    expect(composingIn(before, "化学", 2, 2, "化学")).toEqual({ at: 2, tail: 4, from: 0, to: 2 });
    expect(composed("化学反応です", 2, 2)).toBe("反応");
    // (the words begun on lying across the caret - their first part taken away first, the rest after it)
    const across = composingIn("これは化学です", "反応です", 5, 5, "反応です");
    expect(across).toEqual({ at: 5, tail: 2, from: 5, to: 7 });
    expect(composed("これは化学反応ですです", across.at, across.tail)).toBe("反応です");
  });

  it("joins what the IME took away first to what its composition then replaces", () => {
    // (これは化学反応|です: 反応 [5, 7) taken away, then 反応です put in at 5 in place of です [5, 7) after)
    expect(withTakenAway(5, 7, 5, 7)).toEqual([5, 9]);
    // (化学| at a line's end: 化学 [3, 5) taken away, then put in again at 3, replacing nothing after)
    expect(withTakenAway(3, 3, 3, 5)).toEqual([3, 5]);
  });

  it("shows a line as the IME composes in it: what it has so far in place of what it replaces", () => {
    // (the line "化学反応です" beginning at 10 in the text)
    expect(lineComposing("化学反応です", 10, { from: 12, to: 12, text: "かが" })).toBe("化学かが反応です");
    expect(lineComposing("化学反応です", 10, { from: 12, to: 14, text: "飯能" })).toBe("化学飯能です");
    // (what it replaces reaching past the line's end, into the next: nothing of the line after it)
    expect(lineComposing("化学反応です", 10, { from: 12, to: 20, text: "はんのう" })).toBe("化学はんのう");
  });

  it("keeps the IME's clauses to what it has so far, where its text changed before it gave them again", () => {
    // (かがくはんのう in two clauses, converted to 科学飯能 before its clauses come again)
    const before = [
      { from: 0, to: 3, thick: true },
      { from: 3, to: 7, thick: false },
    ];
    expect(clausesWithin(before, 7)).toEqual(before);
    expect(clausesWithin(before, 4)).toEqual([
      { from: 0, to: 3, thick: true },
      { from: 3, to: 4, thick: false },
    ]);
    // (a clause lying past it altogether: none)
    expect(clausesWithin(before, 3)).toEqual([{ from: 0, to: 3, thick: true }]);
    expect(clausesWithin(undefined, 3)).toBeUndefined();
  });
});

