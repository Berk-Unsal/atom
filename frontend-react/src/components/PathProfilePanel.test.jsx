import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { profileChartGeometry } from "../utils/pathProfileChart.js";
import { PathProfileResult } from "./PathProfilePanel.jsx";

describe("path profile chart geometry", () => {
  it("renders terrain, Fresnel, LOS, and a dominant obstruction marker", () => {
    const geometry = profileChartGeometry([
      { distance_m: 0, terrain_elevation_m: 100, obstruction_elevation_m: 100, line_of_sight_elevation_m: 125, fresnel_radius_m: 0, clearance_m: 25 },
      { distance_m: 50, terrain_elevation_m: 103, obstruction_elevation_m: 130, line_of_sight_elevation_m: 115, fresnel_radius_m: 2, clearance_m: -15 },
      { distance_m: 100, terrain_elevation_m: 105, obstruction_elevation_m: 105, line_of_sight_elevation_m: 106.5, fresnel_radius_m: 0, clearance_m: 1.5 },
    ]);

    expect(geometry.terrainAreaPath).toContain("Z");
    expect(geometry.fresnelPath).toContain("Z");
    expect(geometry.losPath).toMatch(/^M/);
    expect(geometry.dominant).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });
});

describe("PathProfileResult diffraction diagnostic", () => {
  it("keeps canonical UMa and diagnostic values visibly separate", () => {
    render(
      <PathProfileResult
        profile={{
          classification: "building-obstructed",
          geometric_los: false,
          distance_m: 120,
          fresnel_clearance: { status: "concern" },
          terrain: { available: false },
          samples: [],
          loss_budget: { components: [], rx_dbm_p50: -77.2, total_median_loss_db: 110.4 },
          applicability: { frequency_applicable: true, reference: "ITU-R P.1411-13", implementation: "diagnostic" },
          diffraction_diagnostic: {
            available: true,
            method: "P.526-aligned single-edge diagnostic",
            reference: "ITU-R P.526-16 §4.1, equations (26) and (31)",
            selected_edge: { obstruction_id: "roof-a", edge_position: "entry", v: 1.2 },
            diffraction_loss_db: 15.3,
            diagnostic_rx_dbm: -88.1,
            geometry: { candidates: [{ id: "roof-a:entry:0", obstruction_id: "roof-a", edge_position: "entry", height_source: "observed_tag", height_available: true, clearance_m: -2, fresnel_clearance_ratio: -1, v: 1.2, diffraction_loss_db: 15.3, selected_dominant_edge: true }] },
            limitations: ["single knife-edge only; multiple-edge propagation is deferred"],
          },
          canonical_comparison: { canonical_rx_dbm: -73.4, diagnostic_minus_canonical_db: -14.7 },
          rf_contract: { model_id: "path-profile-diagnostic-v1" },
        }}
      />,
    );

    expect(screen.getByText("DIFFRACTION DIAGNOSTIC")).toBeInTheDocument();
    expect(screen.getByText("Diagnostic only — not applied to network simulation")).toBeInTheDocument();
    expect(screen.getByText(/-88\.1/)).toBeInTheDocument();
    expect(screen.getByText(/-73\.4/)).toBeInTheDocument();
    expect(screen.getByText(/-14\.7/)).toBeInTheDocument();
    expect(screen.queryByText(/UMa NLOS.*diffraction/)).not.toBeInTheDocument();
  });

  it("explains when fallback-height geometry cannot produce diffraction", () => {
    render(
      <PathProfileResult
        profile={{
          classification: "building-obstructed",
          geometric_los: false,
          distance_m: 120,
          fresnel_clearance: { status: "concern" },
          terrain: { available: false },
          samples: [],
          loss_budget: { components: [], rx_dbm_p50: -70.1, total_median_loss_db: 102.2 },
          applicability: { frequency_applicable: true, reference: "ITU-R P.1411-13", implementation: "diagnostic" },
          diffraction_diagnostic: {
            available: false,
            reason: "obstruction_height_unavailable",
            reference: "ITU-R P.526-16 §4.1",
            geometry: {
              candidates: [{
                id: "roof-a:entry:0",
                obstruction_id: "roof-a",
                edge_position: "entry",
                height_source: "unavailable",
                height_available: false,
                clearance_m: null,
                v: null,
                diffraction_loss_db: null,
                selected_dominant_edge: false,
              }],
            },
            limitations: ["generic fallback height is unavailable diffraction evidence"],
          },
          canonical_comparison: { available: true, canonical_rx_dbm: -70.1 },
          rf_contract: { model_id: "path-profile-diagnostic-v1" },
        }}
      />,
    );

    expect(screen.getByText(/Unavailable · obstruction height unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/generic fallback height is unavailable diffraction evidence/)).toBeInTheDocument();
    expect(screen.getByText(/roof-a/)).toBeInTheDocument();
  });
});
