import { afterEach, describe, expect, it } from "vitest";
import { useNetwork } from "./net/network";
import { mayLook, UPDATE_PURPOSE } from "./update";

describe("keeping Meno up to date", () => {
  afterEach(() => useNetwork.setState({ offline: false, granted: [] }));

  it("looks only when it is allowed to and Meno is online", () => {
    useNetwork.setState({ offline: false, granted: [] });
    expect(mayLook()).toBe(false);
    useNetwork.setState({ offline: false, granted: [UPDATE_PURPOSE] });
    expect(mayLook()).toBe(true);
    // offline mode wins over the leave given
    useNetwork.setState({ offline: true, granted: [UPDATE_PURPOSE] });
    expect(mayLook()).toBe(false);
  });

  it("goes by a purpose Meno's settings keep", () => {
    // (a purpose the settings file would drop is one never asked for again)
    expect(UPDATE_PURPOSE).toMatch(/^[a-z0-9:-]{1,64}$/);
  });
});
