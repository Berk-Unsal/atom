import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandBar, MapLegend, MapToolbar, ProjectMenu } from "./WorkspaceChrome.jsx";

const toolbarProps = {
  availableLayers: { buildings: true, gaps: true, selectedCells: true, communicationPaths: true, interference: true, measurements: true },
  hasInterferenceData: false,
  hasRays: true,
  hasSignalSurface: true,
  interferenceMetric: "sinr",
  isDrawingSelection: false,
  layerMenuOpen: false,
  layerVisibility: { rays: true, surfaces: true, buildings: false, gaps: true, selectedCells: true, communicationPaths: true, interference: true, measurements: true },
  onCancelAreaSelection: vi.fn(),
  onClearNetworkSelection: vi.fn(),
  onDrawArea: vi.fn(),
  onFinishAreaSelection: vi.fn(),
  onFitSelectedCells: vi.fn(),
  onInterferenceMetricChange: vi.fn(),
  onLayerMenuToggle: vi.fn(),
  onToggleLayer: vi.fn(),
  onRayScopeChange: vi.fn(),
  onSelectedMapCellChange: vi.fn(),
  planningMode: "network",
  rayCellOptions: [{ id: "cell-a", label: "Cell cell-a" }, { id: "cell-b", label: "Cell cell-b" }],
  rayScope: "all",
  selectedCount: 2,
  selectedMapCellId: "cell-a",
  selectionCanFinish: false,
};

describe("map display controls", () => {
  it("keeps RF visibility, ray scope, and map focus as presentation controls", () => {
    render(<MapToolbar {...toolbarProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle received signal surface" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle propagation rays" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Ray scope" }), { target: { value: "selected" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Map focus cell" }), { target: { value: "cell-b" } });

    expect(toolbarProps.onToggleLayer).toHaveBeenCalledWith("surfaces");
    expect(toolbarProps.onToggleLayer).toHaveBeenCalledWith("rays");
    expect(toolbarProps.onRayScopeChange).toHaveBeenCalledWith("selected");
    expect(toolbarProps.onSelectedMapCellChange).toHaveBeenCalledWith("cell-b");
    expect(screen.getByRole("option", { name: "Hidden" })).toBeInTheDocument();
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
});

describe("persistent result and workspace context", () => {
  it("keeps Project, Scenario, Version, and draft state keyboard-readable in the header", () => {
    render(
      <CommandBar
        appIconUrl="/icon.svg"
        contextLabel="Single · Cell 101"
        draftUnsaved
        lineageContext={{ project_name: "Ankara", scenario_name: "Capacity Plan", version_label: "Version 4", draft_state: "Unsaved changes", unsaved: true }}
        networkTech="5G"
        projectControl={<button type="button">Ankara</button>}
        runState="Result out of date"
        resultContext={{ freshness: "stale", scenario_name: "Capacity Plan", version_label: "Version 4", run_id: "run-21", run_label: "Run 21" }}
      />,
    );

    const lineage = document.querySelector(".workspace-lineage-context > summary");
    expect(lineage).toHaveAttribute("aria-label", "Workspace lineage: Capacity Plan, Version 4, Unsaved changes");
    expect(lineage).toHaveTextContent("Version 4");
    expect(lineage).toHaveTextContent("Unsaved changes");
    lineage.focus();
    expect(lineage).toHaveFocus();
    expect(screen.getByText("STALE")).toBeInTheDocument();
    expect(screen.getByText("Draft saved locally")).toBeInTheDocument();

    fireEvent.click(lineage);
    expect(screen.getByText("Workspace lineage")).toBeInTheDocument();
    expect(document.querySelector(".workspace-lineage-popover")).toHaveTextContent("Ankara");
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
