import { describe, expect, it } from "vitest";
import { describeSectorResult } from "./rfResultInterpretation.js";

const simulation = (overrides = {}) => ({
  stats: { blocked_pct: 99.2, avg_rx_dbm: -185.5, ...overrides.stats },
  receiver_threshold: { sensitivity_dbm: -115 },
  rf_profile: { radius_m: 400 },
  ...overrides.root,
});
const gaps = (overrides = {}) => ({ candidate_buildings: 122, gap_buildings: 0, building_service_threshold_dbm: -100, ...overrides });

describe("describeSectorResult", () => {
  it("separates high ray blockage from a result with no coverage gaps", () => {
    expect(describeSectorResult(simulation(), gaps())).toBe(
      "99.2% of sampled rays end at a building-obstructed point (rays stop at the -115 dBm receiver sensitivity or the 400 m planning radius). "
      + "All 122 demand buildings in the sector are above the -100 dBm building-service threshold, so there are no coverage gaps.",
    );
  });

  it("reports unblocked rays and counted gaps", () => {
    const text = describeSectorResult(simulation({ stats: { blocked_pct: 0 } }), gaps({ gap_buildings: 3 }));
    expect(text).toMatch(/^0\.0% of sampled rays end at a building-obstructed point/);
    expect(text).toMatch(/3 of 122 demand buildings in the sector are not above the -100 dBm building-service threshold\.$/);
  });

  it("explains a sector without demand buildings", () => {
    expect(describeSectorResult(simulation(), gaps({ candidate_buildings: 0 }))).toMatch(/No demand buildings fall inside this sector/);
  });

  it("states unavailable values instead of inventing them", () => {
    expect(describeSectorResult(simulation(), null)).toMatch(/Coverage-gap counts are unavailable for this result\.$/);
    const withoutThresholds = describeSectorResult(simulation({ root: { receiver_threshold: null, rf_profile: null } }), gaps({ building_service_threshold_dbm: undefined }));
    expect(withoutThresholds).toMatch(/^99\.2% of sampled rays end at a building-obstructed point\. /);
    expect(withoutThresholds).toMatch(/above the building-service threshold/);
    expect(describeSectorResult({ stats: {} }, gaps())).toBeNull();
    expect(describeSectorResult(null, gaps())).toBeNull();
  });

  it("makes no quality, accuracy or pass/fail claim", () => {
    const text = describeSectorResult(simulation(), gaps({ gap_buildings: 5 }));
    expect(text).not.toMatch(/good|poor|bad|excellent|accura|pass|fail|quality/i);
  });
});
