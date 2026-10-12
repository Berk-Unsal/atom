import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MeasurementValidationPanel from "./MeasurementValidationPanel.jsx";

describe("MeasurementValidationPanel", () => {
  it("loads the controlled campaign and sends an isolated diagnostics request", () => {
    const onRun = vi.fn();
    render(<MeasurementValidationPanel analysis={null} isAnalyzing={false} onRun={onRun} />);
    fireEvent.click(screen.getByRole("button", { name: "Load synthetic control" }));
    expect(screen.getByRole("status")).toHaveTextContent("1 campaign");
    fireEvent.click(screen.getByRole("button", { name: "Run RF diagnostics" }));
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({
      operation: "compare_models",
      modelIDs: ["p525_fspl"],
      strategy: expect.objectContaining({ method: "all_samples" }),
    }));
  });

  it("renders status evidence without presenting a production winner", () => {
    render(<MeasurementValidationPanel analysis={{
      validation_fingerprint: "validation-test",
      readiness: { classification: "synthetic_controlled_only", production_candidate: false, required_gates: ["independent review"] },
      models: [{ model_id: "p525_fspl", model_version: "v1", status_counts: { applicable: 3 }, metric: { count: 3, mean_bias_db: 0, median_bias_db: 0, mae_db: 0, rmse_db: 0, std_db: 0, p10_db: 0, p90_db: 0 }, predictions: [] }],
    }} isAnalyzing={false} onRun={vi.fn()} />);
    expect(screen.getByText("Synthetic Controlled Only")).toBeInTheDocument();
    expect(screen.getByText("Production candidate")).toBeInTheDocument();
    expect(screen.getByText("No", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByText(/winner/i)).not.toBeInTheDocument();
  });
});
