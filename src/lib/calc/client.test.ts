import { describe, expect, it } from "vitest";
import { ReaderClient } from "./client";

/** A worker's two ends, by hand: what the client sent, and a way to answer. */
function fakeWorker() {
  const sent: Record<string, unknown>[] = [];
  let hear: (line: string) => void = () => {};
  const transport = {
    send: (line: string) => void sent.push(JSON.parse(line)),
    listen: (f: (line: string) => void) => {
      hear = f;
      return () => (hear = () => {});
    },
  };
  return { sent, transport, say: (m: unknown) => hear(typeof m === "string" ? m : JSON.stringify(m)) };
}

describe("a reader's worker, asked", () => {
  it("is ready when it says so, with its version", async () => {
    const w = fakeWorker();
    const client = new ReaderClient("cclib", w.transport);
    w.say("a line cclib printed on its way in");
    w.say({ event: "ready", reader: "cclib", version: "1.9rc1" });
    expect(await client.ready).toBe("1.9rc1");
  });

  it("is sent a file's kind, name and text, and answers with what it read", async () => {
    const w = fakeWorker();
    const client = new ReaderClient("cclib", w.transport);
    const reading = client.read("orca", "job.out", "the text");
    expect(w.sent).toEqual([{ id: 1, op: "read", kind: "orca", name: "job.out", text: "the text" }]);
    w.say({ id: 1, ok: true, result: { atoms: ["H", "H"], frames: [[0, 0, 0, 0, 0, 0.74]] } });
    expect(await reading).toEqual({ atoms: ["H", "H"], frames: [[0, 0, 0, 0, 0, 0.74]] });
  });

  it("says why, when it cannot read a file, or stops before it has", async () => {
    const w = fakeWorker();
    const client = new ReaderClient("cclib", w.transport);
    const bad = client.read("orca", "x.out", "nothing");
    w.say({ id: 1, ok: false, error: "cclib found no molecule in x.out" });
    await expect(bad).rejects.toThrow("cclib found no molecule in x.out");
    const waiting = client.read("orca", "y.out", "text");
    client.close();
    await expect(waiting).rejects.toThrow("the cclib reader stopped");
  });

  it("gives up on what takes too long", async () => {
    const w = fakeWorker();
    const client = new ReaderClient("cclib", w.transport, 10);
    await expect(client.read("orca", "big.out", "text")).rejects.toThrow("cclib did not finish reading big.out in time");
  });

  it("is asked whether a file is of a kind it tells itself, and is taken at its word only where it says yes", async () => {
    const w = fakeWorker();
    const client = new ReaderClient("nbo", w.transport);
    const asked = client.probe("nbo-out", "job.47", "the start");
    expect(w.sent).toEqual([{ id: 1, op: "probe", kind: "nbo-out", name: "job.47", head: "the start" }]);
    w.say({ id: 1, ok: true, result: { yes: true } });
    expect(await asked).toBe(true);
    const maybe = client.probe("nbo-out", "x.47", "else");
    w.say({ id: 2, ok: true, result: { yes: "perhaps" } });
    expect(await maybe).toBe(false);
  });
});
