import { describe, expect, it } from "vitest";
import { createInventoryCell, inventoryCellToLegacy } from "../domain/inventory.js";
import { buildNetworkOptimizationPayload } from "./requestPayloads.js";
import { applyProfileToSite, createSiteCells, moveCellOrSite, parseSectorAzimuths, siteGroupMembers, ungroupSite } from "./siteGroups.js";

const settings = { frequencyGHz: 28, txPowerDbm: 30, rayCount: 120, radiusMeters: 400, azimuthDeg: 90, beamWidthDeg: 120, calibrationOffsetDb: 0 };
const existing = [{ id: "tower-1", cellId: "101", coordinates: [32.85, 39.92] }, { id: "manual-2", cellId: "manual-2", coordinates: [32.84, 39.91] }];

describe("site groups", () => {
  it.each([
    ["0, 120, 240", [0, 120, 240], ""],
    ["30;150 270", [30, 150, 270], ""],
    ["-90, 450", [270, 90], ""],
    ["0", null, /Enter 2 to 6/],
    ["0, 60, 120, 180, 240, 300, 330", null, /Enter 2 to 6/],
    ["0, north", null, /"north" is not an azimuth/],
    ["0, 360", null, /different azimuth/],
  ])("parses %j", (text, azimuths, error) => {
    const parsed = parseSectorAzimuths(text);
    expect(parsed.azimuths).toEqual(azimuths);
    if (error) expect(parsed.error).toMatch(error);
    else expect(parsed.error).toBe("");
  });

  it("places N co-located Cells with the chosen azimuths, unique IDs and one shared group", () => {
    const cells = createSiteCells({ coordinates: [32.86, 39.925], towers: existing, settings });
    expect(cells.map((cell) => cell.sectorAzimuthDeg)).toEqual([0, 120, 240]);
    expect(new Set(cells.map((cell) => cell.siteGroupId))).toEqual(new Set(["site-1"]));
    expect(cells.every((cell) => cell.coordinates[0] === 32.86 && cell.coordinates[1] === 39.925)).toBe(true);
    const ids = [...existing, ...cells].map((cell) => cell.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sends N ordinary Cells: the request equals individually placed Cells with the same azimuths", () => {
    const cells = createSiteCells({ coordinates: [32.86, 39.925], towers: existing, settings });
    const ordinary = cells.map((cell) => {
      const copy = { ...cell };
      delete copy.siteGroupId;
      delete copy.sectorAzimuthDeg;
      return copy;
    });
    const explicitAzimuths = Object.fromEntries(cells.map((cell) => [cell.id, cell.sectorAzimuthDeg]));
    const sitePayload = buildNetworkOptimizationPayload(cells, settings, {}, null);
    expect(sitePayload).toEqual(buildNetworkOptimizationPayload(ordinary, settings, explicitAzimuths, null));
    expect(JSON.stringify(sitePayload)).not.toMatch(/siteGroup|site_group|sectorAzimuth|sector_azimuth/);
    expect(buildNetworkOptimizationPayload(cells, settings, { [cells[0].id]: 45 }, null).towers[0].azimuth).toBe(45);
  });

  it("moves every member together but moves an ungrouped Cell alone", () => {
    const cells = createSiteCells({ coordinates: [32.86, 39.925], towers: existing, settings });
    const moved = moveCellOrSite([...existing, ...cells], cells[1].id, [32.9, 39.95]);
    expect(siteGroupMembers(moved, "site-1").every((cell) => cell.coordinates[0] === 32.9 && cell.coordinates[1] === 39.95)).toBe(true);
    expect(moved[0].coordinates).toEqual([32.85, 39.92]);
    const single = moveCellOrSite(moved, "tower-1", [32.7, 39.8]);
    expect(single[0].coordinates).toEqual([32.7, 39.8]);
    expect(siteGroupMembers(single, "site-1")[0].coordinates).toEqual([32.9, 39.95]);
  });

  it("applies one member's RF profile only when asked, keeping sector azimuths", () => {
    const cells = createSiteCells({ coordinates: [32.86, 39.925], towers: [], settings });
    const edited = cells.map((cell, index) => (index === 0 ? { ...cell, rfProfile: { ...cell.rfProfile, txPowerDbm: 37 } } : cell));
    expect(edited[1].rfProfile.txPowerDbm).not.toBe(37);
    const applied = applyProfileToSite(edited, cells[0].id);
    expect(applied.every((cell) => cell.rfProfile.txPowerDbm === 37)).toBe(true);
    expect(applied.map((cell) => cell.sectorAzimuthDeg)).toEqual([0, 120, 240]);
  });

  it("ungroups without losing Cells, positions or azimuths", () => {
    const cells = createSiteCells({ coordinates: [32.86, 39.925], towers: [], settings });
    const ungrouped = ungroupSite(cells, "site-1");
    expect(ungrouped).toHaveLength(3);
    expect(ungrouped.some((cell) => "siteGroupId" in cell)).toBe(false);
    expect(ungrouped.map((cell) => cell.sectorAzimuthDeg)).toEqual([0, 120, 240]);
  });

  it("round-trips group fields through the inventory domain model and leaves ungrouped Cells unchanged", () => {
    const [cell] = createSiteCells({ coordinates: [32.86, 39.925], towers: [], settings });
    expect(inventoryCellToLegacy(createInventoryCell(cell))).toMatchObject({ siteGroupId: "site-1", sectorAzimuthDeg: 0 });
    const plain = createInventoryCell(existing[0]);
    expect(plain).not.toHaveProperty("site_group_id");
    expect(plain).not.toHaveProperty("sector_azimuth_deg");
    expect(inventoryCellToLegacy(plain)).not.toHaveProperty("siteGroupId");
  });
});
