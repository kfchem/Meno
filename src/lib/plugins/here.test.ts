import { describe, expect, it } from "vitest";
import { forThisSystem } from "./here";

describe("a plugin for some systems alone", () => {
  it("is offered on those - one that names none on every one, and any where the system is not known", () => {
    const crest = { systems: ["macos", "linux"] as const };
    expect(forThisSystem(crest, "macos")).toBe(true);
    expect(forThisSystem(crest, "windows")).toBe(false);
    expect(forThisSystem({ systems: [] }, "windows")).toBe(true);
    expect(forThisSystem(crest, null)).toBe(true);
  });
});
