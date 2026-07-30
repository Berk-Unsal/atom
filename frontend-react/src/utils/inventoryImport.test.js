import { describe, expect, it } from "vitest";
import { duplicateInventoryCell, parseInventoryFile } from "./inventoryImport.js";

const settings = {
  frequencyGHz: 28,
  txPowerDbm: 30,
  radiusMeters: 400,
  beamWidthDeg: 120,
  interferenceBandwidthMHz: 100,
  cellLoadPct: 70,
  reuseFactor: 1,
};

describe("inventory import", () => {
  it("imports quoted CSV and validates RF fields", () => {
    const csv = [
      "id,longitude,latitude,network_tech,frequency_ghz,band,bandwidth_mhz,channel_id,tx_power_dbm,pci",
      'site-1,32.85,39.92,4g,2.6,"LTE Band 7",20,EARFCN-2850,43,503',
    ].join("\n");
    const [cell] = parseInventoryFile(csv, "cells.csv", settings);
    expect(cell).toMatchObject({ id: "site-1", coordinates: [32.85, 39.92], editable: true });
    expect(cell.rfProfile).toMatchObject({ networkTech: "4g", frequencyGHz: 2.6, pci: 503 });
  });

  it("imports GeoJSON points and resolves duplicate IDs deterministically", () => {
    const geojson = JSON.stringify({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Point", coordinates: [32.8, 39.9] }, properties: { id: "taken" } }],
    });
    const [cell] = parseInventoryFile(geojson, "cells.geojson", settings, ["taken"]);
    expect(cell.id).toBe("taken-2");
  });

  it("imports nested RF profiles and keeps request cell IDs unique", () => {
    const geojson = JSON.stringify({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "Point", coordinates: [32.8, 39.9] },
        properties: {
          id: "site-a",
          cell_id: "101",
          rf_profile: { network_tech: "4g", frequency_ghz: 2.6, band: "LTE Band 7", tx_power_dbm: 43 },
        },
      }],
    });
    const [cell] = parseInventoryFile(geojson, "cells.geojson", settings, [], ["101"]);
    expect(cell.cellId).toBe("101-2");
    expect(cell.rfProfile).toMatchObject({ networkTech: "4g", frequencyGHz: 2.6, txPowerDbm: 43 });
  });

  it("rejects invalid coordinates before changing inventory", () => {
    expect(() => parseInventoryFile("id,longitude,latitude\nbad,500,39", "bad.csv", settings)).toThrow(/invalid longitude/i);
  });

  it("duplicates a cell with a unique editable identity", () => {
    const copy = duplicateInventoryCell({ id: "a", cellId: "a", coordinates: [32, 39] }, ["a", "a-copy"]);
    expect(copy.id).toBe("a-copy-2");
    expect(copy.coordinates).not.toEqual([32, 39]);
    expect(copy.editable).toBe(true);
  });

  it("bounds total inventory size and UTF-8 identifiers", () => {
    const existing = Array.from({ length: 10_000 }, (_, index) => `cell-${index}`);
    expect(() => parseInventoryFile("id,longitude,latitude\nnew,32,39", "cells.csv", settings, existing)).toThrow(/10,000 total cells/i);
    expect(() => parseInventoryFile(`id,longitude,latitude\n${"é".repeat(65)},32,39`, "cells.csv", settings)).toThrow(/128 UTF-8 bytes/i);
  });
});
