import { describe, expect, it } from "vitest";
import { energiesOf, type EnergyLines } from "./xyzEnergies";

describe("an XYZ file's energies", () => {
  it("are found as CREST, xtb and ORCA write them", () => {
    expect(energiesOf(["  -40.1234567", "  -40.1200000"])).toEqual([-40.1234567, -40.12]);
    expect(energiesOf([" energy: -1.17 gnorm: 0.01 xtb: 6.7.1", " energy: -1.16 gnorm: 0.001"])).toEqual([-1.17, -1.16]);
    expect(energiesOf(["Coordinates from ORCA-job input E -1.17", "Coordinates from ORCA-job input E -1.18"])).toEqual([-1.17, -1.18]);
  });

  it("are none where a frame has none, or there is only the one", () => {
    expect(energiesOf(["-1.17", "a title"])).toBeUndefined();
    expect(energiesOf(["-1.17"])).toBeUndefined();
  });

  it("are the first way's that finds one on every frame", () => {
    const none: EnergyLines = () => undefined;
    const ones: EnergyLines = (c) => c.map(() => 1);
    expect(energiesOf(["a", "b"], [none, ones])).toEqual([1, 1]);
    expect(energiesOf(["a", "b"], [none])).toBeUndefined();
  });
});
