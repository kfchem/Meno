import { describe, expect, it } from "vitest";
import { energiesOf, type CalcReader } from "./readers";

describe("calculation readers", () => {
  it("find each frame's energy as CREST, xtb and ORCA write it", () => {
    expect(energiesOf(["  -40.1234567", "  -40.1200000"])).toEqual([-40.1234567, -40.12]);
    expect(energiesOf([" energy: -1.17 gnorm: 0.01 xtb: 6.7.1", " energy: -1.16 gnorm: 0.001"])).toEqual([-1.17, -1.16]);
    expect(energiesOf(["Coordinates from ORCA-job input E -1.17", "Coordinates from ORCA-job input E -1.18"])).toEqual([-1.17, -1.18]);
  });

  it("find none where a frame has none, or there is only the one", () => {
    expect(energiesOf(["-1.17", "a title"])).toBeUndefined();
    expect(energiesOf(["-1.17"])).toBeUndefined();
  });

  it("take the first reader that finds an energy for every frame", () => {
    const none: CalcReader = { id: "none", xyzEnergies: () => undefined };
    const ones: CalcReader = { id: "ones", xyzEnergies: (c) => c.map(() => 1) };
    expect(energiesOf(["a", "b"], [none, ones])).toEqual([1, 1]);
    expect(energiesOf(["a", "b"], [none])).toBeUndefined();
  });
});
