import { describe, expect, it } from "vitest";
import { ACS_1996, RSC } from "./style";
import { SAMPLE_BONDS, SAMPLE_MOLECULE, sampleSvg } from "./styleSamples";

const widthOf = (svg: string) => Number(/ width="([\d.e]+)"/.exec(svg)![1]);

describe("the style samples", () => {
  it("draw the molecule's labels and every kind of bond", () => {
    const svg = sampleSvg(SAMPLE_MOLECULE, ACS_1996);
    for (const run of [">Cl<", ">O<", ">N<", ">H<", ">2<"]) expect(svg).toContain(run);
    expect(SAMPLE_BONDS).toHaveLength(11);
    for (const s of SAMPLE_BONDS) expect(sampleSvg(s, ACS_1996)).toMatch(/^<svg /);
    // the ring has its circle
    expect(sampleSvg(SAMPLE_BONDS[10], ACS_1996)).toContain("<circle");
  });

  it("come out at the size they have on the page, times the magnification", () => {
    const single = SAMPLE_BONDS[0];
    const acs = widthOf(sampleSvg(single, ACS_1996));
    // one 14.4 pt bond, at 96 px to the inch, and the margins
    expect(acs).toBeGreaterThan((14.4 * 96) / 72);
    expect(acs).toBeLessThan((14.4 * 96) / 72 + 16);
    // the margin round it is 6 px however far it is magnified
    expect(widthOf(sampleSvg(single, ACS_1996, 3)) - 12).toBeCloseTo((acs - 12) * 3, 6);
    expect(widthOf(sampleSvg(single, RSC))).toBeLessThan(acs);
  });
});
