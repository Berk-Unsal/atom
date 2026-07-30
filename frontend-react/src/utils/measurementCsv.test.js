import { describe, expect, it } from "vitest";
import {
  MAX_MEASUREMENT_CSV_BYTES,
  parseMeasurementCsv,
  readMeasurementCsvFile,
} from "./measurementCsv.js";

describe("parseMeasurementCsv", () => {
  it("parses valid samples and optional cell ids", () => {
    const samples = parseMeasurementCsv("id,lon,lat,technology,rsrp_dbm,cell_id\na,32.85,39.92,5g,-91,123");
    expect(samples).toEqual([{ id: "a", lon: 32.85, lat: 39.92, technology: "5g", rsrp_dbm: -91, cell_id: "123" }]);
  });

  it("accepts descriptive coordinate and RSRP headers", () => {
    const samples = parseMeasurementCsv("id,longitude,latitude,technology,rsrp\na,32.85,39.92,5g,-91");
    expect(samples[0]).toMatchObject({ lon: 32.85, lat: 39.92, rsrp_dbm: -91 });
  });

  it("rejects duplicate ids", () => {
    expect(() => parseMeasurementCsv("id,lon,lat,technology,rsrp_dbm\na,32,39,4g,-90\na,32,39,4g,-91")).toThrow(/duplicate/i);
  });

  it("rejects unsupported technologies", () => {
    expect(() => parseMeasurementCsv("id,lon,lat,technology,rsrp_dbm\na,32,39,6g,-90")).toThrow(/4g or 5g/i);
  });
});

describe("readMeasurementCsvFile", () => {
  const validCsv = "id,lon,lat,technology,rsrp_dbm\na,32.85,39.92,5g,-91";

  it("rejects an oversized file before reading its contents", async () => {
    let read = false;
    const file = {
      size: MAX_MEASUREMENT_CSV_BYTES + 1,
      text: async () => {
        read = true;
        return validCsv;
      },
    };

    await expect(readMeasurementCsvFile(file)).rejects.toThrow(/2 MiB/);
    expect(read).toBe(false);
  });

  it("accepts a valid CSV at the byte limit", async () => {
    const file = { size: MAX_MEASUREMENT_CSV_BYTES, text: async () => validCsv };

    await expect(readMeasurementCsvFile(file)).resolves.toEqual([
      { id: "a", lon: 32.85, lat: 39.92, technology: "5g", rsrp_dbm: -91, cell_id: undefined },
    ]);
  });
});
