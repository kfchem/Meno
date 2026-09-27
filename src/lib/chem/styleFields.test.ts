import { describe, expect, it } from "vitest";
import { ACS_1996, DEFAULT_STYLE_CHOICE, pt, ofBond, STYLE_PRESETS, type DrawingStyle } from "./style";
import {
  acceptStyleChoice,
  acceptValue,
  automaticValue,
  STYLE_FIELDS,
  STYLE_GROUPS,
  withSetting,
} from "./styleFields";

/** Every setting a style has, the ones that may be left unset among them. */
const EVERY_SETTING: (keyof DrawingStyle)[] = [
  ...(Object.keys(ACS_1996) as (keyof DrawingStyle)[]),
  "tripleGap",
  "wedgeBroadEnd",
  "hashStartOffset",
];

describe("the settings list", () => {
  it("has every setting once, and nothing that is not one", () => {
    const keys = STYLE_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...new Set(EVERY_SETTING)].sort());
  });

  it("gives every setting a name, a description and a group, each name its own", () => {
    const labels = STYLE_FIELDS.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const f of STYLE_FIELDS) {
      expect(f.label.length).toBeGreaterThan(3);
      expect(f.description).toMatch(/\.$/);
      expect(STYLE_GROUPS).toContain(f.group);
    }
  });

  it("offers Automatic for exactly the settings that may be left unset", () => {
    const optional = STYLE_FIELDS.filter((f) => f.automatic).map((f) => f.key);
    expect(optional.sort()).toEqual(["hashStartOffset", "tripleGap", "wedgeBroadEnd"]);
    expect(automaticValue("tripleGap", ACS_1996)).toEqual(ACS_1996.doubleGap);
    expect(automaticValue("hashStartOffset", ACS_1996)).toEqual(ACS_1996.hashInterval);
    expect(automaticValue("wedgeBroadEnd", ACS_1996)).toEqual(pt(3));
  });

  it("takes every preset's own values as they are", () => {
    for (const { style } of STYLE_PRESETS) {
      for (const f of STYLE_FIELDS) {
        const v = style[f.key];
        if (v === undefined) continue;
        expect(acceptValue(f, v, style.bondLengthPt), `${f.key}`).toEqual(v);
      }
    }
  });
});

describe("reading a style choice back", () => {
  it("keeps what it can take and drops what it cannot", () => {
    const choice = acceptStyleChoice({
      preset: "rsc",
      changes: {
        lineThickness: pt(0.8),
        doubleGap: ofBond(0.2),
        bondColor: "#1F4E79",
        ends: "round",
        fontFamily: "Comic Sans MS",
        labelColor: "red",
        hashInterval: { value: "2", unit: "pt" },
        waveAmplitude: { value: 1, unit: "mm" },
        notASetting: 3,
      },
    });
    expect(choice).toEqual({
      preset: "rsc",
      changes: {
        lineThickness: pt(0.8),
        doubleGap: ofBond(0.2),
        bondColor: "#1f4e79",
        ends: "round",
      },
    });
  });

  it("brings a number into range, a share of the bond by the bond it is a share of", () => {
    const choice = acceptStyleChoice({
      preset: "acs1996",
      changes: {
        bondLengthPt: 20,
        lineThickness: pt(50),
        // at most 8 pt, which is 40% of a 20 pt bond
        doubleGap: ofBond(0.9),
        doubleCrowdingAngle: -5,
      },
    });
    expect(choice.changes.lineThickness).toEqual(pt(3));
    expect(choice.changes.doubleGap?.value).toBeCloseTo(0.4, 12);
    expect(choice.changes.doubleCrowdingAngle).toBe(0);
  });

  it("falls back to the default for anything that is not a choice", () => {
    expect(acceptStyleChoice(undefined)).toBe(DEFAULT_STYLE_CHOICE);
    expect(acceptStyleChoice({ preset: "nope", changes: {} })).toBe(DEFAULT_STYLE_CHOICE);
    expect(acceptStyleChoice({ preset: "wiley" })).toEqual({ preset: "wiley", changes: {} });
  });
});

describe("changing one setting", () => {
  it("records a change, and drops it again once it is the preset's own value", () => {
    const acs = { preset: "acs1996", changes: {} };
    const changed = withSetting(acs, "ends", "round");
    expect(changed.changes).toEqual({ ends: "round" });
    expect(withSetting(changed, "ends", "square").changes).toEqual({});
    // Meno's own has round ends already
    expect(withSetting(DEFAULT_STYLE_CHOICE, "ends", "round").changes).toEqual({});
    // a length in another unit is a change, even if it comes to the same
    expect(withSetting(DEFAULT_STYLE_CHOICE, "lineThickness", ofBond(0.6 / 14.4)).changes)
      .toHaveProperty("lineThickness");
    // left unset: automatic again
    const own = withSetting(DEFAULT_STYLE_CHOICE, "tripleGap", pt(3));
    expect(withSetting(own, "tripleGap", undefined).changes).toEqual({});
  });
});
