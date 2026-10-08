import { describe, expect, it } from "vitest";
import { firstFreeBeside, numbered, takenBeside } from "./beside";

describe("a name beside a file", () => {
  it("is numbered before its extension, which is kept", () => {
    expect(numbered("/runs/job.inp", 2)).toBe("/runs/job-2.inp");
    expect(numbered("C:\\runs\\a.b.gjf", 3)).toBe("C:\\runs\\a.b-3.gjf");
    expect(numbered("/runs/README", 2)).toBe("/runs/README-2");
    expect(numbered("/runs.d/input", 2)).toBe("/runs.d/input-2");
  });

  it("is the first from 2 not there already", async () => {
    expect(firstFreeBeside("/a/x.pdb")).toBe("/a/x-2.pdb");
    const isThere = async (p: string) => p === "/a/x-2.pdb" || p === "/a/x-3.pdb";
    expect(firstFreeBeside("/a/x.pdb", await takenBeside("/a/x.pdb", isThere))).toBe("/a/x-4.pdb");
  });
});
