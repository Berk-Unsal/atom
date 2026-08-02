import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ControlPanel from "./ControlPanel.jsx";

const baseSettings = {
  frequencyGHz: 28,
  txPowerDbm: 30,
  rayCount: 120,
  radiusMeters: 400,
  azimuthDeg: 90,
  beamWidthDeg: 120,
  interferenceBandwidthMHz: 100,
  cellLoadPct: 70,
  reuseFactor: 1,
  noiseFigureDb: 7,
  sampleSpacingMeters: 40,
};

function renderPanel(overrides = {}) {
  const props = {
    activeTool: "interference",
    settings: baseSettings,
    onChange: vi.fn(),
    onOptimizeAzimuth: vi.fn(),
    onOptimizeNetwork: vi.fn(),
    onAnalyzeInterference: vi.fn(),
    onFocusMap: vi.fn(),
    onPlanningModeChange: vi.fn(),
    isLoading: false,
    isOptimizing: false,
    isAnalyzingInterference: false,
    interferenceApplicable: true,
    networkSelectionCount: 1,
    planningMode: "network",
    selectionNotice: "",
    ...overrides,
  };
  return render(<ControlPanel {...props} />);
}

describe("ControlPanel interference controls", () => {
  it("formats angular controls without a space before the degree symbol", () => {
    renderPanel({ activeTool: "propagation", planningMode: "single" });
    expect(screen.getByText("90°")).toBeInTheDocument();
    expect(screen.getByText("120°")).toBeInTheDocument();
  });

  it("disables analysis until two cells are selected", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /Analyze Interference/i })).toBeDisabled();
  });

  it("shows the 6G not-applicable state", () => {
    renderPanel({
      settings: { ...baseSettings, frequencyGHz: 140 },
      interferenceApplicable: false,
      networkSelectionCount: 2,
    });
    expect(screen.getByText(/not available in 6G mode/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use 5G mmWave" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Analyze Interference/i })).not.toBeInTheDocument();
  });

  it("keeps unavailable interference guidance reachable", () => {
    const onPlanningModeChange = vi.fn();
    renderPanel({ planningMode: "single", onPlanningModeChange });

    fireEvent.click(screen.getByRole("button", { name: "Switch to Network mode" }));
    expect(onPlanningModeChange).toHaveBeenCalledWith("network");
  });

  it("offers a direct return to the map while the cluster is incomplete", () => {
    const onFocusMap = vi.fn();
    renderPanel({ onFocusMap });

    fireEvent.click(screen.getByRole("button", { name: "Select cells on map" }));
    expect(onFocusMap).toHaveBeenCalledOnce();
  });

  it("shows only the controls for the active workflow tool", () => {
    renderPanel({ activeTool: "setup" });
    expect(screen.getByText("Planning mode")).toBeInTheDocument();
    expect(screen.getByText("Network technology")).toBeInTheDocument();
    expect(screen.queryByText("Ray count")).not.toBeInTheDocument();
  });
});
