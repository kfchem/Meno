import { describe, expect, it } from "vitest";
import { abbreviationOf } from "./abbreviations";

describe("a condensed formula read as a group (./chain)", () => {
  it("is the molecule an H before it makes, without the H: each atom at a valence it has", () => {
    const smiles = (l: string) => abbreviationOf(l)?.smiles;
    expect(smiles("OCH3")).toBe("*[O][CH3]");
    expect(smiles("CH2OH")).toBe("*[CH2][OH]");
    expect(smiles("CH2Ph")).toBe("*[CH2]c1ccccc1");
    // (an O after a carbon that could take no more as a chain: the carbonyl's)
    expect(smiles("COMe")).toBe("*[C](C)=[O]");
    expect(smiles("CO2CH3")).toBe("*[C](=[O])[O][CH3]");
    expect(smiles("OCOMe")).toBe("*[O][C](C)=[O]");
    // (sulfur at six: a sulfonyl)
    expect(smiles("SO2Me")).toBe("*[S](C)(=[O])=[O]");
    expect(smiles("CONHMe")).toBe("*[C](=[O])[NH]C");
    expect(smiles("COCl")).toBe("*[C](=[O])[Cl]");
    expect(smiles("OCHF2")).toBe("*[O][CH]([F])[F]");
    expect(smiles("CH(CH3)2")).toBe("*[CH]([CH3])[CH3]");
    expect(smiles("CH2CN")).toBe("*[CH2]C#N");
    // (nitroso: HNO)
    expect(smiles("NO")).toBe("*[N]=[O]");
  });

  it("reads none where no H before it makes a whole molecule, nor an element as anything else", () => {
    // (HCO, HCH2, HNH are no closed-shell molecules; a charge is none of this)
    for (const no of ["CO", "CH2", "NH", "CH2+", "OO"]) expect(abbreviationOf(no), no).toBeUndefined();
    // (the near misses of typing: elements and groups as they are, not formulas)
    for (const el of ["Co", "Hf", "Np", "Os", "No", "Cs", "Sn", "Nh", "Cn"]) expect(abbreviationOf(el), el).toBeUndefined();
    expect(abbreviationOf("Bn")?.label).toBe("Bn");
    expect(abbreviationOf("CN")?.label).toBe("CN");
  });

  it("leaves the named compositions their names: OAc is acetoxy, not a formula", () => {
    expect(abbreviationOf("OAc")?.name).not.toBe("OAc");
    expect(abbreviationOf("CO2Me")?.smiles).toBe("*C(=O)OC");
  });
});
