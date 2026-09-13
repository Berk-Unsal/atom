import { describe, expect, it } from "vitest";
import { cellIDForTower, filterRayFeatures, rayFeatureCellID, RAY_SCOPE_HIDDEN, RAY_SCOPE_SELECTED } from "./rfVisualization.js";

const features = [
  { properties: { cell_id: "cell-a", signal_dbm: -80 } },
  { properties: { cell_id: "cell-b", signal_dbm: -95 } },
  { properties: { network_tower_index: 1, signal_dbm: -105 } },
];

describe("RF map visualization helpers", () => {
  it("uses the stable cell identity shared by map controls and ray metadata", () => {
    expect(cellIDForTower({ id: "tower-a", cellId: 17 })).toBe("17");
    expect(cellIDForTower({ id: "tower-a" })).toBe("tower-a");
    expect(rayFeatureCellID(features[0])).toBe("cell-a");
    expect(rayFeatureCellID(features[2], ["cell-a", "cell-b"])).toBe("cell-b");
  });

  it("filters only presentation data when selected-cell scope is active", () => {
    expect(filterRayFeatures(features, { scope: "all", selectedCellId: "cell-a" })).toBe(features);
    expect(filterRayFeatures(features, { scope: RAY_SCOPE_SELECTED, selectedCellId: "cell-a" })).toEqual([features[0]]);
    expect(filterRayFeatures(features, { scope: RAY_SCOPE_SELECTED, selectedCellId: "cell-b", cellIDsByIndex: ["cell-a", "cell-b"] })).toEqual([features[1], features[2]]);
    expect(filterRayFeatures(features, { scope: RAY_SCOPE_SELECTED })).toEqual([]);
    expect(filterRayFeatures(features, { scope: RAY_SCOPE_HIDDEN })).toEqual([]);
  });

  it("does not reassign un-attributed rays when map focus changes", () => {
    const untagged = [{ type: "Feature", properties: { signal_dbm: -72 } }];

    expect(filterRayFeatures(untagged, {
      defaultCellId: "cell-a",
      scope: RAY_SCOPE_SELECTED,
      selectedCellId: "cell-a",
    })).toEqual(untagged);
    expect(filterRayFeatures(untagged, {
      defaultCellId: "cell-a",
      scope: RAY_SCOPE_SELECTED,
      selectedCellId: "cell-b",
    })).toEqual([]);
  });
});
