import { beforeEach, describe, expect, it, vi } from "vitest";
import { openUrl } from "@tauri-apps/plugin-opener";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createStructureDocument } from "../document";
import { followLink, goBack, isBackKey, readerOf } from "./pdfColumnReader";
import { pointOn } from "../../../../lib/pdf/column";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));

const A4: [number, number] = [595, 842];

function reading(pages = 12) {
  const doc = createStructureDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  store.getState().addPdfs([{ name: "paper.pdf", sha256: "a".repeat(64), pages: Array.from({ length: pages }, () => A4) }], { x: 0, y: 0 });
  store.getState().readPdf(1);
  const r = readerOf(store);
  r.width = 440;
  r.tall = 800;
  r.take(store.getState().pdfs[0]);
  return { store, r };
}

/** Steps a sixtieth of a second each, until it rests; how many it took. */
function settle(r: ReturnType<typeof reading>["r"]): number {
  let n = 0;
  while (r.step(1 / 60) && n < 1000) n++;
  return n;
}

describe("the column's reader", () => {
  beforeEach(() => vi.mocked(openUrl).mockClear());

  it("comes to rest where it is sent, the page gone to most in view", () => {
    const { r } = reading();
    r.goTo(5);
    expect(settle(r)).toBeLessThan(200);
    expect(r.at).toBe(5);
    expect(r.pageNow().page).toBe(5);
    // (sent a hair short of a page, it still comes to rest)
    r.goal.at = 6.9995;
    expect(settle(r)).toBeLessThan(200);
  });

  it("is moved by fingers at once, and by a wheel's notch in time", () => {
    const { r } = reading();
    r.scrollBy(0, 300, true);
    expect(r.step(1 / 60)).toBe(false);
    const { top } = r.seen();
    expect(top).toBeCloseTo(300);
    r.scrollBy(0, 100, false);
    expect(r.step(1 / 60)).toBe(true);
    settle(r);
    expect(r.seen().top).toBeCloseTo(400);
  });

  it("goes no further than the pages: above the first, or past the last", () => {
    const { r } = reading(2);
    r.scrollBy(0, -500, true);
    expect(r.seen().top).toBe(0);
    r.scrollBy(0, 1e6, false);
    settle(r);
    const { l, top } = r.seen();
    expect(top).toBeCloseTo(l.height - r.tall);
  });

  it("is made larger about the pointer: what is under it stays under it", () => {
    const { r } = reading();
    r.goTo(2);
    settle(r);
    const before = (() => {
      const { l, top, left } = r.seen();
      return pointOn(l, left + 150, top + 300);
    })();
    r.zoomAt(2, 150, 300, false);
    settle(r);
    expect(r.zoom).toBeCloseTo(2);
    const { l, top, left } = r.seen();
    const after = pointOn(l, left + 150, top + 300);
    expect(after.page).toBe(before.page);
    expect(after.u).toBeCloseTo(before.u, 3);
    expect(after.v).toBeCloseTo(before.v, 3);
    r.fitWidth();
    settle(r);
    expect(r.zoom).toBeCloseTo(1);
  });

  it("follows a link in the PDF there, and comes back with Back; a web page opens in the browser, only the web's", () => {
    const { store, r } = reading();
    followLink(store, store.getState().pdfs[0], { rect: [0, 0, 1, 1], page: 7, y: 400 });
    settle(r);
    expect(r.pageNow().page).toBe(7);
    expect(goBack(store, 1)).toBe(true);
    settle(r);
    expect(r.at).toBe(0);
    expect(goBack(store, 1)).toBe(false);
    followLink(store, store.getState().pdfs[0], { rect: [0, 0, 1, 1], uri: "https://example.com/" });
    followLink(store, store.getState().pdfs[0], { rect: [0, 0, 1, 1], uri: "javascript:alert(1)" });
    followLink(store, store.getState().pdfs[0], { rect: [0, 0, 1, 1], uri: "file:///etc/passwd" });
    expect(vi.mocked(openUrl).mock.calls).toEqual([["https://example.com/"]]);
  });

  it("on the stack, the column not showing it, turns its page - Back turning it back", () => {
    const { store } = reading();
    store.getState().closeTexts();
    followLink(store, store.getState().pdfs[0], { rect: [0, 0, 1, 1], page: 4 });
    expect(store.getState().pdfs[0].page).toBe(4);
    expect(goBack(store, 1)).toBe(true);
    expect(store.getState().pdfs[0].page).toBe(0);
  });

  it("hears the system's Back keys", () => {
    const key = (k: Partial<KeyboardEvent>) => ({ metaKey: false, altKey: false, ctrlKey: false, key: "", code: "", ...k }) as KeyboardEvent;
    expect(isBackKey(key({ metaKey: true, key: "[" }))).toBe(true);
    expect(isBackKey(key({ altKey: true, key: "ArrowLeft" }))).toBe(true);
    expect(isBackKey(key({ key: "ArrowLeft" }))).toBe(false);
    expect(isBackKey(key({ ctrlKey: true, key: "[" }))).toBe(false);
  });
});
