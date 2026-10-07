import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";

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

const TOOL_TARGETS = {
  Setup: ["plan", "Plan", "setup"],
  Inventory: ["plan", "Plan", "inventory"],
  Propagation: ["simulate", "Simulate", "propagation"],
  Experiments: ["simulate", "Simulate", "experiments"],
  "Signal surface": ["simulate", "Simulate", "surfaces"],
  Interference: ["analyze", "Analyze", "interference"],
  "RF Diagnostics": ["analyze", "Analyze", "validation"],
  "Building entry": ["analyze", "Analyze", "building-entry"],
  "5G Core": ["analyze", "Analyze", "core"],
  Results: ["review", "Review", "results"],
  "Run history": ["review", "Review", "history"],
  Data: ["review", "Review", "data"],
  Report: ["review", "Review", "report"],
};

function openWorkspaceTool(label) {
  const [stageID, stageLabel, toolID] = TOOL_TARGETS[label];
  let toolButton = document.getElementById(`stage-tool-${stageID}-${toolID}`);
  if (!toolButton) {
    fireEvent.click(screen.getByRole("button", { name: `${stageLabel} workspace` }));
    toolButton = document.getElementById(`stage-tool-${stageID}-${toolID}`);
  }
  if (!toolButton) throw new Error(`Tool chooser did not expose ${label}`);
  fireEvent.click(toolButton);
}

function openInventoryCell(cellID) {
  openWorkspaceTool("Inventory");
  fireEvent.change(screen.getByRole("textbox", { name: "Search by Cell ID or record ID" }), { target: { value: cellID } });
  fireEvent.click(screen.getByRole("button", { name: `Edit Cell ${cellID}` }));
}

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

const coverageSurfacePayload = {
  grid: { width: 3, height: 3, values: [-100, -90, -80, -101, -91, -81, -102, -92, -82] },
  contours: { type: "FeatureCollection", features: [] },
  stats: { min_dbm: -102, max_dbm: -80, valid_cell_count: 9 },
  model: { assumptions: [] },
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

  it("keeps Setup focused on planning and opens Scenarios as a separate Plan tool", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    expect(screen.getByRole("button", { name: "Planning" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Advanced model details" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Advanced model details" }));
    expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled();
    expect(api.postJSON).not.toHaveBeenCalled();
    expect(screen.getByText("Run needed", { selector: ".run-state" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Plan workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Scenarios" }));
    expect(screen.getByRole("dialog", { name: "Scenarios" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Scenarios" })).toBeInTheDocument();
    expect(api.postJSON).not.toHaveBeenCalled();
  });

  it("opens the rail chooser without changing the active tool and returns focus on Escape", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    const activeStage = screen.getByRole("button", { name: "Plan workspace" });
    const simulateStage = screen.getByRole("button", { name: "Simulate workspace" });

    fireEvent.click(simulateStage);
    expect(screen.getByRole("dialog", { name: "Setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Propagation", exact: true })).toBeInTheDocument();
    expect(activeStage).toHaveAttribute("aria-current", "step");
    expect(simulateStage).toHaveAttribute("aria-expanded", "true");
    expect(api.postJSON).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Propagation", exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Setup" })).toBeInTheDocument();
    await waitFor(() => expect(simulateStage).toHaveFocus());
    expect(api.postJSON).not.toHaveBeenCalled();
  });

  it("dismisses an exploratory chooser on outside pointer without changing tools", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Simulate workspace" }));
    expect(screen.getByRole("button", { name: "Propagation", exact: true })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId("map-canvas"));

    expect(screen.queryByRole("button", { name: "Propagation", exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Setup" })).toBeInTheDocument();
    expect(api.postJSON).not.toHaveBeenCalled();
  });

  it("returns drawer focus to the owning stage trigger after close", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    const owningStage = screen.getByRole("button", { name: "Plan workspace" });

    fireEvent.click(screen.getByRole("button", { name: "Close tool drawer" }));
    expect(screen.queryByRole("dialog", { name: "Setup" })).not.toBeInTheDocument();
    await waitFor(() => expect(owningStage).toHaveFocus());
    expect(api.postJSON).not.toHaveBeenCalled();
  });

  it("keeps Research collapsed by default and preserves isolated reference inputs through collapse", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Simulate workspace" }));
    openWorkspaceTool("Propagation");

    expect(screen.getByRole("button", { name: "Planning" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^Advanced analysis/ })).toHaveAttribute("aria-expanded", "false");
    const research = screen.getByRole("button", { name: /^Research \/ reference/ });
    expect(research).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(research);
    const subThzPanel = await screen.findByRole("region", { name: "Sub-THz atmospheric reference" });
    const frequency = within(subThzPanel).getByRole("spinbutton", { name: /Frequency/i });
    fireEvent.change(frequency, { target: { value: "145" } });
    expect(screen.getByText("Research activity available")).toBeInTheDocument();
    fireEvent.click(research);
    expect(research).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(research);
    expect(within(subThzPanel).getByRole("spinbutton", { name: /Frequency/i })).toHaveValue(145);
    expect(api.postJSON).not.toHaveBeenCalled();
    expect(screen.getByText("Run needed", { selector: ".run-state" })).toBeInTheDocument();
  });

  it("does not make a current result stale when disclosure state changes", async () => {
    render(<App />);
    const run = await screen.findByRole("button", { name: "Run Sector" });
    fireEvent.click(run);
    await screen.findByText("Ready", { selector: ".run-state" });
    const requestCount = api.postJSON.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Simulate workspace" }));
    openWorkspaceTool("Propagation");
    const advanced = screen.getByRole("button", { name: /^Advanced analysis/ });
    const research = screen.getByRole("button", { name: /^Research \/ reference/ });
    fireEvent.click(advanced);
    fireEvent.click(research);
    fireEvent.click(advanced);
    fireEvent.click(research);

    expect(await screen.findByText("Ready", { selector: ".run-state" })).toBeInTheDocument();
    expect(api.postJSON).toHaveBeenCalledTimes(requestCount);
  });

  it("keeps hidden per-cell antenna values and marks RF edits dirty", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    openInventoryCell("101");
    const advanced = screen.getByRole("button", { name: /^Advanced/ });
    expect(advanced).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(advanced);
    const gain = screen.getByRole("spinbutton", { name: /TX boresight gain/i });
    fireEvent.change(gain, { target: { value: "26" } });
    expect(screen.getByText("Run needed", { selector: ".run-state" })).toBeInTheDocument();
    fireEvent.click(advanced);
    expect(advanced).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(advanced);
    expect(screen.getByRole("spinbutton", { name: /TX boresight gain/i })).toHaveValue(26);
  });

  it("sends the same default RF profile when Planning is collapsed and restored at 2.6 GHz", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    const planning = screen.getByRole("button", { name: "Planning" });
    fireEvent.click(planning);
    fireEvent.click(planning);
    fireEvent.click(screen.getByRole("button", { name: "4G LTE, 2.6 GHz" }));
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));

    await waitFor(() => expect(api.postJSON).toHaveBeenCalledWith(
      "/api/analyze-sector",
      expect.objectContaining({
        frequency_ghz: 2.6,
        tx_power_dbm: 30,
        rf_profile: expect.objectContaining({ network_tech: "4g", frequency_ghz: 2.6, tx_power_dbm: 30 }),
      }),
      "Sector analysis failed",
      expect.any(AbortSignal),
    ));
  });

  it("invalidates results without launching RF work until Run is pressed", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    expect(api.postJSON).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Open Sector result results/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }), {
      target: { value: "31" },
    });
    await act(async () => Promise.resolve());

    expect(api.postJSON).not.toHaveBeenCalled();
    expect(screen.getByText("Run needed", { selector: ".run-state" })).toBeInTheDocument();
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

  it("changes map presentation without launching another RF request", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    expect(within(document.querySelector(".map-visualization-quick-controls")).getByRole("button", { name: "Propagation rays layer" })).toHaveAttribute("aria-pressed", "true");

    const rfRequestCount = api.postJSON.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Propagation rays layer" }));
    fireEvent.click(screen.getByRole("button", { name: "Map view options" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Ray scope" }), { target: { value: "selected" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Map focus cell" }), { target: { value: "101" } });

    expect(within(document.querySelector(".map-visualization-quick-controls")).getByRole("button", { name: "Propagation rays layer" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("combobox", { name: "Ray scope" })).toHaveValue("selected");
    expect(api.postJSON).toHaveBeenCalledTimes(rfRequestCount);
  });

  it("enables Signal after RF completes, loads the surface lazily, and keeps ray toggles presentation-only", async () => {
    api.postJSON.mockImplementation((path) => {
      if (path === "/api/analyze-sector") {
        return Promise.resolve({ simulation: simulationPayload, coverage_gaps: gapPayload });
      }
      if (path === "/api/coverage-surface") return Promise.resolve(coverageSurfacePayload);
      return Promise.resolve(simulationPayload);
    });

    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());

    const signalButton = screen.getByRole("button", { name: "Signal layer" });
    expect(signalButton).toBeEnabled();
    expect(signalButton).toHaveAttribute("data-surface-state", "available");

    const rfRequestCount = api.postJSON.mock.calls.length;
    fireEvent.click(signalButton);
    await waitFor(() => expect(signalButton).toHaveAttribute("data-surface-state", "ready"));
    expect(api.postJSON).toHaveBeenCalledWith(
      "/api/coverage-surface",
      expect.objectContaining({ cell_size_m: 25, tower_lon: 32.85, tower_lat: 39.92 }),
      "Coverage surface generation failed",
      expect.any(AbortSignal),
    );
    expect(api.postJSON.mock.calls.filter(([path]) => path === "/api/analyze-sector").length).toBe(1);

    expect(screen.getByRole("button", { name: "Propagation rays layer" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Propagation rays layer" }));
    expect(screen.getByRole("button", { name: "Propagation rays layer" })).toHaveAttribute("aria-pressed", "true");
    expect(api.postJSON.mock.calls.length).toBe(rfRequestCount + 1);
  });

  it("clears the current surface when RF inputs change and exposes Signal again after rerun", async () => {
    api.postJSON.mockImplementation((path) => {
      if (path === "/api/analyze-sector") return Promise.resolve({ simulation: simulationPayload, coverage_gaps: gapPayload });
      if (path === "/api/coverage-surface") return Promise.resolve(coverageSurfacePayload);
      return Promise.resolve(simulationPayload);
    });

    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    const signalButton = screen.getByRole("button", { name: "Signal layer" });
    fireEvent.click(signalButton);
    await waitFor(() => expect(signalButton).toHaveAttribute("data-surface-state", "ready"));

    fireEvent.change(screen.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }), { target: { value: "31" } });
    expect(signalButton).toBeDisabled();
    expect(signalButton).toHaveAttribute("data-surface-state", "unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(signalButton).toHaveAttribute("data-surface-state", "available"));
  });

  it("does not launch a sector request when switching into network planning", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    await act(async () => Promise.resolve());

    expect(api.postJSON).not.toHaveBeenCalled();
    expect(within(screen.getByRole("group", { name: "Primary action" })).getByRole("button", { name: "Select cells" })).toBeEnabled();
    expect(screen.getByText("Minimum 2 · Maximum 8")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analyze workspace" }));
    expect(screen.getByRole("button", { name: "Interference" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Select at least two cells")).toBeInTheDocument();
  });

  it("keeps Setup selection feedback and a persistent header shortcut while selection is active", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    const setup = screen.getByRole("dialog", { name: "Setup" });

    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    const selectOnMap = within(setup).getByRole("button", { name: "Select cells on map" });
    expect(selectOnMap).toBeInTheDocument();
    fireEvent.click(selectOnMap);

    expect(screen.getByRole("dialog", { name: "Setup" })).toBeInTheDocument();
    expect(screen.getByText("Selecting cells on map…")).toHaveAttribute("role", "status");
    expect(within(screen.getByRole("group", { name: "Primary action" })).getByRole("button", { name: "Select cells" })).toBeEnabled();
    expect(within(setup).queryByRole("button", { name: "Select cells on map" })).not.toBeInTheDocument();
    expect(api.postJSON).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Inspect" })).toHaveAttribute("aria-pressed", "true");
    expect(within(setup).getByRole("button", { name: "Select cells on map" })).toBeInTheDocument();
    expect(api.postJSON).not.toHaveBeenCalled();
  });

  it.each(["success", "error", "cancellation", "supersession"])("removes active feedback and clears its timer on %s", async (outcome) => {
    useNetworkFixture = true;
    let resolveOptimization;
    let rejectOptimization;
    const deferred = new Promise((resolve, reject) => { resolveOptimization = resolve; rejectOptimization = reject; });
    let resolveReplacement;
    const replacement = new Promise((resolve) => { resolveReplacement = resolve; });
    let optimizationCalls = 0;
    api.postJSON.mockImplementation((path) => path === "/api/optimize-network"
      ? (++optimizationCalls === 1 ? deferred : replacement)
      : Promise.resolve(simulationPayload));
    const intervals = vi.spyOn(window, "setInterval");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const view = render(<App />);
    try {
      await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Network mode, 1 selected" })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Select map tower 102" }));
      openWorkspaceTool("Propagation");
      fireEvent.click(screen.getByRole("button", { name: "Optimize Network" }));
      await waitFor(() => expect(api.postJSON.mock.calls.filter(([path]) => path === "/api/optimize-network")).toHaveLength(1));
      const busy = screen.getByRole("button", { name: "Optimizing network…" });
      fireEvent.click(busy);
      fireEvent.click(busy);
      expect(api.postJSON.mock.calls.filter(([path]) => path === "/api/optimize-network")).toHaveLength(1);
      await waitFor(() => expect(screen.getByLabelText("Network optimization activity")).toHaveTextContent("2 cells · 2 passes · 146 proposals"));
      const timerIndex = intervals.mock.calls.findIndex(([, delay]) => delay === 250);
      const timer = intervals.mock.results[timerIndex].value;
      if (outcome === "success") {
        await act(async () => resolveOptimization(networkOptimizationPayload));
      } else if (outcome === "error") {
        await act(async () => rejectOptimization(new Error("RF analysis exceeded its request deadline")));
        expect(screen.getByText("RF analysis exceeded its request deadline")).toBeInTheDocument();
      } else {
        const signal = api.postJSON.mock.calls.find(([path]) => path === "/api/optimize-network")[3];
        fireEvent.change(screen.getByRole("slider", { name: "Ray count" }), { target: { value: "84" } });
        expect(signal.aborted).toBe(true);
        // Feedback stops before the cancelled request's promise settles.
        expect(screen.queryByLabelText("Network optimization activity")).not.toBeInTheDocument();
        if (outcome === "supersession") {
          fireEvent.click(screen.getByRole("button", { name: "Optimize Network" }));
          await waitFor(() => expect(optimizationCalls).toBe(2));
        }
        await act(async () => rejectOptimization(Object.assign(new Error("Cancelled"), { name: "AbortError" })));
        if (outcome === "supersession") {
          expect(screen.getByRole("button", { name: "Optimizing network…" })).toBeDisabled();
          await waitFor(() => expect(screen.getByLabelText("Network optimization activity")).toHaveTextContent("2 cells · 2 passes · 146 proposals"));
          await act(async () => resolveReplacement(networkOptimizationPayload));
        }
      }
      expect(screen.queryByLabelText("Network optimization activity")).not.toBeInTheDocument();
      expect(clearInterval).toHaveBeenCalledWith(timer);
      expect(screen.getByRole("button", { name: "Optimize Network" })).toBeEnabled();
    } finally {
      view.unmount();
      intervals.mockRestore();
      clearInterval.mockRestore();
    }
  });

  it("sends compact priority values and feasibility limits unchanged", async () => {
    useNetworkFixture = true;
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Select map tower 101" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Select map tower 102" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Network mode, 2 selected" })).toHaveAttribute("aria-pressed", "true"));

    fireEvent.click(screen.getByRole("button", { name: "Simulate workspace" }));
    openWorkspaceTool("Propagation");
    fireEvent.click(screen.getByRole("button", { name: /^Advanced analysis/ }));
    const priorities = [
      ["Demand importance", "80"],
      ["Residential importance", "30"],
      ["Propagation reach importance", "40"],
      ["Reduce overlap importance", "20"],
      ["Radio quality importance", "10"],
    ];
    for (const [label, value] of priorities) {
      fireEvent.change(screen.getByRole("slider", { name: label }), { target: { value } });
    }
    fireEvent.click(screen.getByText("Feasibility constraints"));
    fireEvent.change(screen.getByRole("spinbutton", { name: /Maximum overlap/ }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Optimize Network" }));

    await waitFor(() => expect(api.postJSON).toHaveBeenCalledWith(
      "/api/optimize-network",
      expect.any(Object),
      "Network optimization request failed",
      expect.any(AbortSignal),
    ));
    const request = api.postJSON.mock.calls.find(([path]) => path === "/api/optimize-network")[1];
    expect(request.optimization).toEqual({
      objectives: [
        { id: "demand", weight: 80 },
        { id: "residential", weight: 30 },
        { id: "coverage", weight: 40 },
        { id: "overlap", weight: 20 },
        { id: "radio_quality", weight: 10 },
      ],
      constraints: { max_overlap_buildings: 5 },
    });
  });

  it("accepts eight Cells and refuses a ninth without RF dispatch", async () => {
    const nine = { type: "FeatureCollection", features: Array.from({ length: 9 }, (_, i) => point(`tower-${i+1}`, String(101+i),32.85+i*.001,39.92+i*.001)) };
    api.getJSON.mockImplementation((path) => Promise.resolve(path === "/api/towers" ? nine : {}));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    for (let i=1;i<8;i+=1) fireEvent.click(screen.getByRole("button", { name: `Select map tower ${101+i}` }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Network mode, 8 selected" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Select map tower 109" }));
    expect(screen.getByRole("button", { name: "Network mode, 8 selected" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Network planning supports up to 8 selected cells");
    expect(api.postJSON).not.toHaveBeenCalled();
  });

  it("dispatches the six-cell RF workflow exactly once per action under StrictMode", async () => {
    const sixCells = { type: "FeatureCollection", features: Array.from({ length: 6 }, (_, index) =>
      point(`tower-${index + 1}`, String(101 + index), 32.85 + index * 0.001, 39.92 + index * 0.001)) };
    api.getJSON.mockImplementation((path) => Promise.resolve(path === "/api/towers" ? sixCells : {}));
    api.postJSON.mockImplementation((path) => Promise.resolve(
      path === "/api/evaluate-network" ? networkOptimizationPayload : simulationPayload,
    ));
    render(<StrictMode><App /></StrictMode>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    expect(api.postJSON).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Network mode, 1 selected" })).toBeInTheDocument());
    for (let index = 1; index < 6; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: `Select map tower ${101 + index}` }));
    }
    await waitFor(() => expect(screen.getByRole("button", { name: "Network mode, 6 selected" })).toBeInTheDocument());
    expect(api.postJSON).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Evaluate Network" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    expect(api.postJSON.mock.calls.map(([path]) => path)).toEqual(["/api/evaluate-network", ...Array(6).fill("/api/simulate")]);

    openWorkspaceTool("Results");
    fireEvent.click(screen.getByRole("button", { name: "Close tool drawer" }));
    openWorkspaceTool("Interference");
    expect(api.postJSON).toHaveBeenCalledTimes(7);
    fireEvent.click(screen.getByRole("button", { name: "Analyze Interference", exact: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Analyze Interference", exact: true })).toBeEnabled());
    expect(api.postJSON.mock.calls.map(([path]) => path)).toEqual(["/api/evaluate-network", ...Array(6).fill("/api/simulate"), "/api/interference"]);
    openWorkspaceTool("Results");
    openWorkspaceTool("Propagation");
    expect(api.postJSON).toHaveBeenCalledTimes(8);
    fireEvent.click(screen.getByRole("button", { name: "Evaluate Network" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    expect(api.postJSON).toHaveBeenCalledTimes(15);
    expect(api.postJSON.mock.calls.slice(8).map(([path, payload]) => [path, payload]))
      .toEqual(api.postJSON.mock.calls.slice(0, 7).map(([path, payload]) => [path, payload]));
  });

  it("labels a single network evaluation without implying a failed Pareto search", async () => {
    useNetworkFixture = true;
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Select map tower 101" })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Network mode, 1 selected" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Select map tower 102" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Network mode, 2 selected" })).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Evaluate Network" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Evaluate Network" }));

    await waitFor(() => expect(api.postJSON).toHaveBeenCalledWith(
      "/api/evaluate-network",
      expect.any(Object),
      "Network evaluation request failed",
      expect.any(AbortSignal),
    ));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    openWorkspaceTool("Results");

    const evaluation = screen.getByRole("region", { name: "Network evaluation summary" });
    expect(evaluation).toHaveTextContent("Single configuration evaluation");
    expect(evaluation).toHaveTextContent("This evaluates one configuration. Run network optimization to inspect Pareto alternatives.");
    expect(within(evaluation).queryByText("No feasible non-dominated set was found under the active constraints.")).not.toBeInTheDocument();
    expect(within(evaluation).queryByRole("button", { name: "Explore solutions" })).not.toBeInTheDocument();
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
    openWorkspaceTool("Propagation");
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
    openWorkspaceTool("Results");
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
    openWorkspaceTool("Propagation");
    await waitFor(() => expect(screen.getByRole("button", { name: "Optimize Network" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Optimize Network" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    openWorkspaceTool("Results");
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
    openWorkspaceTool("Propagation");
    fireEvent.click(screen.getByRole("button", { name: /^Advanced analysis/ }));
    fireEvent.change(screen.getByRole("slider", { name: "Demand importance" }), { target: { value: "100" } });
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    openWorkspaceTool("Results");
    fireEvent.click(screen.getByRole("button", { name: "Explain Cell 101 marginal effect" }));
    expect(api.postJSON.mock.calls.filter(([path]) => path === "/api/explain-network-cell")).toHaveLength(1);
    expect(screen.getByText("Selected solution − cell reverted to baseline")).toBeInTheDocument();
  });

  it("cancels map area selection with Escape", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Setup" })).getByRole("button", { name: "Select cells on map" }));
    expect(screen.getByText("Selecting cells on map…")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Map interaction mode" })).getByRole("button", { name: "Select cells" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Draw selection area" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Primary action" })).getByRole("button", { name: "Select cells" })).toBeDisabled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Map interaction mode" })).getByRole("button", { name: "Select cells" })).toHaveAttribute("aria-pressed", "true");
    expect(api.postJSON).not.toHaveBeenCalled();
  });

  it("keeps propagation assumptions available before interference analysis", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    openWorkspaceTool("Data");
    fireEvent.click(screen.getByRole("button", { name: "Advanced model details" }));
    expect(screen.getByRole("region", { name: "Propagation model assumptions" })).toBeInTheDocument();
    expect(screen.getByText("FSPL + footprint obstruction")).toBeInTheDocument();
    expect(screen.getByText(/Fast fading, diffraction, sidelobes/)).toBeInTheDocument();
  });

  it("keeps the header action and the contextual empty-state action through stage changes", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    openWorkspaceTool("Results");
    expect(within(screen.getByRole("group", { name: "Primary action" })).getByRole("button", { name: "Run Sector" })).toBeEnabled();
    expect(within(screen.getByRole("dialog", { name: "Results" })).getByRole("button", { name: "Run Sector" })).toBeEnabled();

    openWorkspaceTool("Setup");
    expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled();
  });

  it("restores a deleted inventory cell from the undo notice", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    openInventoryCell("101");
    fireEvent.click(screen.getByRole("button", { name: "Delete 101" }));
    expect(screen.getByText("Deleted cell 101.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete 101" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Cell 101" }));
    expect(screen.getByRole("button", { name: "Delete 101" })).toBeInTheDocument();
  });

  it("sends edited per-cell inventory profiles with RF requests", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    openInventoryCell("101");
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
    openWorkspaceTool("Data");
    fireEvent.click(screen.getByText(/^Dataset details/));
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
    await waitFor(() => expect(screen.getByRole("button", { name: /Open Current result details/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    openWorkspaceTool("Data");
    fireEvent.click(screen.getByRole("button", { name: /^Research \/ reference/ }));
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

    expect(screen.queryByRole("button", { name: /Open Current result details/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Apply correction to plan")).not.toBeInTheDocument();
    expect(screen.getByText("Result out of date", { selector: ".run-state" })).toBeInTheDocument();
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
