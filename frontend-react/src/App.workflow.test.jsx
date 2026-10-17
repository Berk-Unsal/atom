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
  default: ({ fitRequest, onFinishAreaSelection, onSelectMapCell, onSelectTower, towers = [] }) => (
    <div data-testid="map-canvas" data-fit-request={JSON.stringify(fitRequest ?? null)}>
      <button
        type="button"
        aria-label="Finish mock area around all cells"
        onClick={() => onFinishAreaSelection?.([[32.84, 39.91], [32.87, 39.91], [32.87, 39.93], [32.84, 39.93]])}
      />
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
  Scenarios: ["plan", "Plan", "scenarios"],
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

function currentFitRequest() {
  return JSON.parse(screen.getByTestId("map-canvas").dataset.fitRequest);
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
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  it("preserves current RF evidence and local project when an import hits a budget guard", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await screen.findByRole("button", { name: /Open Current result details/i });
    fireEvent.click(screen.getByRole("button", { name: /^Project menu/ }));
    const menu = screen.getByRole("dialog", { name: "Project and scenarios" });
    fireEvent.click(within(menu).getByRole("button", { name: "Save Version" }));
    await waitFor(() => expect(within(menu).getByRole("status")).toHaveTextContent("Version saved"));
    const storageBefore = window.localStorage.getItem("atom.planning.workspace.v1");
    const rfCalls = api.postJSON.mock.calls.length;
    const text = JSON.stringify(Array.from({ length: 45 }).reduce((value) => ({ nested: value }), {}));
    const file = { size: text.length, text: async () => text };
    fireEvent.change(menu.querySelector('input[type="file"]'), { target: { files: [file] } });
    await waitFor(() => expect(within(menu).getByRole("status")).toHaveTextContent("nesting-depth limit"));
    expect(screen.getByRole("button", { name: /Open Current result details/i })).toBeInTheDocument();
    expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument();
    expect(window.localStorage.getItem("atom.planning.workspace.v1")).toBe(storageBefore);
    expect(api.postJSON).toHaveBeenCalledTimes(rfCalls);
    expect(await file.text()).toBe(text);
  });

  it.each([
    ["no underserved buildings", { gap_buildings: 0, gap_pct: 0, candidate_buildings: 122, returned_gaps: 0, total_gap_demand: 0, worst_rx_dbm: 0 }, true, "—"],
    ["underserved buildings", { gap_buildings: 3, gap_pct: 2.5, candidate_buildings: 122, returned_gaps: 3, total_gap_demand: 9, worst_rx_dbm: -121.4 }, false, "-121.4 dBm"],
  ])("presents a result with %s and exact metric units", async (_label, gapStats, empty, worstRx) => {
    const originalPost = api.postJSON.getMockImplementation();
    api.postJSON.mockImplementation((path, ...args) => path === "/api/analyze-sector"
      ? Promise.resolve({ simulation: simulationPayload, coverage_gaps: { geojson: { type: "FeatureCollection", features: [] }, stats: gapStats } })
      : originalPost(path, ...args));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    openWorkspaceTool("Results");

    expect(screen.getByText("Average Rx").closest(".metric-row")).toHaveTextContent("-88.0 dBm");
    expect(screen.getByText("Max range").closest(".metric-row")).toHaveTextContent("400.0 m");
    const panel = screen.getByRole("region", { name: "Coverage gap summary" });
    expect(panel.classList.contains("empty")).toBe(empty);
    expect(within(panel).getByText("Worst Rx").parentElement).toHaveTextContent(`Worst Rx${worstRx}`);
  });

  it("explains a single-sector result before its metrics without new RF work", async () => {
    const originalPost = api.postJSON.getMockImplementation();
    api.postJSON.mockImplementation((path, ...args) => path === "/api/analyze-sector"
      ? Promise.resolve({
        simulation: {
          ...simulationPayload,
          stats: { blocked_pct: 99.2, avg_rx_dbm: -185.5, min_range_m: 8.5, max_range_m: 400 },
          receiver_threshold: { sensitivity_dbm: -115 },
          rf_profile: { radius_m: 400 },
        },
        coverage_gaps: {
          geojson: { type: "FeatureCollection", features: [] },
          stats: { candidate_buildings: 122, gap_buildings: 0, gap_pct: 0, returned_gaps: 0, worst_rx_dbm: 0, building_service_threshold_dbm: -100 },
        },
      })
      : originalPost(path, ...args));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    openWorkspaceTool("Results");

    const note = screen.getByRole("note", { name: "Result interpretation" });
    expect(note).toHaveTextContent("99.2% of sampled rays end at a building-obstructed point (rays stop at the -115 dBm receiver sensitivity or the 400 m planning radius).");
    expect(note).toHaveTextContent("All 122 demand buildings in the sector are above the -100 dBm building-service threshold, so there are no coverage gaps.");
    // The interpretation comes before the metrics it explains.
    expect(note.compareDocumentPosition(screen.getByText("Blocked").closest(".metric-row")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const requestCount = api.postJSON.mock.calls.length;
    const help = screen.getByText("About these metrics", { selector: "summary" });
    expect(help.closest("details")).not.toHaveAttribute("open");
    help.focus();
    expect(help).toHaveFocus();
    fireEvent.click(help);
    expect(help.closest("details")).toHaveAttribute("open");
    expect(help.closest("details")).toHaveTextContent(/separate from receiver sensitivity/i);
    expect(help.closest("details")).toHaveTextContent(/not measurements, accuracy figures or a quality grade/i);
    expect(api.postJSON).toHaveBeenCalledTimes(requestCount);
  });

  it("offers Retry when the Cell inventory cannot load and reloads only on request", async () => {
    const originalGet = api.getJSON.getMockImplementation();
    let unreachable = true;
    api.getJSON.mockImplementation((path, ...args) => path === "/api/towers" && unreachable
      ? Promise.reject(Object.assign(new Error("A.T.O.M could not reach the planning API at http://localhost:3000. The backend may not be running or may be unreachable from this browser; start it (for example with docker compose up atom) and choose Retry."), { code: "api_unreachable" }))
      : originalGet(path, ...args));
    const towerLoads = () => api.getJSON.mock.calls.filter(([path]) => path === "/api/towers").length;
    render(<App />);
    const setup = screen.getByRole("dialog", { name: "Setup" });
    const alert = await within(setup).findByRole("alert");
    expect(alert).toHaveTextContent("could not reach the planning API at http://localhost:3000");
    expect(screen.getByRole("group", { name: "RF context" })).not.toHaveTextContent(/tower/i);
    expect(towerLoads()).toBe(1);

    unreachable = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    expect(towerLoads()).toBe(2);
    expect(within(setup).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks an out-of-range Setup value inline and routes the prompt to Setup", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    const power = screen.getByRole("spinbutton", { name: /Conducted TX power/ });
    expect(power).not.toHaveAttribute("aria-invalid");

    fireEvent.change(power, { target: { value: "99" } });
    expect(power).toHaveAttribute("aria-invalid", "true");
    expect(power).toHaveAccessibleDescription("Enter a value from 0 to 60 dBm.");
    const prompt = screen.getByText("RF profile needs attention").closest(".map-plan-prompt");
    expect(prompt).toHaveTextContent("Fix 1 invalid selected Cell profile in Setup.");
    expect(within(prompt).getByRole("button", { name: "Open Setup" })).toBeInTheDocument();
    expect(within(prompt).queryByRole("button", { name: "Open Inventory" })).not.toBeInTheDocument();

    fireEvent.change(power, { target: { value: "30" } });
    expect(power).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Enter a value from 0 to 60 dBm.")).not.toBeInTheDocument();
    expect(screen.queryByText("RF profile needs attention")).not.toBeInTheDocument();
  });

  it("routes an invalid per-Cell override to Inventory and opens it", async () => {
    const originalGet = api.getJSON.getMockImplementation();
    api.getJSON.mockImplementation((path, ...args) => path === "/api/towers"
      ? Promise.resolve({
        type: "FeatureCollection",
        features: [{ ...point("tower-1", "101", 32.85, 39.92), properties: { cell_id: "101", radio_type: "NR", tx_power_dbm: 99 } }],
      })
      : originalGet(path, ...args));
    render(<App />);
    const prompt = (await screen.findByText("RF profile needs attention")).closest(".map-plan-prompt");
    expect(prompt).toHaveTextContent("Fix 1 invalid selected Cell profile in Inventory.");
    fireEvent.click(within(prompt).getByRole("button", { name: "Open Inventory" }));
    expect(screen.getByRole("dialog", { name: "Inventory" })).toBeInTheDocument();
  });

  it("uses Cell terminology when no Cell is selected", async () => {
    const originalGet = api.getJSON.getMockImplementation();
    api.getJSON.mockImplementation((path, ...args) => path === "/api/towers"
      ? Promise.reject(new Error("Cell inventory could not be loaded"))
      : originalGet(path, ...args));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("group", { name: "RF context" })).toHaveTextContent("Single · No Cell selected"));
    expect(screen.getByRole("group", { name: "RF context" })).not.toHaveTextContent(/tower/i);
  });

  it("brings each completed RF result into view once and leaves view-only toggles alone", async () => {
    useNetworkFixture = true;
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    expect(currentFitRequest()).toBeNull();

    const before = Date.now();
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    const sectorFit = currentFitRequest();
    expect(sectorFit.version).toBe(1);
    // Automatic fit: carries the action start so a user map move during the run wins.
    expect(sectorFit.since).toBeGreaterThanOrEqual(before);
    // Frames the single sector's planning radius, not the city.
    expect(sectorFit.targets).toEqual([{ lat: 39.92, lon: 32.85, radiusMeters: 400 }]);

    const rfCalls = api.postJSON.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Propagation rays layer" }));
    fireEvent.click(screen.getByRole("button", { name: "Propagation rays layer" }));
    fireEvent.click(screen.getByRole("button", { name: "Map key" }));
    expect(currentFitRequest().version).toBe(1);
    expect(api.postJSON).toHaveBeenCalledTimes(rfCalls);

    fireEvent.click(screen.getByRole("button", { name: /^Network mode,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Select map tower 102" }));
    await screen.findByRole("button", { name: "Network mode, 2 selected" });
    expect(currentFitRequest().version).toBe(1);
    fireEvent.click(within(screen.getByRole("group", { name: "Primary action" })).getByRole("button", { name: "Evaluate Network" }));
    await waitFor(() => expect(currentFitRequest().version).toBe(2));
    expect(currentFitRequest().targets.map(({ lat, lon }) => [lat, lon])).toEqual([[39.92, 32.85], [39.922, 32.854]]);
    // The sector interpretation describes single-sector rays only; network results do not show it.
    openWorkspaceTool("Results");
    fireEvent.click(screen.getByRole("tab", { name: "RF" }));
    expect(screen.queryByRole("note", { name: "Result interpretation" })).not.toBeInTheDocument();

    openWorkspaceTool("Propagation");
    fireEvent.click(screen.getByRole("button", { name: "Optimize Network" }));
    await waitFor(() => expect(currentFitRequest().version).toBe(3));
    expect(currentFitRequest().since).toEqual(expect.any(Number));

    // The manual control always fits.
    fireEvent.click(screen.getByRole("button", { name: "Fit selected cells" }));
    expect(currentFitRequest()).toEqual(expect.objectContaining({ version: 4, since: null }));
  });

  it("fits a completed area selection to the selected Cells", async () => {
    useNetworkFixture = true;
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish mock area around all cells" }));
    await screen.findByRole("button", { name: "Network mode, 3 selected" });
    const areaFit = currentFitRequest();
    expect(areaFit.since).toBeNull();
    expect(areaFit.targets).toHaveLength(3);
    expect(areaFit.targets.every((target) => target.radiusMeters === 400)).toBe(true);
  });

  it("summarizes a completed interference analysis in its tool and opens it in Results", async () => {
    useNetworkFixture = true;
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select map tower 102" }));
    await screen.findByRole("button", { name: "Network mode, 2 selected" });
    openWorkspaceTool("Interference");
    expect(screen.queryByRole("status", { name: "Interference result summary" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analyze Interference" }));
    const summary = await screen.findByRole("status", { name: "Interference result summary" });
    expect(summary).toHaveTextContent("Serviceable surface");
    expect(summary).toHaveTextContent("Average SINR");
    expect(summary).toHaveTextContent("Affected demand");
    fireEvent.click(within(summary).getByRole("button", { name: "Open in Results" }));
    expect(screen.getByRole("dialog", { name: "Results" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Interference" })).toHaveAttribute("aria-selected", "true");
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

  it("presents a planning-mode switch without input changes neutrally and keeps input changes stale", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    const chip = await screen.findByRole("button", { name: /Open Current result details/i });
    expect(chip).toHaveTextContent(/Simulation · 1 Cell · avg Rx -88\.0 dBm/);
    expect(chip).not.toHaveTextContent(/[0-9a-f]{8}…/);

    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    const neutral = await screen.findByRole("button", { name: /Open Result from another planning mode details/i });
    expect(neutral).toHaveTextContent("OTHER MODE");
    expect(screen.queryByText("STALE")).not.toBeInTheDocument();
    expect(screen.getByText("Run needed", { selector: ".run-state" })).toBeInTheDocument();
    expect(screen.getByText("Result belongs to Single-sector mode. Switch back to Single-sector or run the current plan.")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }), { target: { value: "31" } });
    expect(await screen.findByText("STALE")).toBeInTheDocument();
    expect(screen.queryByText("OTHER MODE")).not.toBeInTheDocument();
    expect(screen.getByText("Result out of date", { selector: ".run-state" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Single/ }));
    expect(screen.getByText("STALE")).toBeInTheDocument();
  });

  it("words the same Version state identically in the header, Results and Scenarios", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await screen.findByRole("button", { name: /Open Current result details/i });
    fireEvent.click(screen.getByRole("button", { name: /^Project menu/ }));
    const menu = screen.getByRole("dialog", { name: "Project and scenarios" });
    fireEvent.click(within(menu).getByRole("button", { name: "Save Version" }));
    await waitFor(() => expect(within(menu).getByRole("status")).toHaveTextContent("Version saved"));
    fireEvent.click(screen.getByRole("button", { name: /^Project menu/ }));

    const state = "Version 1 · Unsaved changes";
    const lineage = document.querySelector(".workspace-lineage-context > summary");
    expect(lineage).toHaveAttribute("aria-label", "Workspace: Ankara Plan, Sector plan 1, Version 1");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }), { target: { value: "31" } });
    await waitFor(() => expect(lineage).toHaveAttribute("aria-label", `Workspace: Ankara Plan, Sector plan 1, ${state}`));
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await screen.findByRole("button", { name: /Open Current result details/i });
    expect(lineage).toHaveAttribute("aria-label", `Workspace: Ankara Plan, Sector plan 1, ${state}`);
    openWorkspaceTool("Results");
    expect(screen.getByRole("region", { name: "CURRENT context" })).toHaveTextContent(`Sector plan 1 · ${state}`);
    openWorkspaceTool("Scenarios");
    expect(screen.getByText(state, { selector: ".scenario-status" })).toBeInTheDocument();
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
    expect(within(screen.getByRole("group", { name: "Primary action" })).getByRole("button", { name: "Select 2+ cells" })).toBeEnabled();
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
    expect(within(screen.getByRole("group", { name: "Primary action" })).getByRole("button", { name: "Select 2+ cells" })).toBeEnabled();
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
        await act(async () => { resolveOptimization(networkOptimizationPayload); });
      } else if (outcome === "error") {
        await act(async () => { rejectOptimization(new Error("RF analysis exceeded its request deadline")); });
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
        await act(async () => { rejectOptimization(Object.assign(new Error("Cancelled"), { name: "AbortError" })); });
        if (outcome === "supersession") {
          expect(screen.getByRole("button", { name: "Optimizing network…" })).toBeDisabled();
          await waitFor(() => expect(screen.getByLabelText("Network optimization activity")).toHaveTextContent("2 cells · 2 passes · 146 proposals"));
          await act(async () => { resolveReplacement(networkOptimizationPayload); });
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

  it.each([6, 7, 8])("discloses Measurement6 and prevents out-of-scope RF with %i selected Cells", async (count) => {
    const cells = { type: "FeatureCollection", features: Array.from({ length: count }, (_, i) => point(`tower-${i + 1}`, String(101 + i), 32.85 + i * .001, 39.92 + i * .001)) };
    api.getJSON.mockImplementation((path) => Promise.resolve(path === "/api/towers" ? cells : {}));
    api.postJSON.mockResolvedValue({
      geojson: { type: "FeatureCollection", features: [] },
      stats: { sample_count: 1, valid_sample_count: 1, mae_db: 2 },
      calibration: { eligible: false, reason: "Insufficient spatial evidence for a correction." },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    for (let i = 1; i < count; i += 1) fireEvent.click(screen.getByRole("button", { name: `Select map tower ${101 + i}` }));
    expect(screen.getByRole("button", { name: `Network mode, ${count} selected` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evaluate Network", exact: true })).toBeEnabled();
    openWorkspaceTool("Data");
    expect(screen.getByRole("heading", { name: "CSV Measurement Validation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Research \/ reference/ })).not.toBeInTheDocument();
    expect(screen.getByText(/accepts one to 6 selected 4G\/5G Cells/)).toBeInTheDocument();
    const csv = "id,longitude,latitude,technology,rsrp_dbm\nm-1,32.85,39.92,5g,-80";
    fireEvent.change(screen.getByLabelText(/Import measurement CSV/i), { target: { files: [{ size: csv.length, text: () => Promise.resolve(csv) }] } });
    await waitFor(() => expect(screen.getAllByText("1 samples loaded").length).toBeGreaterThan(0));
    const action = screen.getByRole("button", { name: "Evaluate residuals" });
    if (count > 6) {
      expect(action).toBeDisabled();
      expect(screen.getByText(/Measurement Validation accepts up to 6 Cells/)).toBeInTheDocument();
      fireEvent.click(action);
      expect(api.postJSON).not.toHaveBeenCalled();
    } else {
      expect(action).toBeEnabled();
      fireEvent.click(action);
      await waitFor(() => expect(api.postJSON).toHaveBeenCalledOnce());
      expect(api.postJSON.mock.calls[0][0]).toBe("/api/measurements/evaluate");
      expect(api.postJSON.mock.calls[0][1].towers).toHaveLength(6);
      expect(await screen.findByText("Residual bias review")).toBeInTheDocument();
      expect(screen.queryByText("Spatially validated global bias")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Apply correction to plan" })).not.toBeInTheDocument();
    }
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
    const scoreHelp = within(evaluation).getByText("About this score", { selector: "summary" });
    expect(scoreHelp.closest("details")).not.toHaveAttribute("open");
    const requestCount = api.postJSON.mock.calls.length;
    fireEvent.click(scoreHelp);
    expect(scoreHelp.closest("details")).toHaveAttribute("open");
    expect(scoreHelp.closest("details")).toHaveTextContent(/normalized, preference-weighted utility/i);
    expect(scoreHelp.closest("details")).toHaveTextContent(/not a coverage percentage, measured field accuracy, probability, or confidence/i);
    expect(api.postJSON).toHaveBeenCalledTimes(requestCount);
  });

  it("compares two saved Versions from Results while a network result is present, without RF requests", async () => {
    useNetworkFixture = true;
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select map tower 102" }));
    await screen.findByRole("button", { name: "Network mode, 2 selected" });
    const saveVersion = async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Project menu/ }));
      const menu = screen.getByRole("dialog", { name: "Project and scenarios" });
      fireEvent.click(within(menu).getByRole("button", { name: "Save Version" }));
      await waitFor(() => expect(within(menu).getByRole("status")).toHaveTextContent("Version saved"));
      fireEvent.click(screen.getByRole("button", { name: /^Project menu/ }));
    };
    await saveVersion();
    openWorkspaceTool("Setup");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Conducted TX power (dBm)" }), { target: { value: "33" } });
    await saveVersion();
    openWorkspaceTool("Propagation");
    fireEvent.click(screen.getByRole("button", { name: "Optimize Network" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());

    openWorkspaceTool("Results");
    fireEvent.click(screen.getByRole("tab", { name: "Compare" }));
    const compare = screen.getByRole("region", { name: "Compare two states" });
    const stateA = within(compare).getByRole("combobox", { name: "Compare state A" });
    const stateB = within(compare).getByRole("combobox", { name: "Compare state B" });
    expect(stateA).toHaveDisplayValue("Optimization baseline");
    expect(stateB).toHaveDisplayValue("Recommended solution");
    expect(within(compare).getByRole("region", { name: "Baseline versus optimized comparison" })).toBeInTheDocument();

    const requestCount = api.postJSON.mock.calls.length;
    fireEvent.change(stateA, { target: { value: within(stateA).getByRole("option", { name: "Network plan 1 · Version 1" }).value } });
    fireEvent.change(stateB, { target: { value: within(stateB).getByRole("option", { name: "Network plan 1 · Version 2" }).value } });
    const inputs = within(compare).getByRole("region", { name: "Input differences" });
    expect(inputs).toHaveTextContent(/input difference/);
    expect(inputs).toHaveTextContent("RF and propagation");
    expect(within(compare).queryByRole("region", { name: "Baseline versus optimized comparison" })).not.toBeInTheDocument();
    expect(api.postJSON).toHaveBeenCalledTimes(requestCount);

    openWorkspaceTool("Scenarios");
    fireEvent.click(screen.getByText("Compare Scenarios and Versions"));
    fireEvent.click(screen.getByRole("button", { name: "Compare KPIs and inputs in Results → Compare" }));
    expect(await screen.findByRole("region", { name: "Compare two states" })).toBeInTheDocument();
    expect(api.postJSON).toHaveBeenCalledTimes(requestCount);
  });

  it("explains score and Pareto actions while reranking, applying and searching explicitly", async () => {
    useNetworkFixture = true;
    const payload = structuredClone(networkOptimizationPayload);
    payload.stats.network_score = 12345;
    payload.optimization.objective_score = 54321;
    payload.pareto_frontier.forEach((solution, index) => { solution.stats.network_score = 10000 + index; });
    const originalResponse = JSON.stringify(payload);
    const originalPost = api.postJSON.getMockImplementation();
    api.postJSON.mockImplementation((path, ...args) => path === "/api/optimize-network"
      ? Promise.resolve(payload)
      : originalPost(path, ...args));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select map tower 102" }));
    await screen.findByRole("button", { name: "Network mode, 2 selected" });

    fireEvent.click(screen.getByRole("button", { name: /^Project menu/ }));
    const menu = screen.getByRole("dialog", { name: "Project and scenarios" });
    fireEvent.click(within(menu).getByRole("button", { name: "Save Version" }));
    await waitFor(() => expect(within(menu).getByRole("status")).toHaveTextContent("Version saved"));
    fireEvent.click(screen.getByRole("button", { name: /^Project menu/ }));
    openWorkspaceTool("Propagation");
    fireEvent.click(screen.getByRole("button", { name: "Optimize Network" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    const firstRequest = structuredClone(api.postJSON.mock.calls.find(([path]) => path === "/api/optimize-network")[1]);
    const requestCount = api.postJSON.mock.calls.length;

    openWorkspaceTool("Results");
    fireEvent.click(screen.getByRole("tab", { name: "Solutions" }));
    const explorer = screen.getByRole("region", { name: "Pareto alternative solutions" });
    const scoreHelp = within(explorer).getByText("About this score", { selector: "summary" });
    fireEvent.click(scoreHelp);
    const scoreDetails = scoreHelp.closest("details");
    expect(scoreDetails).toHaveTextContent(/common scale.*different units/i);
    expect(scoreDetails).toHaveTextContent(/higher served demand.*lower overlap/i);
    expect(scoreDetails).toHaveTextContent(/unavailable objectives are excluded/i);
    expect(scoreDetails).toHaveTextContent(/varies Cell azimuths.*other configured RF and site inputs stay fixed/i);
    expect(explorer.querySelector(".pareto-detail-score")).toHaveTextContent("65.5 / 100");
    const actionsHelp = within(explorer).getByText("How to compare and use alternatives", { selector: "summary" });
    fireEvent.click(actionsHelp);
    const actions = actionsHelp.closest("details");
    expect(within(actions).getByLabelText("Illustrative Pareto trade-off")).toHaveTextContent(/not current results.*A serves more demand.*B serves less demand/i);
    expect(actions).toHaveTextContent(/neither is better on all objectives/i);
    expect(actions).toHaveTextContent(/Demand can favor A.*Reduce overlap can favor B/i);
    expect(within(actions).getAllByRole("listitem")).toHaveLength(4);
    expect(actions).toHaveTextContent(/Inspect:.*without an RF request/i);
    expect(actions).toHaveTextContent(/Rerank:.*locally.*no new RF request or search/i);
    expect(actions).toHaveTextContent(/Apply solution…:.*new Version or branch/i);
    expect(actions).toHaveTextContent(/New search:.*Optimize Network.*backend optimization search/i);
    fireEvent.click(screen.getByRole("button", { name: /Inspect Pareto solution 2/i }));
    expect(explorer.querySelector(".pareto-detail-score")).toHaveTextContent("65.3 / 100");
    expect(api.postJSON).toHaveBeenCalledTimes(requestCount);

    openWorkspaceTool("Propagation");
    fireEvent.click(screen.getByRole("button", { name: /^Advanced analysis/ }));
    for (const label of ["Demand importance", "Propagation reach importance", "Reduce overlap importance"]) {
      fireEvent.change(screen.getByRole("slider", { name: label }), { target: { value: "0" } });
    }
    fireEvent.change(screen.getByRole("slider", { name: "Residential importance" }), { target: { value: "100" } });
    openWorkspaceTool("Results");
    expect(screen.getByRole("button", { name: /Inspect Pareto solution 1, recommended/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Inspected solution" }).querySelector(".pareto-detail-score")).toHaveTextContent("73.3 / 100");
    expect(api.postJSON).toHaveBeenCalledTimes(requestCount);
    expect(JSON.stringify(payload)).toBe(originalResponse);

    openWorkspaceTool("Propagation");
    fireEvent.click(screen.getByRole("button", { name: "Optimize Network" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    const searches = api.postJSON.mock.calls.filter(([path]) => path === "/api/optimize-network");
    expect(searches).toHaveLength(2);
    expect(searches[1][1]).toEqual({
      ...firstRequest,
      // The completed first search loaded A's azimuths. Inspecting/reranking to B
      // must not silently replace them with B's 30°/150° in the next request.
      towers: firstRequest.towers.map((tower, index) => ({ ...tower, azimuth: [20, 140][index] })),
      optimization: {
        ...firstRequest.optimization,
        objectives: [
          { id: "demand", weight: 0 }, { id: "residential", weight: 100 },
          { id: "coverage", weight: 0 }, { id: "overlap", weight: 0 }, { id: "radio_quality", weight: 0 },
        ],
      },
    });
    const afterSearchCount = api.postJSON.mock.calls.length;
    openWorkspaceTool("Results");
    fireEvent.click(screen.getByRole("tab", { name: "Solutions" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply solution…" }));
    const dialog = screen.getByRole("dialog", { name: "Apply optimization solution?" });
    expect(dialog).toHaveTextContent(/source Run and Version stay unchanged.*fresh RF run/i);
    expect(within(dialog).getByRole("button", { name: "Create new Version" })).toBeEnabled();
    expect(api.postJSON).toHaveBeenCalledTimes(afterSearchCount);
    fireEvent.click(within(dialog).getByRole("button", { name: "Create new Version" }));
    await screen.findByText("Historical solution applied to a new Version. Run the plan to compute fresh visualization.");
    expect(api.postJSON).toHaveBeenCalledTimes(afterSearchCount);
    expect(JSON.stringify(payload)).toBe(originalResponse);
  });

  it("applies a Pareto alternative from a working-draft optimization by saving its starting plan", async () => {
    useNetworkFixture = true;
    const view = render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select map tower 102" }));
    await screen.findByRole("button", { name: "Network mode, 2 selected" });

    // Optimize directly in the working draft, without saving a Version first.
    openWorkspaceTool("Propagation");
    fireEvent.click(screen.getByRole("button", { name: "Optimize Network" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    const optimizeRequest = structuredClone(api.postJSON.mock.calls.find(([path]) => path === "/api/optimize-network")[1]);
    const requestCount = api.postJSON.mock.calls.length;

    openWorkspaceTool("Results");
    fireEvent.click(screen.getByRole("tab", { name: "Solutions" }));
    const explorer = screen.getByRole("region", { name: "Pareto alternative solutions" });
    // The recommended solution's azimuths were loaded into the draft when optimization completed.
    expect(within(explorer).getByRole("note")).toHaveTextContent(/working draft already uses this solution's azimuths/i);
    fireEvent.click(screen.getByRole("button", { name: /Inspect Pareto solution 2/i }));
    expect(within(explorer).queryByRole("note")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply solution…" }));
    const dialog = screen.getByRole("dialog", { name: "Apply optimization solution?" });
    expect(dialog).toHaveTextContent(/started from an unsaved working draft.*starting plan as Network plan 1 · Version 1/i);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save starting plan & create Version" }));
    await screen.findByText("Saved this Run's starting plan as Network plan 1 · Version 1 and applied the solution to a new Version. Run the plan to compute fresh visualization.");
    expect(api.postJSON).toHaveBeenCalledTimes(requestCount);

    // The applied Version carries solution B's azimuths into the next explicit run.
    fireEvent.click(within(screen.getByRole("group", { name: "Primary action" })).getByRole("button", { name: "Evaluate Network" }));
    await waitFor(() => expect(api.postJSON.mock.calls.some(([path]) => path === "/api/evaluate-network")).toBe(true));
    const evaluation = api.postJSON.mock.calls.find(([path]) => path === "/api/evaluate-network")[1];
    expect(evaluation.towers.map((tower) => tower.azimuth)).toEqual([30, 150]);
    expect(evaluation.towers.map((tower) => tower.id)).toEqual(optimizeRequest.towers.map((tower) => tower.id));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());

    const expectLineage = async () => {
      openWorkspaceTool("Scenarios");
      expect((await screen.findAllByText("Starting plan of Optimization", { exact: false })).length).toBeGreaterThan(0);
      expect(screen.getAllByText("Applied a public optimization solution as a new Version").length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole("button", { name: /^Version 2,/ }));
      const details = screen.getByRole("region", { name: "Version 2 details" });
      expect(details).toHaveTextContent("solution-b");
    };
    await expectLineage();

    // The saved starting plan and the applied Version survive a fresh mount of the workspace.
    view.unmount();
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Run Sector|Evaluate Network/ })).toBeEnabled());
    await expectLineage();
    expect(api.postJSON.mock.calls.filter(([path]) => path === "/api/optimize-network")).toEqual([
      ["/api/optimize-network", optimizeRequest, "Network optimization request failed", expect.any(AbortSignal)],
    ]);
  });

  it("carries an applied solution's azimuths into the plan when the Run has a saved source Version", async () => {
    useNetworkFixture = true;
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select map tower 102" }));
    await screen.findByRole("button", { name: "Network mode, 2 selected" });
    fireEvent.click(screen.getByRole("button", { name: /^Project menu/ }));
    const menu = screen.getByRole("dialog", { name: "Project and scenarios" });
    fireEvent.click(within(menu).getByRole("button", { name: "Save Version" }));
    await waitFor(() => expect(within(menu).getByRole("status")).toHaveTextContent("Version saved"));
    fireEvent.click(screen.getByRole("button", { name: /^Project menu/ }));

    openWorkspaceTool("Propagation");
    fireEvent.click(screen.getByRole("button", { name: "Optimize Network" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    openWorkspaceTool("Results");
    fireEvent.click(screen.getByRole("tab", { name: "Solutions" }));
    fireEvent.click(screen.getByRole("button", { name: /Inspect Pareto solution 2/i }));
    fireEvent.click(screen.getByRole("button", { name: "Apply solution…" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Apply optimization solution?" })).getByRole("button", { name: "Create new Version" }));
    await screen.findByText("Historical solution applied to a new Version. Run the plan to compute fresh visualization.");

    // Regression: numeric cell-ID keys previously lost to the saved record-ID azimuths (90°/90°).
    fireEvent.click(within(screen.getByRole("group", { name: "Primary action" })).getByRole("button", { name: "Evaluate Network" }));
    await waitFor(() => expect(api.postJSON.mock.calls.some(([path]) => path === "/api/evaluate-network")).toBe(true));
    const evaluation = api.postJSON.mock.calls.find(([path]) => path === "/api/evaluate-network")[1];
    expect(evaluation.towers.map((tower) => tower.azimuth)).toEqual([30, 150]);
  });

  it("keeps working-draft alternatives applicable after local priority reranking", async () => {
    useNetworkFixture = true;
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select map tower 102" }));
    await screen.findByRole("button", { name: "Network mode, 2 selected" });
    openWorkspaceTool("Propagation");
    fireEvent.click(screen.getByRole("button", { name: "Optimize Network" }));
    await waitFor(() => expect(screen.getByText("Ready", { selector: ".run-state" })).toBeInTheDocument());
    const requestCount = api.postJSON.mock.calls.length;

    // Reranking changes the current priorities locally; the Run's own priorities still define its starting plan.
    fireEvent.click(screen.getByRole("button", { name: /^Advanced analysis/ }));
    for (const label of ["Demand importance", "Propagation reach importance", "Reduce overlap importance"]) {
      fireEvent.change(screen.getByRole("slider", { name: label }), { target: { value: "0" } });
    }
    fireEvent.change(screen.getByRole("slider", { name: "Residential importance" }), { target: { value: "100" } });
    openWorkspaceTool("Results");
    fireEvent.click(screen.getByRole("tab", { name: "Solutions" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply solution…" }));
    const dialog = screen.getByRole("dialog", { name: "Apply optimization solution?" });
    expect(dialog).not.toHaveTextContent(/plan changed after this optimization/i);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save starting plan & create branch" }));
    await screen.findByText("Saved this Run's starting plan as Network plan 1 · Version 1 and applied the solution to a new branched Version. Run the plan to compute fresh visualization.");
    expect(api.postJSON).toHaveBeenCalledTimes(requestCount);
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
    // Both the map mode and the command-bar primary are visible here; only the map mode is "Select cells".
    expect(screen.getAllByRole("button", { name: "Select cells" })).toHaveLength(1);
    expect(within(screen.getByRole("group", { name: "Primary action" })).getByRole("button", { name: "Select 2+ cells" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Draw selection area" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Primary action" })).getByRole("button", { name: "Select 2+ cells" })).toBeDisabled();
    // The command bar and map mode controls have distinct accessible names.
    expect(screen.queryAllByRole("button", { name: "Select cells" }).length).toBeLessThanOrEqual(1);

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
