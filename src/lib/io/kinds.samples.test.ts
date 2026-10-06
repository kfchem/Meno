import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { kindOf, registered } from "./kinds";
import { MANIFESTS } from "../plugins/known";
import table from "../../../scripts/calc/samples.json";

// Programs' real outputs, where they have been put in calc-samples/ - no
// program's output is committed (scripts/calc/samples.json says where each
// comes from); each is skipped where it is not there.
const SAMPLES = join(process.cwd(), "calc-samples");
const added = registered(MANIFESTS).kinds;

describe("a program's real output, with the plugins Meno carries added", () => {
  for (const s of table.samples) {
    const path = join(SAMPLES, s.file);
    it.skipIf(!existsSync(path))(`is told as ${s.kind}: ${s.file}`, () => {
      const text = readFileSync(path, "utf8");
      expect(kindOf(s.file.split("/").pop()!, text, added)?.id).toBe(s.kind);
      // (and as nothing Meno knows, with none added)
      expect(kindOf(s.file.split("/").pop()!, text)).toBeNull();
    });
  }
});
