import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GenerateRunReportDialog from "./GenerateRunReportDialog.jsx";

describe("GenerateRunReportDialog", () => {
  const sourceContext = {
    scenario_name: "Base Plan",
    version_label: "Version 3",
    run_label: "Run run-17",
    run_created_at: "2026-09-22T10:00:00.000Z",
    current_workspace_label: "Capacity Plan · Version 5 · Unsaved changes",
  };

  it("names the historical source and current workspace before confirmation", () => {
    render(<GenerateRunReportDialog open sourceContext={sourceContext} />);
    expect(screen.getByText("Base Plan · Version 3")).toBeInTheDocument();
    expect(screen.getByText(/Run run-17 ·/)).toBeInTheDocument();
    expect(screen.getByText("Capacity Plan · Version 5 · Unsaved changes")).toBeInTheDocument();
    expect(screen.getByText(/No RF rerun will be started/)).toBeInTheDocument();
  });

  it("focuses Cancel and supports Escape and keyboard-reachable confirmation", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<GenerateRunReportDialog open onClose={onClose} onConfirm={onConfirm} sourceContext={sourceContext} />);

    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    const confirm = screen.getByRole("button", { name: "Generate report from Run run-17" });
    confirm.focus();
    expect(confirm).toHaveFocus();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
