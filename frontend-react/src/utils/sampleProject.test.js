import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIRST_RUN_CARD_STORAGE_KEY, isFirstRunWorkspace, readFirstRunDismissed, SAMPLE_PROJECT_TEXT, sampleNetworkSelection, writeFirstRunDismissed } from "./sampleProject.js";
import { importProjectFile } from "./projectStore.js";

describe("bundled first-use sample", () => {
  it("is a byte-for-byte copy of examples/ankara-sample.atom-project.json, so it inherits the reliability checks", () => {
    expect(SAMPLE_PROJECT_TEXT).toBe(readFileSync("../examples/ankara-sample.atom-project.json", "utf8"));
    expect(importProjectFile(SAMPLE_PROJECT_TEXT).name).toBe("Ankara First-Use Sample (Imported)");
  });

  it.each([
    [{ projects: [{ id: "p", scenarios: [], draft: null }] }, 0, true],
    [{ projects: [{ id: "p", scenarios: [], draft: { plan: {}, summary: { avgRxDBm: null, calibrationOffsetDB: 0 }, artifacts: { simulation: { geojson: {}, stats: null } } } }] }, 0, true],
    [{ projects: [{ id: "p", scenarios: [], draft: { plan: {}, summary: { avgRxDBm: -72 } } }] }, 0, false],
    [{ projects: [{ id: "p", scenarios: [], draft: { plan: {}, artifacts: { networkOptimization: { stats: { score: 60 } } } } }] }, 0, false],
    [{ projects: [{ id: "p", scenarios: [], draft: null }] }, 1, false],
    [{ projects: [{ id: "p", scenarios: [{ id: "s" }], draft: null }] }, 0, false],
    [{ projects: [{ id: "p", scenarios: [] }, { id: "q", scenarios: [] }] }, 0, false],
    [{ projects: [] }, 0, false],
  ])("treats %j with %i Runs as first run: %s", (workspace, runCount, expected) => {
    expect(isFirstRunWorkspace(workspace, runCount)).toBe(expected);
  });

  it("selects the anchor Cell and its nearest neighbour deterministically", () => {
    const towers = [
      { id: "a", coordinates: [32.85, 39.92] },
      { id: "far", coordinates: [32.95, 39.99] },
      { id: "near", coordinates: [32.852, 39.921] },
      { id: "near-tie", coordinates: [32.848, 39.919] },
    ];
    expect(sampleNetworkSelection(towers, towers[0]).map((tower) => tower.id)).toEqual(["a", "near"]);
    expect(sampleNetworkSelection(towers, null).map((tower) => tower.id)).toEqual(["a", "near"]);
    expect(sampleNetworkSelection([], null)).toEqual([]);
  });

  it("persists dismissal and tolerates unavailable storage", () => {
    const store = new Map();
    const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
    expect(readFirstRunDismissed(storage)).toBe(false);
    writeFirstRunDismissed(storage);
    expect(store.get(FIRST_RUN_CARD_STORAGE_KEY)).toBe("1");
    expect(readFirstRunDismissed(storage)).toBe(true);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readFirstRunDismissed(broken)).toBe(false);
    expect(() => writeFirstRunDismissed(broken)).not.toThrow();
  });
});
