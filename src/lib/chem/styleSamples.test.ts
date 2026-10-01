import { describe, expect, it } from "vitest";
import { ACS_1996, RSC, ofBond, resolveStyle } from "./style";
import { arrowSampleSvg, SAMPLE_BONDS, SAMPLE_MOLECULE, sampleSvg } from "./styleSamples";

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

describe("the reaction arrow's sample", () => {
  const heightOf = (svg: string) => Number(/ height="([\d.e]+)"/.exec(svg)![1]);

  it("is one path two bonds long, in the bonds' colour", () => {
    const svg = arrowSampleSvg(resolveStyle(ACS_1996, { bondColor: "#1f4e79" }));
    expect(svg).toMatch(/^<svg /);
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).toContain('fill="#1f4e79"');
    // two 14.4 pt bonds at 96 px to the inch, its square tail and the margins
    const px = (2 * 14.4 * 96) / 72;
    expect(widthOf(svg)).toBeGreaterThan(px + 12);
    expect(widthOf(svg)).toBeLessThan(px + 14);
  });

  it("is as tall as its head is wide", () => {
    const wide = resolveStyle(ACS_1996, { reactionArrowHeadWidth: ofBond(0.5) });
    // (half a bond across, and 6 px either side)
    expect(heightOf(arrowSampleSvg(wide))).toBeCloseTo((0.5 * 14.4 * 96) / 72 + 12, 3);
    expect(heightOf(arrowSampleSvg(ACS_1996))).toBeLessThan(heightOf(arrowSampleSvg(wide)));
  });
});
