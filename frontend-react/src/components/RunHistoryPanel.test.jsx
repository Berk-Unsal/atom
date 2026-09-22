import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RunHistoryPanel from "./RunHistoryPanel.jsx";

const baseRun = {
  run_id: "run-1",
  run_type: "simulation",
  status: "succeeded",
  created_at: "2026-09-21T10:00:00.000Z",
  scenario_revision_id: null,
  scenario_fingerprint: "rf-scenario-1",
  dataset_references: [{ dataset_id: "ankara", version: "1", content_hashes: {} }],
  engine: { name: "A.T.O.M", version: "test" },
  summary: { avg_rx_dbm: -88 },
  warnings: [],
  error: null,
  details: { result_summary: { stats: { avg_rx_dbm: -88 } } },
};
const sourceScenario = {
  id: "scenario-1",
  name: "Baseline",
  domain: { scenario_id: "scenario-1", revisions: [{ scenario_revision_id: "revision-1", revision: 1 }] },
};

describe("RunHistoryPanel", () => {
  it("renders an explicit empty state", () => {
    render(<RunHistoryPanel runs={[]} />);
    expect(screen.getByText("No saved Runs yet. Run a simulation or optimization to create one.")).toBeInTheDocument();
  });

  it("inspects a simulation and explains compact visualization retention", () => {
    render(<RunHistoryPanel runs={[baseRun]} />);
    expect(screen.getByRole("article", { name: "Run run-1 details" })).toHaveTextContent("Simulation");
    expect(screen.getByText("Detailed visualization was not retained. Run again to regenerate the map layers.")).toBeInTheDocument();
  });

  it("shows failed, cancelled, and interrupted lifecycle semantics", () => {
    const failed = { ...baseRun, run_id: "failed", status: "failed", error: { code: "compute_failed", message: "capacity" } };
    const cancelled = { ...baseRun, run_id: "cancelled", status: "cancelled", error: { code: "run_cancelled", message: "user" } };
    const interrupted = { ...baseRun, run_id: "interrupted", status: "failed", error: { code: "run_interrupted", message: "browser restart" } };
    render(<RunHistoryPanel runs={[failed, cancelled, interrupted]} />);
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /cancelled/i }));
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /interrupted/i }));
    expect(screen.getAllByText("Interrupted").length).toBeGreaterThan(0);
  });

  it("exposes public historical optimization solutions and applies them", () => {
    const onApplySolution = vi.fn();
    const optimization = {
      ...baseRun,
      run_id: "optimization-1",
      run_type: "optimization",
      scenario_id: "scenario-1",
      scenario_revision_id: "revision-1",
      details: {
        recommended_solution_id: "pareto-a",
        public_pareto_solutions: [{
          id: "pareto-a",
          optimization_solution_id: "durable-solution-1",
          cell_configurations: [{ id: "101", optimal_azimuth: 90 }],
        }],
      },
    };
    render(<RunHistoryPanel runs={[optimization]} scenarios={[sourceScenario]} onApplySolution={onApplySolution} />);
    fireEvent.click(screen.getByRole("button", { name: /Apply solution from optimization-1/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Optimization Run optimization-1 · pareto-a");
    fireEvent.click(screen.getByRole("button", { name: "Create new Version" }));
    expect(onApplySolution).toHaveBeenCalledWith(optimization, optimization.details.public_pareto_solutions[0], "version");
  });

  it("keeps rerun explicit and supports safe deletion callbacks", () => {
    const onRunAgain = vi.fn();
    const onDeleteRun = vi.fn();
    const rerunnable = { ...baseRun, canonical_input_snapshot: { request: { cell_id: "cell-1" } } };
    render(<RunHistoryPanel runs={[rerunnable]} onRunAgain={onRunAgain} onDeleteRun={onDeleteRun} />);
    fireEvent.click(screen.getByRole("button", { name: "Run again from this Run" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete run" }));
    expect(onRunAgain).toHaveBeenCalledWith(rerunnable);
    expect(onDeleteRun).toHaveBeenCalledWith(rerunnable);
  });

  it("keeps Open source Version keyboard focusable and preserves the selected Run", () => {
    const onOpenSource = vi.fn();
    const sourceRun = { ...baseRun, scenario_id: "scenario-1", scenario_revision_id: "revision-1" };
    render(<RunHistoryPanel runs={[sourceRun]} scenarios={[sourceScenario]} onOpenSource={onOpenSource} />);

    const openSource = screen.getByRole("button", { name: "Open source Version" });
    openSource.focus();
    expect(openSource).toHaveFocus();
    fireEvent.click(openSource);
    expect(onOpenSource).toHaveBeenCalledWith(sourceRun);
  });

  it("marks a missing source Version unavailable and does not offer misleading navigation", () => {
    const run = { ...baseRun, scenario_id: "scenario-1", scenario_revision_id: "revision-missing" };
    render(<RunHistoryPanel runs={[run]} scenarios={[sourceScenario]} />);

    expect(screen.getByText(/UNAVAILABLE · The exact source Version is not retained/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open source Version" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Run run-1 details" })).toHaveTextContent("Version unavailable");
  });

  it("offers historical report generation from a succeeded Run", () => {
    const onGenerateReport = vi.fn();
    const sourceRun = { ...baseRun, scenario_id: "scenario-1", scenario_revision_id: "revision-1" };
    render(<RunHistoryPanel runs={[sourceRun]} scenarios={[sourceScenario]} onGenerateReport={onGenerateReport} />);
    fireEvent.click(screen.getByRole("button", { name: /Generate report from Run run-1/i }));
    expect(screen.getByRole("heading", { name: "Generate a Report from this Run?" })).toBeInTheDocument();
    expect(screen.getByText("The Report will use this Run’s retained source Version. No RF rerun will be started.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("dialog").querySelector("button.primary"));
    expect(onGenerateReport).toHaveBeenCalledWith(sourceRun);
  });

  it("does not offer historical apply or Report actions without the exact source Version", () => {
    const optimization = {
      ...baseRun,
      run_type: "optimization",
      details: { public_pareto_solutions: [{ id: "pareto-a" }] },
    };
    render(<RunHistoryPanel runs={[optimization]} />);
    expect(screen.getAllByText(/UNAVAILABLE · The source Scenario Version is not retained/)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Generate report from/ })).not.toBeInTheDocument();
  });

  it("labels an unretained historical rerun input unavailable", () => {
    render(<RunHistoryPanel runs={[baseRun]} />);
    expect(screen.getByText(/UNAVAILABLE · Exact input for this Run was not retained/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run again from this Run" })).toBeDisabled();
  });
});
