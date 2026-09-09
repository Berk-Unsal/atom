import { describe, expect, it } from "vitest";
import { fanOutSelectionOffset, MAX_NETWORK_CELLS, normalizeNetworkSelection, toggleNetworkSelection } from "./networkSelection.js";

const towers = [
  { id: "cell-1" },
  { id: "cell-2" },
  { id: "cell-3" },
  { id: "cell-4" },
  { id: "cell-5" },
  { id: "cell-6" },
  { id: "cell-7" },
];

describe("network selection", () => {
  it("keeps selection state unique, available, ordered, and capped", () => {
    expect(normalizeNetworkSelection([
      "cell-2",
      "missing",
      "cell-2",
      "cell-1",
      "cell-3",
      "cell-4",
      "cell-5",
      "cell-6",
      "cell-7",
    ], towers)).toEqual(["cell-2", "cell-1", "cell-3", "cell-4", "cell-5", "cell-6"]);
  });

  it("removes a selected cell and refuses a seventh cell", () => {
    const selected = towers.slice(0, MAX_NETWORK_CELLS).map((tower) => tower.id);
    expect(toggleNetworkSelection(selected, "cell-3")).toEqual(["cell-1", "cell-2", "cell-4", "cell-5", "cell-6"]);
    expect(toggleNetworkSelection(selected, "cell-7")).toEqual(selected);
  });

  it("gives every overlapping selected cell a distinct badge position", () => {
    const offsets = Array.from({ length: MAX_NETWORK_CELLS }, (_, index) => fanOutSelectionOffset(index, MAX_NETWORK_CELLS).join(","));
    expect(new Set(offsets).size).toBe(MAX_NETWORK_CELLS);
    expect(fanOutSelectionOffset(0, 1)).toEqual([0, 0]);
  });
});
