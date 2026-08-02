import { act, fireEvent, render, screen } from "@testing-library/react";
import { Activity } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import {
  CommandBar,
  MapLegend,
  MapToolbar,
  ProjectMenu,
  ToolSubnav,
  ToolDrawer,
  UndoToast,
  WorkflowRail,
} from "./WorkspaceChrome.jsx";

describe("focused workspace chrome", () => {
  it("exposes the RF command action and contextual result summary", () => {
    const onRun = vi.fn();
    const onOpenResults = vi.fn();
    render(
      <CommandBar
        appIconUrl="/icon/icon.svg"
        contextLabel="Network · 2 cells"
        isBusy={false}
        networkTech="5G NR"
        onOpenResults={onOpenResults}
        onRun={onRun}
        planSummary="28 GHz · 30 dBm · 400 m"
        primaryActionLabel="Evaluate Network"
        primaryDisabled={false}
        resultSummary={{ label: "Network plan", primary: "11.1K", secondary: "0 overlap" }}
        runState="Ready"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Evaluate Network" }));
    fireEvent.click(screen.getByRole("button", { name: /Open Network plan results/i }));
    expect(onRun).toHaveBeenCalledOnce();
    expect(onOpenResults).toHaveBeenCalledOnce();
  });

  it("uses workflow stages and skips unavailable tools when entering a stage", () => {
    const onSelectTool = vi.fn();
    render(
      <WorkflowRail
        activeTool="setup"
        drawerMode="tool"
        drawerOpen
        onSelectTool={onSelectTool}
        toolState={{ interference: { unavailable: true, reason: "Select at least two cells" } }}
      />,
    );

    expect(screen.getByRole("button", { name: "Plan workspace" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Analyze workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Review workspace" }));
    expect(onSelectTool).toHaveBeenCalledWith("core");
    expect(onSelectTool).toHaveBeenCalledWith("results");
  });

  it("keeps stage tools labeled and explains unavailable destinations", () => {
    const onSelectTool = vi.fn();
    render(
      <ToolSubnav
        activeTool="interference"
        onSelectTool={onSelectTool}
        toolState={{ interference: { unavailable: true, reason: "Select at least two cells" } }}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Analyze tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Interference" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Interference" })).toHaveAttribute("title", "Select at least two cells");
    fireEvent.click(screen.getByRole("button", { name: "5G Core" }));
    expect(onSelectTool).toHaveBeenCalledWith("core");
  });

  it("renders a focused drawer with Back and Close controls", () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(
      <ToolDrawer
        drawerMode="inspector"
        focusKey="tower-1"
        icon={Activity}
        onBack={onBack}
        onClose={onClose}
        open
        subtitle="Tower"
        title="Map Inspector"
      >
        <p>Cell 102</p>
      </ToolDrawer>,
    );

    expect(screen.getByRole("dialog", { name: "Map Inspector" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to previous tool" }));
    fireEvent.click(screen.getByRole("button", { name: "Close tool drawer" }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps layers in a popover and reveals metrics only with analysis data", () => {
    const onLayerMenuToggle = vi.fn();
    const props = {
      hasInterferenceData: true,
      interferenceMetric: "sinr",
      isDrawingSelection: false,
      layerMenuOpen: true,
      layerVisibility: {
        rays: true,
        gaps: true,
        selectedCells: true,
        communicationPaths: true,
        interference: true,
      },
      onCancelAreaSelection: vi.fn(),
      onClearNetworkSelection: vi.fn(),
      onDrawArea: vi.fn(),
      onFinishAreaSelection: vi.fn(),
      onFitSelectedCells: vi.fn(),
      onInterferenceMetricChange: vi.fn(),
      onLayerMenuToggle,
      onToggleLayer: vi.fn(),
      planningMode: "network",
      selectionCanFinish: false,
      selectedCount: 2,
    };
    render(<MapToolbar {...props} />);

    expect(screen.getByRole("group", { name: "Map layer visibility" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SINR" })).toHaveAttribute("aria-pressed", "true");
    const layersButton = screen.getByRole("button", { name: "Map layers" });
    fireEvent.keyDown(screen.getByRole("group", { name: "Map layer visibility" }), { key: "Escape" });
    expect(layersButton).toHaveFocus();
    fireEvent.click(layersButton);
    expect(onLayerMenuToggle).toHaveBeenCalledWith(false);
  });

  it("reports scenario durability only after persistence completes", async () => {
    let finishSave;
    const onSaveScenario = vi.fn(() => new Promise((resolve) => { finishSave = resolve; }));
    const project = { id: "project-1", name: "Plan", scenarios: [] };
    render(
      <ProjectMenu
        activeProject={project}
        compatible
        exportContent={() => "{}"}
        onAddProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onDeleteScenario={vi.fn()}
        onDuplicateProject={vi.fn()}
        onImportProject={vi.fn()}
        onOpenScenario={vi.fn()}
        onRenameProject={vi.fn()}
        onSaveScenario={onSaveScenario}
        onSelectProject={vi.fn()}
        projects={[project]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open project menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Save current" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Saving scenario…");

    await act(async () => finishSave());

    expect(screen.getByRole("status")).toHaveTextContent("Scenario saved");
  });

  it("requires explicit confirmation before deleting a project", () => {
    const onDeleteProject = vi.fn();
    const activeProject = { id: "project-1", name: "Ankara Plan", scenarios: [] };
    render(
      <ProjectMenu
        activeProject={activeProject}
        compatible
        exportContent={() => "{}"}
        onAddProject={vi.fn()}
        onDeleteProject={onDeleteProject}
        onDeleteScenario={vi.fn()}
        onDuplicateProject={vi.fn()}
        onImportProject={vi.fn()}
        onOpenScenario={vi.fn()}
        onRenameProject={vi.fn()}
        onSaveScenario={vi.fn()}
        onSelectProject={vi.fn()}
        projects={[activeProject, { id: "project-2", name: "Backup", scenarios: [] }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open project menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDeleteProject).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Confirm project deletion" })).toHaveTextContent("Ankara Plan");
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    expect(onDeleteProject).toHaveBeenCalledOnce();
  });

  it("offers an undo action for recoverable deletions", () => {
    const onUndo = vi.fn();
    render(<UndoToast message="Deleted scenario “Baseline”." onDismiss={vi.fn()} onUndo={onUndo} />);

    expect(screen.getByRole("status")).toHaveTextContent("Deleted scenario");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("explains visible map layers with text as well as color", () => {
    render(
      <MapLegend
        collapsed={false}
        hasGaps
        hasInterferenceData
        hasRays
        metric="sinr"
        onToggle={vi.fn()}
        planningMode="network"
      />,
    );

    expect(screen.getByRole("region", { name: "Cell markers" })).toHaveTextContent("Active cell");
    expect(screen.getByRole("region", { name: "Received power" })).toHaveTextContent("Strong ≥ −85 dBm");
    expect(screen.getByRole("region", { name: "Coverage gaps" })).toHaveTextContent("Outage");
    expect(screen.getByRole("region", { name: "SINR quality" })).toHaveTextContent("No signal");
  });
});
