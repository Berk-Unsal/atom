import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ApplySolutionDialog from "./ApplySolutionDialog.jsx";

describe("ApplySolutionDialog", () => {
  const sourceContext = {
    run_id: "run-18",
    run_type: "optimization",
    run_label: "Run run-18",
    scenario_name: "Base Plan",
    scenario_revision_id: "revision-3",
    version_label: "Version 3",
  };

  it("names the exact source and both destinations before applying", () => {
    render(<ApplySolutionDialog open sourceContext={sourceContext} solution={{ id: "solution-4" }} destinationBaseName="Capacity Plan" />);
    expect(screen.getByText("Base Plan · Version 3")).toBeInTheDocument();
    expect(screen.getByText("Optimization Run run-18 · solution-4")).toBeInTheDocument();
    expect(screen.getByText("Capacity Plan · new Version")).toBeInTheDocument();
    expect(screen.getByText("Capacity Plan optimized · new branch")).toBeInTheDocument();
  });

  it("offers to save a working-draft Run's starting plan before applying", () => {
    const onApply = vi.fn();
    const draftContext = { ...sourceContext, scenario_revision_id: null, scenario_name: "Working draft", version_label: "No saved Version" };
    render(
      <ApplySolutionDialog
        open
        onApply={onApply}
        sourceContext={draftContext}
        solution={{ id: "solution-4" }}
        draftSource={{ status: "available", scenarioName: "Network plan 1", versionLabel: "Version 1" }}
      />,
    );
    expect(screen.getByText("Network plan 1 · Version 1 (this Run's starting plan)")).toBeInTheDocument();
    expect(screen.getByText("Network plan 1 · new Version")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent(/started from an unsaved working draft.*Network plan 1 · Version 1, without results.*No new optimization runs/i);
    expect(screen.queryByText(/not bound to a retained source Version/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save starting plan & create branch" }));
    expect(onApply).toHaveBeenCalledWith("branch");
  });

  it("explains why a working-draft Run cannot be applied and keeps both actions disabled", () => {
    render(
      <ApplySolutionDialog
        open
        sourceContext={{ ...sourceContext, scenario_revision_id: null }}
        solution={{ id: "solution-4" }}
        draftSource={{ status: "unavailable", reason: "The plan changed after this optimization." }}
      />,
    );
    expect(screen.getByText("The plan changed after this optimization.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create new Version" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create branch" })).toBeDisabled();
  });

  it("keeps the cancel and destination actions keyboard reachable", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<ApplySolutionDialog open onApply={onApply} onClose={onClose} sourceContext={sourceContext} solution={{ id: "solution-4" }} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Create new Version" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledWith("version");
  });
});
