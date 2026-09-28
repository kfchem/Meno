import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { ACS_1996, WILEY } from "../../../lib/chem/style";
import { maxFitZoom, startingZoom } from "./layoutOptions";

describe("startingZoom", () => {
  it("shows a bond two and a half times as long as it prints", () => {
    // ACS 1996's 14.4 pt bond prints 19.2 px long, so comes out at 48 px
    expect(startingZoom(ACS_1996) * NOMINAL_BOND_LENGTH).toBeCloseTo(48, 6);
    // a longer bond in the style, a longer bond on the canvas
    expect(startingZoom(WILEY)).toBeGreaterThan(startingZoom(ACS_1996));
  });

  it("lets a fit zoom in three times as far, and no further", () => {
    expect(maxFitZoom(ACS_1996) / startingZoom(ACS_1996)).toBeCloseTo(3, 9);
  });
});
