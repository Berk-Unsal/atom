import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getJSON: vi.fn(),
  postJSON: vi.fn(),
}));

vi.mock("./utils/apiClient.js", () => ({
  getJSON: api.getJSON,
  postJSON: api.postJSON,
  isAbortError: (error) => error?.name === "AbortError",
}));

vi.mock("./components/MapCanvas.jsx", () => ({
  default: ({ onSelectMapCell, onSelectTower, towers = [] }) => (
    <div data-testid="map-canvas">
      {towers.map((tower) => (
        <button
          key={tower.id}
          type="button"
          aria-label={`Select map tower ${tower.cellId ?? tower.id}`}
          onClick={() => {
            onSelectMapCell?.(tower);
            onSelectTower(tower);
          }}
        >
          {tower.cellId ?? tower.id}
        </button>
      ))}
    </div>
  ),
}));

import App from "./App.jsx";

const towerGeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      id: "tower-1",
      type: "Feature",
      geometry: { type: "Point", coordinates: [32.85, 39.92] },
      properties: { cell_id: "101", radio_type: "NR" },
    },
  ],
};

const networkTowerGeoJSON = {
  type: "FeatureCollection",
  features: [
    point("tower-1", "101", 32.85, 39.92),
    point("tower-2", "102", 32.854, 39.922),
    point("tower-3", "103", 32.858, 39.924),
  ],
};

const objectiveStatus = {
  demand: { available: true },
  residential: { available: true },
  coverage: { available: true },
  overlap: { available: true },
};

const networkOptimizationPayload = {
  optimized_towers: [
    { id: "101", optimal_azimuth: 20, rf_profile: {} },
    { id: "102", optimal_azimuth: 140, rf_profile: {} },
  ],
  stats: {
    raw_metrics: {
      served_demand_weight: 600,
      relevant_demand_weight: 1000,
      residential_covered: 15,
      relevant_residential_total: 30,
      propagation_reach_score: 60,
      propagation_reach_maximum: 100,
      covered_units: 30,
      overlap_buildings: 2,
      overlap_ratio: 0.08,
    },
    objective_status: objectiveStatus,
  },
  baseline: {
    cell_configurations: [
      { id: "101", tower_lon: 32.85, tower_lat: 39.92, azimuth_deg: 0, rf_profile: {} },
      { id: "102", tower_lon: 32.854, tower_lat: 39.922, azimuth_deg: 90, rf_profile: {} },
    ],
    parameters: { rays: 72, radius_m: 400, frequency_ghz: 28, tx_power_dbm: 30, beam_width: 120 },
    stats: {
      raw_metrics: {
        served_demand_weight: 400,
        relevant_demand_weight: 1000,
        residential_covered: 10,
        relevant_residential_total: 30,
        propagation_reach_score: 50,
        propagation_reach_maximum: 100,
        covered_units: 24,
        overlap_buildings: 5,
        overlap_ratio: 0.2,
      },
      objective_status: objectiveStatus,
    },
    constraints_satisfied: false,
  },
  optimization: {
    recommended: true,
    constraints_satisfied: true,
    objective_status: objectiveStatus,
    recommended_solution_id: "solution-a",
    violations: [],
  },
  pareto_frontier: [
    {
      id: "solution-a",
      towers: [{ id: "101", azimuth_deg: 20 }, { id: "102", azimuth_deg: 140 }],
      stats: {
        raw_metrics: {
          served_demand_weight: 600,
          relevant_demand_weight: 1000,
          residential_covered: 15,
          relevant_residential_total: 30,
          propagation_reach_score: 60,
          propagation_reach_maximum: 100,
          covered_units: 30,
          overlap_buildings: 2,
          overlap_ratio: 0.08,
        },
        objective_status: objectiveStatus,
      },
    },
    {
      id: "solution-b",
      towers: [{ id: "101", azimuth_deg: 30 }, { id: "102", azimuth_deg: 150 }],
      stats: {
        raw_metrics: {
          served_demand_weight: 500,
          relevant_demand_weight: 1000,
          residential_covered: 22,
          relevant_residential_total: 30,
          propagation_reach_score: 52,
          propagation_reach_maximum: 100,
          covered_units: 28,
          overlap_buildings: 4,
          overlap_ratio: 0.14,
        },
        objective_status: objectiveStatus,
      },
    },
  ],
};

let useNetworkFixture = false;

const simulationPayload = {
  geojson: {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} }],
  },
  stats: { avg_rx_dbm: -88, blocked_pct: 10, min_range_m: 100, max_range_m: 400 },
};

const gapPayload = {
  geojson: { type: "FeatureCollection", features: [] },
  stats: { gap_buildings: 4, gap_pct: 2, returned_gaps: 0 },
};

const cellExplanationPayload = {
  available: true,
  unchanged: false,
  run_id: "legacy-run",
  solution_id: "solution-a",
  cell: { id: "101", baseline_azimuth_deg: 0, selected_azimuth_deg: 20 },
  actual: {
    raw_metrics: {
      served_demand_weight: 600,
      relevant_demand_weight: 1000,
      residential_covered: 15,
      relevant_residential_total: 30,
      propagation_reach_score: 60,
      propagation_reach_maximum: 100,
      covered_units: 30,
      overlap_buildings: 2,
      overlap_ratio: 0.08,
    },
    constraints_satisfied: true,
    violations: [],
  },
  counterfactual: {
    raw_metrics: {
      served_demand_weight: 400,
      relevant_demand_weight: 1000,
      residential_covered: 10,
      relevant_residential_total: 30,
      propagation_reach_score: 50,
      propagation_reach_maximum: 100,
      covered_units: 24,
      overlap_buildings: 5,
      overlap_ratio: 0.2,
    },
    constraints_satisfied: false,
    violations: ["minimum demand buildings"],
  },
  objective_status: objectiveStatus,
  limitations: [
    "Conditional marginal comparison: selected configuration versus the same network with this cell reverted to baseline.",
    "This is not causal attribution, an independent cell contribution, or an additive decomposition; cell interactions remain.",
  ],
};

describe("App planning workflow", () => {
  beforeEach(() => {
    api.getJSON.mockReset();
    api.postJSON.mockReset();
    api.getJSON.mockImplementation((path) => {
      if (path === "/api/towers") {
        return Promise.resolve(useNetworkFixture ? networkTowerGeoJSON : towerGeoJSON);
      }
      if (path === "/api/buildings/summary") {
        return Promise.resolve({ total_buildings: 100, data_quality: "good" });
      }
      return Promise.resolve({});
    });
    api.postJSON.mockImplementation((path) => {
      if (path === "/api/analyze-sector") {
        return Promise.resolve({ simulation: simulationPayload, coverage_gaps: gapPayload });
      }
      if (path === "/api/optimize-network") {
        return Promise.resolve(networkOptimizationPayload);
      }
      if (path === "/api/explain-network-cell") {
        return Promise.resolve(cellExplanationPayload);
      }
      return Promise.resolve(simulationPayload);
    });
    useNetworkFixture = false;
  });

  it("invalidates results without launching RF work until Run is pressed", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    expect(api.postJSON).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Open Sector result results/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Transmit power (dBm)" }), {
      target: { value: "31" },
    });
    await act(async () => Promise.resolve());

    expect(api.postJSON).not.toHaveBeenCalled();
    expect(screen.getByText("Plan changed", { selector: ".run-state" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open Sector result results/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(api.postJSON).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("Ready")).toBeInTheDocument());
  });

  it("gets simulation and coverage gaps from one sector-analysis request", async () => {
    let finishAnalysis;
    api.postJSON.mockImplementation((path) => {
      if (path === "/api/analyze-sector") {
        return new Promise((resolve) => {
          finishAnalysis = () => resolve({ simulation: simulationPayload, coverage_gaps: gapPayload });
        });
      }
      return Promise.resolve(simulationPayload);
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(api.postJSON).toHaveBeenCalledTimes(1));
    expect(api.postJSON).toHaveBeenLastCalledWith(
      "/api/analyze-sector",
      expect.any(Object),
      "Sector analysis failed",
      expect.any(AbortSignal),
    );
    finishAnalysis();
    await waitFor(() => expect(screen.getByText("Ready")).toBeInTheDocument());
    expect(api.postJSON).toHaveBeenCalledTimes(1);
  });

  it("changes RF map presentation without launching another RF request", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Toggle propagation rays" })).toHaveAttribute("aria-pressed", "true");

    const rfRequestCount = api.postJSON.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Toggle propagation rays" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Ray scope" }), { target: { value: "selected" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Map focus cell" }), { target: { value: "101" } });

    expect(screen.getByRole("button", { name: "Toggle propagation rays" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("combobox", { name: "Ray scope" })).toHaveValue("selected");
    expect(api.postJSON).toHaveBeenCalledTimes(rfRequestCount);
  });

  it("does not launch a sector request when switching into network planning", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    await act(async () => Promise.resolve());

    expect(api.postJSON).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add 1 cell" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Analyze workspace" }));
    expect(screen.getByRole("button", { name: "Interference" })).not.toBeDisabled();
  });

  it("explores Pareto solutions without changing the recommendation or rerunning RF", async () => {
    useNetworkFixture = true;
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Select map tower 101" })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Network mode, 1 selected" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Select map tower 102" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Network mode, 2 selected" })).toHaveAttribute("aria-pressed", "true"));

    fireEvent.click(screen.getByRole("button", { name: "Simulate workspace" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Optimize Network" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Optimize Network" }));
    await waitFor(() => expect(api.postJSON).toHaveBeenCalledWith(
      "/api/optimize-network",
      expect.any(Object),
      "Network optimization request failed",
      expect.any(AbortSignal),
    ));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    fireEvent.click(screen.getByRole("tab", { name: "Solutions" }));
    expect(screen.getByRole("region", { name: "Pareto alternative solutions" })).toBeInTheDocument();
    expect(screen.getByText("2 feasible · non-dominated solutions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Inspect Pareto solution 1, recommended/i })).toBeInTheDocument();

    const rfRequestCount = api.postJSON.mock.calls.filter(([path]) => path === "/api/optimize-network" || path === "/api/simulate").length;
    const alternate = screen.getByRole("button", { name: /Inspect Pareto solution 2/i });
    fireEvent.click(alternate);
    expect(alternate).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Compared with recommended")).toBeInTheDocument();
    expect(screen.getByText("Recommended → selected · selected − recommended")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Compare" }));
    expect(screen.getByText("Baseline vs Recommended")).toBeInTheDocument();
    expect(screen.queryByText("Compared with recommended")).not.toBeInTheDocument();
    expect(api.postJSON.mock.calls.filter(([path]) => path === "/api/optimize-network" || path === "/api/simulate").length).toBe(rfRequestCount);
  });

  it("lazily explains the inspected cell and reuses the raw result after priority changes", async () => {
    useNetworkFixture = true;
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Select map tower 101" })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Network mode, 1 selected" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Select map tower 102" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Network mode, 2 selected" })).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(screen.getByRole("button", { name: "Simulate workspace" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Optimize Network" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Optimize Network" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    fireEvent.click(screen.getByRole("tab", { name: "Solutions" }));
    const explainButton = screen.getByRole("button", { name: "Explain Cell 101 marginal effect" });
    fireEvent.click(explainButton);
    await waitFor(() => expect(screen.getByRole("region", { name: "Marginal effect for Cell 101" })).toBeInTheDocument());
    expect(screen.getByText(/restoring only Cell 101 to its baseline configuration/i)).toBeInTheDocument();
    expect(api.postJSON).toHaveBeenCalledWith(
      "/api/explain-network-cell",
      expect.objectContaining({ solution_id: "solution-a", cell_id: "101" }),
      "Cell explanation request failed",
      expect.any(AbortSignal),
    );
    const explanationCalls = api.postJSON.mock.calls.filter(([path]) => path === "/api/explain-network-cell");
    expect(explanationCalls).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Simulate workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Propagation" }));
    fireEvent.change(screen.getByRole("slider", { name: "Demand importance" }), { target: { value: "100" } });
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Explain Cell 101 marginal effect" }));
    expect(api.postJSON.mock.calls.filter(([path]) => path === "/api/explain-network-cell")).toHaveLength(1);
    expect(screen.getByText("Selected solution − cell reverted to baseline")).toBeInTheDocument();
  });

  it("cancels map area selection with Escape", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Draw selection area" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(api.postJSON).not.toHaveBeenCalled();
  });

  it("keeps propagation assumptions available before interference analysis", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Data" }));
    expect(screen.getByRole("region", { name: "Propagation model assumptions" })).toBeInTheDocument();
    expect(screen.getByText("FSPL + wall loss")).toBeInTheDocument();
    expect(screen.getByText(/Fast fading, diffraction, sidelobes/)).toBeInTheDocument();
  });

  it("shows only the primary action relevant to the active workflow", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    expect(screen.queryByRole("button", { name: "Run Sector" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Plan workspace" }));
    expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  });

  it("restores a deleted inventory cell from the undo notice", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Inventory" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete 101" }));
    expect(screen.getByText("Deleted cell 101.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete 101" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Delete 101" })).toBeInTheDocument();
  });

  it("sends edited per-cell inventory profiles with RF requests", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Inventory" }));
    const cellPower = screen.getByRole("spinbutton", { name: /TX power/i });
    fireEvent.change(cellPower, { target: { value: "41" } });
    expect(screen.getByText(/Profile valid/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(api.postJSON).toHaveBeenCalledWith(
      "/api/analyze-sector",
      expect.objectContaining({ rf_profile: expect.objectContaining({ tx_power_dbm: 41 }) }),
      "Sector analysis failed",
      expect.any(AbortSignal),
    ));
  });

  it("switches only by installed dataset ID and reloads the active catalog", async () => {
    let activeID = "first-pack";
    api.getJSON.mockImplementation((path) => {
      if (path === "/api/towers") return Promise.resolve(towerGeoJSON);
      if (path === "/api/buildings/summary") return Promise.resolve({ total_buildings: 100, data_quality: "good" });
      if (path === "/api/meta") return Promise.resolve({ dataset: { id: activeID, name: activeID, version: "1", sources: [], licenses: [], sha256: {} } });
      if (path === "/api/datasets") return Promise.resolve({
        active_id: activeID,
        datasets: [
          { id: "first-pack", name: "First pack", version: "1", schema_version: 2, active: activeID === "first-pack" },
          { id: "second-pack", name: "Second pack", version: "1", schema_version: 2, active: activeID === "second-pack" },
        ],
        warnings: [],
      });
      return Promise.resolve({});
    });
    api.postJSON.mockImplementation((path, body) => {
      if (path === "/api/datasets/switch") {
        activeID = body.id;
        return Promise.resolve({ status: "active", dataset: { id: body.id, name: "Second pack" } });
      }
      return Promise.resolve(simulationPayload);
    });

    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Data" }));
    fireEvent.click(await screen.findByRole("button", { name: /Second pack.*Activate/i }));

    await waitFor(() => expect(api.postJSON).toHaveBeenCalledWith(
      "/api/datasets/switch",
      { id: "second-pack" },
      "Dataset switch failed",
    ));
    await waitFor(() => expect(screen.getByRole("button", { name: /Second pack.*Active/i })).toBeDisabled());
  });

  it("shows a consistent global recovery state when RF capacity is busy", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Close tool drawer" }));
    api.postJSON.mockRejectedValueOnce(new Error("RF analysis capacity is busy; retry shortly"));
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("RF analysis capacity is busy; retry shortly");
    expect(screen.getByText("Action needed", { selector: ".run-state" })).toBeInTheDocument();
    expect(screen.getByText("Action needed", { selector: ".run-state" })).toHaveClass("error");
  });

  it("clears prior RF evidence when a measurement calibration changes the plan", async () => {
    api.postJSON.mockImplementation((path) => {
      if (path === "/api/analyze-sector") {
        return Promise.resolve({ simulation: simulationPayload, coverage_gaps: gapPayload });
      }
      if (path === "/api/measurements/evaluate") {
        return Promise.resolve({
          geojson: {
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              geometry: { type: "Point", coordinates: [32.85, 39.92] },
              properties: { id: "m-1", status: "valid", residual_db: 6 },
            }],
          },
          stats: { sample_count: 20, valid_sample_count: 20, mae_db: 6, rmse_db: 6, median_bias_db: 6 },
          calibration: {
            eligible: true,
            reason: "Review holdout error before applying this global correction.",
            recommended_total_offset_db: 6,
            holdout_mae_before_db: 6,
            holdout_mae_after_db: 0,
          },
        });
      }
      return Promise.resolve(simulationPayload);
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Open Sector result results/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Data" }));
    const fileInput = screen.getByLabelText(/Import measurement CSV/i);
    const measurementCsv = "id,longitude,latitude,technology,rsrp_dbm\nm-1,32.85,39.92,5g,-80";
    const measurementFile = {
      size: measurementCsv.length,
      text: () => Promise.resolve(measurementCsv),
    };
    fireEvent.change(fileInput, { target: { files: [measurementFile] } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Evaluate residuals" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Evaluate residuals" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply correction to plan" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Apply correction to plan" }));

    expect(screen.queryByRole("button", { name: /Open Sector result results/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Apply correction to plan")).not.toBeInTheDocument();
    expect(screen.getByText("Plan changed", { selector: ".run-state" })).toBeInTheDocument();
  });
});

function point(id, cellID, longitude, latitude) {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    properties: { cell_id: cellID, radio_type: "NR" },
  };
}
