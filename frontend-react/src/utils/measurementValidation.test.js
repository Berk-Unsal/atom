import { describe, expect, it } from "vitest";
import { parseMeasurementValidationJSON, syntheticP525Campaign } from "./measurementValidation.js";

describe("measurement validation import", () => {
  it("accepts a versioned campaign bundle", () => {
    const result = parseMeasurementValidationJSON(JSON.stringify({ campaigns: [syntheticP525Campaign()] }));
    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].measurements).toHaveLength(3);
  });

  it("rejects duplicate campaigns and missing measurement arrays", () => {
    const campaign = syntheticP525Campaign();
    expect(() => parseMeasurementValidationJSON(JSON.stringify({ campaigns: [campaign, campaign] }))).toThrow(/Duplicate/);
    const invalid = { ...campaign, measurements: undefined };
    expect(() => parseMeasurementValidationJSON(JSON.stringify({ campaigns: [invalid] }))).toThrow(/measurements/);
  });
});
