import { describe, expect, it } from "vitest";
import { placeQuickAdd } from "./quickAddPlace";

describe("placeQuickAdd", () => {
  const within = { width: 1000, height: 800 };
  const row = { width: 200, height: 44 };
  const open = { width: 300, height: 200 };

  it("opens up and to the right of the point; a panel opening grows down from its row, which stays", () => {
    expect(placeQuickAdd(400, 500, within, row, [row, open])).toEqual({ left: 414, top: 442, origin: "bottom left" });
  });

  it("opens below the point where there is no room above", () => {
    expect(placeQuickAdd(400, 40, within, row, [row, open])).toEqual({ left: 414, top: 54, origin: "top left" });
  });

  it("stands higher near the bottom, so that its largest fits, chosen as it opens", () => {
    expect(placeQuickAdd(400, 700, within, row, [row, open]).top).toBe(596);
  });

  it("goes to the left of the point where its largest would not fit to the right, room made for its largest", () => {
    // (the row alone would fit to the right; with its calculations open it would not)
    expect(placeQuickAdd(750, 500, within, row, [row, open])).toEqual({ left: 436, top: 442, origin: "bottom right" });
    expect(placeQuickAdd(750, 500, within, row, [row]).left).toBe(764);
  });

  it("stays inside a canvas too small for it on either side", () => {
    expect(placeQuickAdd(160, 120, { width: 320, height: 240 }, row, [row, open])).toMatchObject({ left: 16, top: 36 });
  });
});
