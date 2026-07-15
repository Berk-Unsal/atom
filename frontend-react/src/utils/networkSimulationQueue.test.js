import { describe, expect, it } from "vitest";
import { runNetworkSimulationQueue } from "./networkSimulationQueue.js";

describe("runNetworkSimulationQueue", () => {
  it("renders selected cells one at a time and preserves their order", async () => {
    let active = 0;
    let maximumActive = 0;

    const results = await runNetworkSimulationQueue(["a", "b", "c", "d"], async (tower) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return `rendered-${tower}`;
    });

    expect(results).toEqual(["rendered-a", "rendered-b", "rendered-c", "rendered-d"]);
    expect(maximumActive).toBe(1);
  });

  it("does not invoke the renderer for an empty selection", async () => {
    let calls = 0;
    const results = await runNetworkSimulationQueue([], async () => {
      calls += 1;
    });

    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });
});
