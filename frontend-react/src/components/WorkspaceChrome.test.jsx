import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandBar, MapLegend, MapToolbar, ProjectMenu, ToolDrawer, WorkflowRail } from "./WorkspaceChrome.jsx";
import { WORKSPACE_STAGES } from "./workspaceTools.js";

const toolbarProps = {
  availableLayers: { buildings: true, gaps: true, selectedCells: true, communicationPaths: true, interference: true, measurements: true },
  hasInterferenceData: false,
  hasRays: true,
  hasSignalSurface: true,
  interferenceMetric: "sinr",
  interactionMode: "inspect",
  canInspectMapFocus: true,
  isDrawingSelection: false,
  layerMenuOpen: false,
  layerVisibility: { rays: true, surfaces: true, buildings: false, gaps: true, selectedCells: true, communicationPaths: true, interference: true, measurements: true },
  onCancelAreaSelection: vi.fn(),
  onClearNetworkSelection: vi.fn(),
  onDrawArea: vi.fn(),
  onFinishAreaSelection: vi.fn(),
  onFitSelectedCells: vi.fn(),
  onInterferenceMetricChange: vi.fn(),
  onInteractionModeChange: vi.fn(),
  onInspectMapFocus: vi.fn(),
  onLayerMenuToggle: vi.fn(),
  onToggleLayer: vi.fn(),
  onRayScopeChange: vi.fn(),
  onSelectedMapCellChange: vi.fn(),
  planningMode: "network",
  focusCellOptions: [{ id: "cell-a", label: "Cell cell-a" }, { id: "cell-b", label: "Cell cell-b" }],
  rayScope: "all",
  selectedCount: 2,
  selectedMapCellId: "cell-a",
  selectionCanFinish: false,
};

describe("map display controls", () => {
  it("keeps result visibility, ray scope, and Map Focus as presentation controls", () => {
    const { rerender } = render(<MapToolbar {...toolbarProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Signal layer" }));
    fireEvent.click(screen.getByRole("button", { name: "Propagation rays layer" }));
    fireEvent.click(screen.getByRole("button", { name: "Map view options" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Ray scope" }), { target: { value: "selected" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Map focus cell" }), { target: { value: "cell-b" } });

    expect(toolbarProps.onToggleLayer).toHaveBeenCalledWith("surfaces");
    expect(toolbarProps.onToggleLayer).toHaveBeenCalledWith("rays");
    expect(toolbarProps.onRayScopeChange).toHaveBeenCalledWith("selected");
    expect(toolbarProps.onSelectedMapCellChange).toHaveBeenCalledWith("cell-b");
    expect(screen.getByRole("option", { name: "Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Select cells" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Select cells" }));
    expect(toolbarProps.onInteractionModeChange).toHaveBeenCalledWith("select-cells");
    fireEvent.click(screen.getByRole("button", { name: "Inspect focused cell" }));
    expect(toolbarProps.onInspectMapFocus).toHaveBeenCalledOnce();

    rerender(<MapToolbar {...toolbarProps} mapFocusIsInspected />);
    fireEvent.click(screen.getByRole("button", { name: "Map view options" }));
    expect(screen.queryByRole("button", { name: "Inspect focused cell" })).not.toBeInTheDocument();
  });

  it("shows only the current special map tool and contextualizes area drawing", () => {
    const { rerender } = render(
      <MapToolbar {...toolbarProps} interactionMode="select-cells" isDrawingSelection />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Draw area");
    expect(screen.getByRole("status")).toHaveTextContent("Click map points");
    expect(screen.getByRole("button", { name: "Finish" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inspect" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select cells" })).not.toBeInTheDocument();

    rerender(<MapToolbar {...toolbarProps} planningMode="single" interactionMode="select-cells" />);
    expect(screen.queryByRole("button", { name: "Draw selection area" })).not.toBeInTheDocument();
    rerender(<MapToolbar {...toolbarProps} planningMode="network" interactionMode="select-cells" />);
    expect(screen.getByRole("button", { name: "Draw selection area" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear selected cluster" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit selected cells" })).toBeInTheDocument();
  });

  it("keeps clearing cluster membership and fitting the map as separate immediate actions", () => {
    const onClearNetworkSelection = vi.fn();
    const onFitSelectedCells = vi.fn();
    const onInteractionModeChange = vi.fn();
    render(
      <MapToolbar
        {...toolbarProps}
        interactionMode="select-cells"
        onClearNetworkSelection={onClearNetworkSelection}
        onFitSelectedCells={onFitSelectedCells}
        onInteractionModeChange={onInteractionModeChange}
        planningMode="network"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear selected cluster" }));
    fireEvent.click(screen.getByRole("button", { name: "Fit selected cells" }));
    expect(onClearNetworkSelection).toHaveBeenCalledOnce();
    expect(onFitSelectedCells).toHaveBeenCalledOnce();
    expect(onInteractionModeChange).not.toHaveBeenCalled();
  });

  it("offers one radio-quality metric selector only when interference data exists", () => {
    const { rerender } = render(<MapToolbar {...toolbarProps} hasInterferenceData />);
    const metric = screen.getByRole("combobox", { name: "Radio-quality metric" });
    expect(metric).toHaveValue("sinr");
    expect(within(metric).getAllByRole("option").map((option) => option.value)).toEqual(["sinr", "rsrp", "rsrq"]);
    fireEvent.change(metric, { target: { value: "rsrq" } });
    expect(toolbarProps.onInterferenceMetricChange).toHaveBeenCalledWith("rsrq");
    expect(screen.queryByRole("button", { name: "SINR" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "RSRP" })).not.toBeInTheDocument();

    rerender(<MapToolbar {...toolbarProps} hasInterferenceData={false} />);
    expect(screen.queryByRole("combobox", { name: "Radio-quality metric" })).not.toBeInTheDocument();
  });

  it("returns focus to the View trigger when its disclosure closes with Escape", () => {
    render(<MapToolbar {...toolbarProps} />);
    const trigger = screen.getByRole("button", { name: "Map view options" });
    fireEvent.click(trigger);
    const focusCell = screen.getByRole("combobox", { name: "Map focus cell" });
    fireEvent.keyDown(focusCell, { key: "Escape" });

    expect(screen.queryByRole("group", { name: "Map view controls" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("shows the active received-power range and source cell in the legend", () => {
    render(
      <MapLegend
        collapsed={false}
        hasGaps={false}
        hasInterferenceData={false}
        hasRays={false}
        hasSignalSurface
        metric="sinr"
        onToggle={vi.fn()}
        planningMode="single"
        surface={{ stats: { min_dbm: -113, max_dbm: -71 } }}
        surfaceCellId="cell-a"
        surfaceDisplayThresholdDBm={-100}
      />,
    );

    expect(screen.getByRole("region", { name: "Map key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Map key" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Received signal surface" })).toBeInTheDocument();
    expect(screen.getByText("Visible ≥ −100 dBm · Cell cell-a")).toBeInTheDocument();
  });

  it("labels the active result source in the map legend", () => {
    render(
      <MapLegend
        collapsed={false}
        hasGaps={false}
        hasInterferenceData={false}
        hasRays
        hasSignalSurface={false}
        metric="sinr"
        onToggle={vi.fn()}
        planningMode="single"
        resultContext={{ freshness: "stale", scenario_name: "Capacity Plan", version_label: "Version 4", run_id: "run-21", run_label: "Run 21" }}
      />,
    );

    expect(screen.getByRole("region", { name: "Result source" })).toHaveTextContent("STALE");
    expect(screen.getByRole("region", { name: "Result source" })).toHaveTextContent("Capacity Plan · Version 4 · Run 21");
  });

  it("removes collapsed map-key content from the visible and pointer-accessible layout", () => {
    render(
      <MapLegend
        collapsed
        hasGaps={false}
        hasInterferenceData={false}
        hasRays={false}
        hasSignalSurface={false}
        metric="sinr"
        onToggle={vi.fn()}
        planningMode="single"
      />,
    );

    expect(screen.getByRole("button", { name: "Map key" })).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("map-legend-content")).toHaveAttribute("hidden");
  });
});

describe("persistent result and workspace context", () => {
  it("keeps Project, Scenario, Version, and draft state keyboard-readable in the header", () => {
    render(
      <CommandBar
        appIconUrl="/icon.svg"
        contextLabel="Single · Cell 101"
        lineageContext={{ project_name: "Ankara", scenario_name: "Capacity Plan", version_label: "Version 4", draft_state: "Unsaved changes", unsaved: true }}
        networkTech="5G"
        frequencyGHz="28"
        txPowerDbm="30"
        radiusMeters="400"
        projectControl={<button type="button">Ankara</button>}
        runState="Result out of date"
        resultContext={{ freshness: "stale", scenario_name: "Capacity Plan", version_label: "Version 4", run_id: "run-21", run_label: "Run 21" }}
      />,
    );

    const lineage = document.querySelector(".workspace-lineage-context > summary");
    expect(lineage).toHaveAttribute("aria-label", "Workspace: Ankara, Capacity Plan, Version 4, Unsaved changes");
    expect(lineage).toHaveTextContent("Version 4");
    expect(lineage).toHaveTextContent("Unsaved changes");
    lineage.focus();
    expect(lineage).toHaveFocus();
    expect(screen.getByText("STALE")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "RF context" })).toHaveTextContent("Single · Cell 101");
    expect(screen.getByRole("group", { name: "Status" })).toHaveTextContent("Result out of date");
    expect(screen.queryByText("Draft saved locally")).not.toBeInTheDocument();

    fireEvent.click(lineage);
    expect(screen.getByText("Workspace lineage")).toBeInTheDocument();
    expect(document.querySelector(".workspace-lineage-popover")).toHaveTextContent("Ankara");
    expect(screen.getByText(/saved locally in this browser; it is not an immutable Version/i)).toBeInTheDocument();
  });

  it("clarifies that saving a Version records the current plan when a stale Run exists", () => {
    render(
      <ProjectMenu
        activeProject={{ id: "project-1", name: "Ankara", scenarios: [] }}
        compatible
        exportContent={() => "{}"}
        onAddProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onDeleteScenario={vi.fn()}
        onDuplicateProject={vi.fn()}
        onImportProject={vi.fn()}
        onOpenScenario={vi.fn()}
        onRenameProject={vi.fn()}
        onSaveScenario={vi.fn()}
        onSelectProject={vi.fn()}
        projects={[]}
        staleResultRunLabel="Run 21"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open project menu" }));
    expect(screen.getByText("Save Version records the current plan. Run 21 remains tied to the input that produced it.")).toBeInTheDocument();
  });
});

describe("stage-owned tool choices", () => {
  it("keeps all thirteen workspace destinations discoverable from their owning stage", () => {
    const expectedTools = {
      plan: ["Setup", "Inventory"],
      simulate: ["Propagation", "Experiments", "Signal surface"],
      analyze: ["Interference", "RF Diagnostics", "Building entry", "5G Core"],
      review: ["Results", "Run history", "Data", "Report"],
    };
    const { rerender } = render(
      <WorkflowRail activeTool="setup" chooserStage="plan" onSelectTool={vi.fn()} onToggleChooser={vi.fn()} toolState={{}} />,
    );

    for (const stage of WORKSPACE_STAGES) {
      rerender(
        <WorkflowRail activeTool="setup" chooserStage={stage.id} onSelectTool={vi.fn()} onToggleChooser={vi.fn()} toolState={{}} />,
      );
      expect(screen.getByRole("dialog", { name: `${stage.label} tools` })).toBeInTheDocument();
      for (const label of expectedTools[stage.id]) {
        expect(screen.getByRole("button", { name: label, exact: true })).toBeInTheDocument();
      }
      if (stage.id === "plan") {
        expect(screen.getByRole("button", { name: "Setup", exact: true })).toHaveAttribute("aria-current", "page");
      }
    }
  });

  it("opens a stage chooser without selecting a different tool and marks the current tool", () => {
    const onToggleChooser = vi.fn();
    const onSelectTool = vi.fn();
    const props = { activeTool: "setup", chooserStage: null, onToggleChooser, onSelectTool, toolState: {} };
    const { rerender } = render(<WorkflowRail {...props} />);
    const plan = screen.getByRole("button", { name: "Plan workspace" });
    const simulate = screen.getByRole("button", { name: "Simulate workspace" });

    expect(plan).toHaveAttribute("aria-current", "step");
    expect(simulate).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(simulate);
    expect(onToggleChooser).toHaveBeenCalledWith("simulate");
    expect(onSelectTool).not.toHaveBeenCalled();

    rerender(<WorkflowRail {...props} chooserStage="plan" />);
    expect(screen.getByRole("button", { name: "Setup", exact: true })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Plan workspace" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Inventory", exact: true }));
    expect(onSelectTool).toHaveBeenCalledWith("inventory");
  });

  it("keeps unavailable choices visible and exposes their resolved reason", () => {
    const onSelectTool = vi.fn();
    render(
      <WorkflowRail
        activeTool="setup"
        chooserStage="analyze"
        onSelectTool={onSelectTool}
        onToggleChooser={vi.fn()}
        toolState={{ interference: { unavailable: true, reason: "Select at least two cells" } }}
      />,
    );

    const interference = screen.getByRole("button", { name: "Interference", exact: true });
    expect(interference).toHaveAttribute("aria-disabled", "true");
    expect(interference).toHaveAccessibleDescription("Unavailable Select at least two cells");
    expect(interference.querySelector(".stage-tool-choice-reason")).toHaveTextContent("Select at least two cells");
    fireEvent.click(interference);
    expect(onSelectTool).not.toHaveBeenCalled();
  });

  it("shows navigation labels without generic descriptions and retains concise status context", () => {
    render(
      <WorkflowRail
        activeTool="data"
        chooserStage="review"
        onSelectTool={vi.fn()}
        onToggleChooser={vi.fn()}
        toolState={{
          results: { badge: "•", tone: "success" },
          history: { badge: "3", tone: "success" },
          report: { badge: "!", tone: "warning" },
        }}
      />,
    );

    const choices = screen.getByRole("group", { name: "Review tools" });
    expect(choices).toHaveTextContent("Results");
    expect(choices).toHaveTextContent("Current");
    expect(choices).toHaveTextContent("Result");
    expect(choices).toHaveTextContent("3 runs");
    expect(choices).toHaveTextContent("Attention");
    expect(choices).not.toHaveTextContent("RF, optimization, and network comparisons");
    expect(screen.getByRole("button", { name: "Data", exact: true })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Run history", exact: true })).toHaveAccessibleDescription("3 runs");
  });

  it("renders the mobile chooser inside the existing drawer dialog", () => {
    render(
      <ToolDrawer
        chooser={{
          activeTool: "setup",
          onSelectTool: vi.fn(),
          stage: WORKSPACE_STAGES.find((stage) => stage.id === "review"),
          toolState: {},
        }}
        drawerMode="tool"
        focusKey="review-chooser"
        onClose={vi.fn()}
        open
        title="Setup"
      />,
    );

    expect(screen.getByRole("dialog", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Review tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run history", exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /tools/ })).not.toBeInTheDocument();
  });

  it("keeps the tool drawer mounted while it is concealed by inspection", () => {
    const { rerender } = render(
      <ToolDrawer drawerMode="tool" focusKey="setup" onClose={vi.fn()} open title="Setup">
        <div>Planning controls</div>
      </ToolDrawer>,
    );

    rerender(
      <ToolDrawer drawerMode="tool" focusKey="setup" concealed onClose={vi.fn()} open title="Setup">
        <div>Planning controls</div>
      </ToolDrawer>,
    );

    expect(screen.getByRole("dialog", { name: "Setup" })).toHaveClass("concealed");
    expect(screen.getByText("Planning controls")).toBeInTheDocument();
  });
});
