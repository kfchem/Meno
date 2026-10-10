import { describe, expect, it } from "vitest";
import { labelKey, labelReading, labelTextOf, readLabel } from "./labelTyping";
import { keptLabel, liveLabel } from "../../../../lib/chem/smartLabel";

describe("labelKey", () => {
  it("starts a label with the letter typed", () => {
    expect(labelKey({ key: "a", code: "KeyA", keyCode: 65 })).toBe("a");
    expect(labelKey({ key: "N", code: "KeyN", keyCode: 78 })).toBe("N");
  });

  it("takes the key pressed, not the input method's, with Japanese input on", () => {
    // WebKit gives an input method's key as "Process" (or the kana) and 229
    expect(labelKey({ key: "Process", code: "KeyA", keyCode: 229 })).toBe("a");
    expect(labelKey({ key: "あ", code: "KeyA", keyCode: 229, isComposing: true })).toBe("a");
  });

  it("starts nothing for other keys", () => {
    expect(labelKey({ key: "1", code: "Digit1", keyCode: 49 })).toBeNull();
    expect(labelKey({ key: "Enter", code: "Enter", keyCode: 13 })).toBeNull();
    expect(labelKey({ key: "Process", code: "Digit1", keyCode: 229 })).toBeNull();
  });
});

describe("a label read as it is meant (lib/chem/smartLabel)", () => {
  const kept = (t: string) => keptLabel(t, labelReading);
  const live = (t: string) => liveLabel(t, labelReading);

  it("reads letters typed small as capitals where that makes a label - the fewest letters changed", () => {
    // (the maintainer's examples)
    expect(kept("nh2")).toBe("NH2");
    expect(kept("obz")).toBe("OBz");
    expect(kept("hnfmoc")).toBe("NHFmoc");
    for (const [typed, label] of [
      ["otbs", "OTBS"], ["co2me", "CO2Me"], ["cf3", "CF3"], ["no2", "NO2"], ["nme2", "NMe2"], ["pph3", "PPh3"],
      ["sime3", "SiMe3"], ["ph", "Ph"], ["bn", "Bn"], ["ipr", "iPr"], ["oh", "OH"], ["sh", "SH"], ["tbs", "TBS"],
      ["nh3+", "NH3+"], ["13c", "13C"], ["r1", "R1"], ["2,6-dimebz", "2,6-diMeBz"], ["4-meoc6h4", "4-MeOC6H4"],
    ]) expect(kept(typed)).toBe(label);
    // (capitals typed stay: Co is cobalt, CO is not read)
    expect(kept("Co")).toBe("Co");
    // (what reads as it was typed stays: lowercase names)
    for (const name of ["dppf", "cod", "py"]) expect(kept(name)).toBe(name);
  });

  it("reads part of a structure before a whole molecule: an element or a group, not a complex or a reagent", () => {
    // (Co2Me reads as a complex of cobalt; CO2Me, the ester, is a group; HF is a reagent, Hf an element)
    expect(kept("co2me")).toBe("CO2Me");
    expect(kept("come")).toBe("COMe");
    expect(kept("hf")).toBe("Hf");
    expect(kept("co")).toBe("Co");
    for (const el of ["Cs", "Sn", "Os", "Pb"]) expect(kept(el.toLowerCase())).toBe(el);
  });

  it("reads no element after uranium from letters typed small", () => {
    expect(kept("nh")).toBe("NH");
    expect(kept("cn")).toBe("CN");
    expect(kept("no")).toBe("NO");
    expect(kept("lr")).toBe("LR");
    // (a group named as such an element is the group)
    expect(kept("ts")).toBe("Ts");
    expect(kept("fm")).toBe("Fm");
    // (nothing else to read: as typed)
    expect(kept("np")).toBe("np");
    // (typed as the symbol is written: the element)
    expect(kept("No")).toBe("No");
  });

  it("keeps a label typed as it is drawn on a bond's left as it reads from the bond - as it is shown, the letters as typed", () => {
    for (const [typed, shown, label] of [
      ["aco", "AcO", "OAc"], ["meo", "MeO", "OMe"], ["bochn", "BocHN", "NHBoc"], ["ho2c", "HO2C", "CO2H"],
      ["h2n", "H2N", "NH2"], ["f3c", "F3C", "CF3"], ["hnfmoc", "HNFmoc", "NHFmoc"],
    ]) {
      expect(live(typed)).toBe(shown);
      expect(kept(typed)).toBe(label);
    }
  });

  it("hyphenates an italic prefix, and leaves iPr as it is", () => {
    expect(kept("tbu")).toBe("t-Bu");
    expect(kept("sbu")).toBe("s-Bu");
    expect(kept("nbu")).toBe("n-Bu");
    expect(kept("co2tbu")).toBe("CO2t-Bu");
    expect(kept("ipr")).toBe("iPr");
  });

  it("leaves what reads as nothing as typed - no capital made", () => {
    expect(kept("x")).toBe("x");
    expect(kept("lg")).toBe("lg");
    expect(kept("")).toBe("");
  });

  it("reads condensed formulas as groups, by the H that makes a molecule of each", () => {
    for (const [typed, label] of [
      ["och3", "OCH3"], ["ch2oh", "CH2OH"], ["so2me", "SO2Me"], ["ocome", "OCOMe"], ["co2ch3", "CO2CH3"],
      ["conhme", "CONHMe"], ["cocl", "COCl"], ["ch2ph", "CH2Ph"], ["ochf2", "OCHF2"],
    ]) expect(kept(typed)).toBe(label);
  });

  it("reads a group named as an element is as the group (the maintainer, 2026-10-10)", () => {
    for (const g of ["Ac", "Pr", "Ts", "Fm", "At"]) expect(labelReading(g)).toEqual({ whole: false });
    expect(labelReading("Co")).toEqual({ whole: false, element: "Co" });
    expect(labelReading("HF")).toEqual({ whole: true });
    expect(labelReading("nh2")).toBeNull();
  });
});

describe("readLabel", () => {
  const isElement = (s: string) => ["C", "N", "O", "Fe", "Na", "Cl", "S"].includes(s);
  it("reads an element with its charge, H and mass number", () => {
    expect(readLabel("N+", isElement)).toEqual({ kind: "element", el: "N", charge: 1 });
    expect(readLabel("O-", isElement)).toEqual({ kind: "element", el: "O", charge: -1 });
    expect(readLabel("NH3+", isElement)).toEqual({ kind: "element", el: "N", charge: 1 });
    expect(readLabel("Fe2+", isElement)).toEqual({ kind: "element", el: "Fe", charge: 2 });
    expect(readLabel("Fe+2", isElement)).toEqual({ kind: "element", el: "Fe", charge: 2 });
    expect(readLabel("N++", isElement)).toEqual({ kind: "element", el: "N", charge: 2 });
    expect(readLabel("O−", isElement)).toEqual({ kind: "element", el: "O", charge: -1 });
    expect(readLabel("13C", isElement)).toEqual({ kind: "element", el: "C", charge: 0, isotope: 13 });
    expect(readLabel("OH", isElement)).toEqual({ kind: "element", el: "O", charge: 0 });
  });

  it("reads a charge alone as one for the atom as it is", () => {
    expect(readLabel("+", isElement)).toEqual({ kind: "charge", charge: 1 });
    expect(readLabel("2-", isElement)).toEqual({ kind: "charge", charge: -2 });
  });

  it("keeps anything else as a label, as typed", () => {
    expect(readLabel("OMe", isElement)).toEqual({ kind: "text", el: "OMe" });
    expect(readLabel("CO2H", isElement)).toEqual({ kind: "text", el: "CO2H" });
    expect(readLabel("Me", isElement)).toEqual({ kind: "text", el: "Me" });
  });
});

describe("labelTextOf", () => {
  it("types an atom's label back as readLabel reads it", () => {
    expect(labelTextOf({ el: "N", charge: 1 })).toBe("N+");
    expect(labelTextOf({ el: "Fe", charge: 2 })).toBe("Fe2+");
    expect(labelTextOf({ el: "O", charge: -1 })).toBe("O-");
    expect(labelTextOf({ el: "C", isotope: 13 })).toBe("13C");
    expect(labelTextOf({ el: "C", charge: 1 })).toBe("C+");
    expect(labelTextOf({ el: "C" })).toBe("");
    expect(labelTextOf({ el: "O" })).toBe("O");
  });
});
