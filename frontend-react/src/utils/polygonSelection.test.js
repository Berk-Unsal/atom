import { describe, expect, it } from "vitest";
import { pointInPolygon, selectNearestTowers } from "./polygonSelection.js";

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
});
