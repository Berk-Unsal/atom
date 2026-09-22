import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createScenarioRevision } from "../domain/scenario.js";
import ScenarioPanel from "./ScenarioPanel.jsx";

const firstRevision = createScenarioRevision({
  scenario_id: "scenario-1",
  scenario_revision_id: "version-1",
  revision: 1,
  selected_cell_ids: ["cell-1"],
  rf_affecting_settings: { frequencyGHz: 28 },
  change_summary: "Initial sector",
});
const secondRevision = createScenarioRevision({
  ...firstRevision,
  scenario_revision_id: "version-2",
  revision: 2,
  parent_revision_id: "version-1",
  selected_cell_ids: ["cell-1", "cell-2"],
  rf_affecting_settings: { frequencyGHz: 39 },
  change_summary: "Add the second cell",
});
const scenario = {
  id: "legacy-scenario-1",
  name: "Baseline",
  description: "Ankara baseline",
  datasetRef: { id: "ankara", version: "1" },
  plan: { planningMode: "network", settings: { propagationModelID: "sbr" } },
  updatedAt: "2026-09-21T10:00:00.000Z",
  domain: {
    scenario_id: "scenario-1",
    current_revision_id: "version-2",
    revisions: [firstRevision, secondRevision],
  },
};

const baseProps = () => ({
  activeProject: { activeScenarioId: scenario.id, draft: null },
  activeScenario: scenario,
  onBranchScenario: vi.fn(),
  onContinueFromVersion: vi.fn(),
  onDeleteScenario: vi.fn(),
  onDuplicateScenario: vi.fn(),
  onFocusRevision: vi.fn(),
  onOpenReport: vi.fn(),
  onOpenReports: vi.fn(),
  onOpenRun: vi.fn(),
  onOpenScenario: vi.fn(),
  onRenameScenario: vi.fn(),
  onSaveVersion: vi.fn(),
  reportArtifacts: [{ artifact_id: "artifact-1", title: "Baseline report", scenario_id: "scenario-1", scenario_revision_id: "version-2", generated_at: "2026-09-21T11:00:00.000Z", format: "markdown" }],
  reportDefinitions: [],
  runs: [{
    run_id: "run-1",
    run_type: "simulation",
    status: "succeeded",
    scenario_id: "scenario-1",
    scenario_revision_id: "version-2",
    created_at: "2026-09-21T10:30:00.000Z",
    dataset_references: [{ dataset_id: "ankara", version: "1" }],
    engine: { name: "A.T.O.M", version: "test" },
    rf_contract: { model_version: "rf-v1" },
  }],
  scenarios: [scenario],
});

describe("ScenarioPanel", () => {
  it("shows the scenario switcher, immutable Version history, input diff, and lineage actions", () => {
    const props = baseProps();
    render(<ScenarioPanel {...props} />);

    expect(screen.getByRole("heading", { name: "Scenario and Versions" })).toBeInTheDocument();
    expect(screen.getAllByText("Version 2").length).toBeGreaterThan(0);
    expect(screen.getByText("Add the second cell")).toBeInTheDocument();
    expect(screen.getByText("RF and propagation")).toBeInTheDocument();
    expect(screen.getByText("Associated Runs")).toBeInTheDocument();
    expect(screen.getByText("Associated Reports")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue from Version" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Branch from here" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate scenario" })).toBeInTheDocument();
  });

  it("surfaces dirty draft state and keeps save explicit", () => {
    const props = baseProps();
    props.activeProject = { activeScenarioId: null, draft: { sourceScenarioId: scenario.id, plan: {} } };
    props.draftSourceScenario = scenario;
    render(<ScenarioPanel {...props} planDirty />);

    expect(screen.getByRole("status", { name: "Unsaved changes" })).toHaveTextContent("Unsaved changes");
    fireEvent.change(screen.getByRole("textbox", { name: "Version change summary" }), { target: { value: "Try a safer azimuth" } });
    fireEvent.click(screen.getByRole("button", { name: "Save version" }));
    expect(props.onSaveVersion).toHaveBeenCalledWith("Try a safer azimuth");
  });

  it("compares two Versions by input state and navigates to retained records", () => {
    const props = baseProps();
    const otherScenario = { ...scenario, id: "legacy-scenario-2", name: "Alternative", domain: { ...scenario.domain, scenario_id: "scenario-2" } };
    props.scenarios = [scenario, otherScenario];
    props.runs = [...props.runs, { ...props.runs[0], run_id: "run-2", scenario_id: "scenario-2" }];
    render(<ScenarioPanel {...props} />);

    expect(screen.getByRole("heading", { name: "Compare Scenario + Version" })).toBeInTheDocument();
    expect(screen.getByText("Input state first")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Run A" }));
    expect(props.onOpenRun).toHaveBeenCalledWith(props.runs[0]);
  });
});
