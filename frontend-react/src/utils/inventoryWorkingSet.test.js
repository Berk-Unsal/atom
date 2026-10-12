import { describe, expect, it } from "vitest";
import {
  applyInventoryBatchPatch,
  captureViewportSnapshot,
  INVENTORY_PAGE_SIZE,
  isPointInViewport,
  resolveNetworkWorkingSet,
  resolveViewportSnapshot,
  searchInventory,
  sliceInventoryPage,
  viewportBoundsEqual,
} from "./inventoryWorkingSet.js";

const settings = { frequencyGHz: 28, txPowerDbm: 30, radiusMeters: 400, beamWidthDeg: 120 };

describe("Inventory working-set queries", () => {
  it("resolves Network membership in the existing selection order", () => {
    const cells = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(resolveNetworkWorkingSet(cells, ["c", "missing", "a", "c"])).toEqual([cells[2], cells[0]]);
    expect(resolveNetworkWorkingSet(cells, [])).toEqual([]);
  });

  it("includes viewport edges and handles longitude wrap deterministically", () => {
    const bounds = { west: 32.8, east: 33, south: 39.8, north: 40 };
    expect(isPointInViewport([32.8, 39.8], bounds)).toBe(true);
    expect(isPointInViewport([33, 40], bounds)).toBe(true);
    expect(isPointInViewport([33.000001, 40], bounds)).toBe(false);
    expect(isPointInViewport([Number.NaN, 39.9], bounds)).toBe(false);
    expect(isPointInViewport([-179.5, 0], { west: 179, east: -179, south: -1, north: 1 })).toBe(true);
    expect(isPointInViewport([0, 0], { west: -200, east: 200, south: -1, north: 1 })).toBe(true);
  });

  it("keeps captured Cell identities stable until an explicit refresh", () => {
    const cells = [
      { id: "inside", coordinates: [32.9, 39.9] },
      { id: "outside", coordinates: [33.2, 39.9] },
    ];
    const snapshot = captureViewportSnapshot(cells, { west: 32.8, east: 33, south: 39.8, north: 40 });
    expect(snapshot.cellIds).toEqual(["inside"]);

    const movedMapBounds = { west: 33.1, east: 33.3, south: 39.8, north: 40 };
    expect(resolveViewportSnapshot(cells, snapshot).map((cell) => cell.id)).toEqual(["inside"]);
    expect(captureViewportSnapshot(cells, movedMapBounds).cellIds).toEqual(["outside"]);

    const editedCell = { ...cells[0], coordinates: [34, 39.9], rfProfile: { txPowerDbm: 35 } };
    expect(resolveViewportSnapshot([editedCell, cells[1]], snapshot)).toEqual([editedCell]);
  });

  it("compares map bounds at sub-meter precision and across wrapped longitudes", () => {
    expect(viewportBoundsEqual(
      { west: 179, east: 181, south: -1, north: 1 },
      { west: 179.0000002, east: -179, south: -1.0000002, north: 1 },
    )).toBe(true);
    expect(viewportBoundsEqual(
      { west: 32, east: 33, south: 39, north: 40 },
      { west: 32.00001, east: 33, south: 39, north: 40 },
    )).toBe(false);
  });

  it("does not return the full inventory for an empty search", () => {
    expect(searchInventory([{ id: "cell-1" }, { id: "cell-2" }], {}, settings)).toEqual([]);
    expect(searchInventory([{ id: "cell-1" }], { query: "  " }, settings)).toEqual([]);
  });

  it("ranks exact and prefix identity matches before substrings with stable tie order", () => {
    const cells = [
      { id: "internal-a", cellId: "X12" },
      { id: "12", cellId: "12" },
      { id: "internal-c", cellId: "B12" },
      { id: "12-internal", cellId: "Z" },
      { id: "internal-b", cellId: "12A" },
    ];
    expect(searchInventory(cells, { query: "12" }, settings).map((cell) => cell.id)).toEqual([
      "12",
      "internal-b",
      "12-internal",
      "internal-c",
      "internal-a",
    ]);
  });

  it("filters on resolved technology and sorts filter-only results by Cell identity", () => {
    const cells = [
      { id: "cell-10", cellId: "10", rfProfile: { networkTech: "4g", frequencyGHz: 2.6 } },
      { id: "cell-2", cellId: "2", rfProfile: { networkTech: "5g", frequencyGHz: 28 } },
      { id: "cell-1", cellId: "1", rfProfile: { networkTech: "4g", frequencyGHz: 2.6 } },
    ];
    expect(searchInventory(cells, { technology: "4g" }, settings).map((cell) => cell.id)).toEqual(["cell-1", "cell-10"]);
    expect(searchInventory(cells, { query: "2", technology: "5g" }, settings).map((cell) => cell.id)).toEqual(["cell-2"]);
  });

  it("returns bounded pages for large query results", () => {
    const cells = Array.from({ length: 10_000 }, (_, index) => ({ id: `cell-${index + 1}`, cellId: `cell-${index + 1}` }));
    const matches = searchInventory(cells, { query: "cell-" }, settings);
    expect(matches).toHaveLength(10_000);
    expect(sliceInventoryPage(matches)).toHaveLength(INVENTORY_PAGE_SIZE);
    expect(sliceInventoryPage(matches, INVENTORY_PAGE_SIZE * 2)).toHaveLength(INVENTORY_PAGE_SIZE * 2);
  });
});

describe("atomic safe Inventory batch updates", () => {
  it("changes only the supported scalar fields on selected Cells", () => {
    const cells = [
      { id: "a", coordinates: [32, 39], rfProfile: { txPowerDbm: 30 } },
      { id: "b", coordinates: [33, 40], rfProfile: { radiusMeters: 300 } },
      { id: "c", coordinates: [34, 41], rfProfile: { txPowerDbm: 32 } },
    ];
    const result = applyInventoryBatchPatch(cells, settings, ["a", "b"], { txPowerDbm: 35, beamWidthDeg: 90 });
    expect(result.ok).toBe(true);
    expect(result.towers[0].rfProfile).toEqual({ txPowerDbm: 35, beamWidthDeg: 90 });
    expect(result.towers[1].rfProfile).toEqual({ radiusMeters: 300, txPowerDbm: 35, beamWidthDeg: 90 });
    expect(result.towers[2]).toBe(cells[2]);
    expect(cells[0].rfProfile).toEqual({ txPowerDbm: 30 });
  });

  it("rejects the full batch when any selected Cell would fail validation", () => {
    const cells = [
      { id: "a", rfProfile: { txPowerDbm: 30 } },
      { id: "b", rfProfile: { txPowerDbm: 31 } },
    ];
    const result = applyInventoryBatchPatch(cells, settings, ["a", "b"], { txPowerDbm: 100 });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Conducted TX power") });
    expect(cells.map((cell) => cell.rfProfile.txPowerDbm)).toEqual([30, 31]);
  });

  it("rejects position, identity, coupled, and unknown fields", () => {
    const cells = [{ id: "a" }, { id: "b" }];
    expect(applyInventoryBatchPatch(cells, settings, ["a", "b"], { longitude: 32 }).ok).toBe(false);
    expect(applyInventoryBatchPatch(cells, settings, ["a", "b"], { networkTech: "4g" }).ok).toBe(false);
  });
});
