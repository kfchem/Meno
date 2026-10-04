import { describe, expect, it } from "vitest";
import { menuGroups, offerCommands, useTabCommands } from "./commands";

const run = () => {};

describe("menuGroups", () => {
  it("puts the app's commands and the tab's under one heading each, in the menu's order", () => {
    const groups = menuGroups(
      [{ title: "File", items: [{ name: "Open…", run }] }],
      [
        { title: "View", items: [{ name: "Fit to content", run }] },
        { title: "File", items: [{ name: "Save", run }] },
        { title: "Format", items: [] },
        { title: "Edit", items: [{ name: "SMILES…", run }] },
      ],
    );
    expect(groups.map((g) => g.title)).toEqual(["File", "Edit", "View"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["Open…", "Save"]);
  });
});

describe("offerCommands", () => {
  it("lets only the tab that offered take its commands back", () => {
    const takeBackA = offerCommands("a", () => []);
    const takeBackB = offerCommands("b", () => []);
    takeBackA();
    expect(useTabCommands.getState().offer?.owner).toBe("b");
    takeBackB();
    expect(useTabCommands.getState().offer).toBeNull();
  });
});
