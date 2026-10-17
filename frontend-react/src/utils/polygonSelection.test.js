import { describe, expect, it } from "vitest";
import { describeAreaSelection, pointInPolygon, selectNearestTowers } from "./polygonSelection.js";

const polygon = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe("polygon selection", () => {
  it("includes cells whose coordinates land on the drawn boundary", () => {
    expect(pointInPolygon([0, 5], polygon)).toBe(true);
    expect(pointInPolygon([5, 5], polygon)).toBe(true);
    expect(pointInPolygon([12, 5], polygon)).toBe(false);
  });

  it("uses stable cell order when candidates are equally close to the centroid", () => {
    const towers = [
      { id: "cell-b", coordinates: [4, 5] },
      { id: "cell-a", coordinates: [6, 5] },
      { id: "cell-c", coordinates: [5, 5] },
    ];
    expect(selectNearestTowers(towers, polygon, 2).map((tower) => tower.id)).toEqual(["cell-c", "cell-a"]);
  });

  it.each([
    [0, 0, "0 Cells found. Draw an area with at least 2 Cells."],
    [1, 0, "1 Cell found. Draw an area with at least 2 Cells."],
    [5, 5, "5 Cells selected from the drawn area."],
    [272, 8, "272 Cells in the area; selected the 8 nearest its centre (network limit 8). Click Cells on the map in Select cells mode to change the selection."],
  ])("describes an area with %i Cells using Cell terminology and the selection rule", (inside, selected, message) => {
    const text = describeAreaSelection(inside, selected, 8);
    expect(text).toBe(message);
    expect(text).not.toMatch(/tower/i);
  });
});
