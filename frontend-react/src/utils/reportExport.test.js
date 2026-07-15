import { describe, expect, it } from "vitest";
import { buildPlanningReport, renderMarkdownReport } from "./reportExport.js";

describe("planning report interference section", () => {
  it("includes planning assumptions and unavailable aggregate metrics", () => {
    const report = buildPlanningReport({
      activeNetworkTech: "5G mmWave",
      buildingSummary: null,
      comparison: null,
      coreLab: null,
      coreLabApplicable: true,
      coreLabEnabled: false,
      coverageGaps: { geojson: { features: [] }, stats: null },
      diagnostics: null,
      interferenceAnalysis: {
        geojson: { features: [] },
        demand_geojson: { features: [] },
        stats: {
          avg_sinr_db: null,
          p10_sinr_db: null,
          avg_rsrp_dbm: null,
          avg_rsrq_db: null,
          serviceable_pct: 0,
          interference_limited_pct: 0,
          affected_demand_buildings: 0,
          affected_demand: 0,
          per_serving_cell: [],
        },
        model: {
          type: "deterministic_planning_estimate",
          measurement_family: "nr_ss",
          bandwidth_mhz: 100,
          subcarrier_spacing_khz: 120,
          resource_blocks: 66,
          noise_figure_db: 7,
          load_factor: 0.7,
          reuse_factor: 1,
          effective_sample_spacing_m: 40,
        },
      },
      networkOptimization: null,
      selectedTower: { cellId: 1, coordinates: [32.85, 39.92] },
      settings: {
        azimuthDeg: 90,
        beamWidthDeg: 120,
        radiusMeters: 400,
        rayCount: 120,
        txPowerDbm: 30,
        frequencyGHz: 28,
      },
      simulation: { geojson: { features: [] }, stats: null },
      stats: { avgPower: null, maxRange: null, minRange: null, blockedRatio: 0, rayCount: 0 },
    });
    const markdown = renderMarkdownReport(report);
    expect(markdown).toContain("## Interference and Radio Quality");
    expect(markdown).toContain("n/a / n/a dB");
    expect(markdown).toContain("Planning estimate only");
  });
});
