import { fireEvent, render, screen } from "@testing-library/react";
import { Activity } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import {
  CommandBar,
  MapToolbar,
  ToolDrawer,
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

  it("shows availability reasons and toggles the active rail tool", () => {
    const onSelectTool = vi.fn();
    render(
      <WorkflowRail
        activeTool="setup"
        drawerMode="tool"
        drawerOpen
        onSelectTool={onSelectTool}
        toolState={{ interference: { disabled: true, reason: "Select at least two cells" } }}
      />,
    );

    expect(screen.getByRole("button", { name: "Setup" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Interference" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Interference" })).toHaveAttribute("title", "Select at least two cells");
    fireEvent.click(screen.getByRole("button", { name: "Results" }));
    expect(onSelectTool).toHaveBeenCalledWith("results");
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

    expect(screen.getByRole("menu", { name: "Map layer visibility" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SINR" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Layers/i }));
    expect(onLayerMenuToggle).toHaveBeenCalledWith(false);
  });
});
