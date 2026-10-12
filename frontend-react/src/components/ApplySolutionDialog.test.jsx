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
