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
  it.each([
    { networkSelectionCount: 6, disabled: false },
    { networkSelectionCount: 1, disabled: true },
    { networkSelectionCount: 6, optimizationConfigValid: false, disabled: true },
  ])("keeps idle and unavailable network actions separate from busy semantics: %j", ({ disabled, ...overrides }) => {
    renderPanel({ activeTool: "propagation", ...overrides });
    const button = screen.getByRole("button", { name: "Optimize Network" });
    expect(button).toHaveAttribute("aria-busy", "false");
    if (disabled) expect(button).toBeDisabled();
    else expect(button).toBeEnabled();
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(button.querySelector("svg")).not.toHaveClass("spin");
  });

  it("keeps the network busy action native, quiet, and protected from repeat clicks", () => {
    const onOptimizeNetwork = vi.fn();
    renderPanel({ activeTool: "propagation", networkSelectionCount: 6, isOptimizing: true, onOptimizeNetwork });
    const button = screen.getByRole("button", { name: "Optimizing network…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg")).not.toHaveClass("spin");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onOptimizeNetwork).not.toHaveBeenCalled();
  });

  it("formats angular controls without a space before the degree symbol", () => {
    renderPanel({ activeTool: "propagation", planningMode: "single" });
    expect(screen.getByText("90°")).toBeInTheDocument();
    expect(screen.getByText("120°")).toBeInTheDocument();
  });

  it("disables analysis until two cells are selected", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /Analyze Interference/i })).toBeDisabled();
  });

  it.each(["light", "dark"])("preserves native action semantics in %s theme", (theme) => {
    document.documentElement.dataset.theme = theme;
    const onAnalyzeInterference = vi.fn();
    const view = renderPanel({ networkSelectionCount: 2, onAnalyzeInterference });
    const button = screen.getByRole("button", { name: "Analyze Interference" });
    expect(button).toBeEnabled();
    expect(button).toHaveClass("analyze-button");
    expect(button.querySelector("svg")).toBeInTheDocument();
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onAnalyzeInterference).toHaveBeenCalledOnce();
    view.unmount();
    delete document.documentElement.dataset.theme;
  });

  it.each([
    { networkSelectionCount: 1 },
    { isLoading: true },
    { isOptimizing: true },
    { isAnalyzingInterference: true },
  ])("keeps the readiness guard for %j", (guard) => {
    const onAnalyzeInterference = vi.fn();
    renderPanel({ networkSelectionCount: 2, onAnalyzeInterference, ...guard });
    const button = screen.getByRole("button", { name: /Analyze Interference|Analyzing/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onAnalyzeInterference).not.toHaveBeenCalled();
  });

  it("shows the 6G not-applicable state", () => {
    renderPanel({
      settings: { ...baseSettings, frequencyGHz: 140 },
      interferenceApplicable: false,
      networkSelectionCount: 2,
    });
    expect(screen.getByText(/UNSUPPORTED for 6G research profile/i)).toBeInTheDocument();
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

  it("keeps technology labels balanced, explains TX bounds, and separates network counts", () => {
    renderPanel({ activeTool: "setup", planningMode: "network", networkSelectionCount: 6 });
    const research = screen.getByRole("button", { name: /6G research profile/ });
    expect(research).toHaveTextContent("6G research140 GHz");
    expect(screen.getByText("Valid range: 0–60 dBm")).toBeInTheDocument();
    expect(screen.getByText("Selected network")).toBeInTheDocument();
    expect(screen.getByText("6 of 6 cells selected")).toBeInTheDocument();
  });
});
