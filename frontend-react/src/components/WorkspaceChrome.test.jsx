import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapLegend, MapToolbar } from "./WorkspaceChrome.jsx";

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
});
