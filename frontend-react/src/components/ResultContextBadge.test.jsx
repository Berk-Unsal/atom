import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ResultContextBadge from "./ResultContextBadge.jsx";

describe("ResultContextBadge", () => {
  const context = {
    freshness: "stale",
    project_id: "project-123",
    project_name: "Ankara Plan",
    scenario_id: "scenario-123",
    scenario_name: "Capacity Plan",
    scenario_revision_id: "revision-123",
    version_label: "Version 4",
    run_id: "run-12345678901234567890",
    run_label: "Simulation · 1 Cell · avg Rx -88.0 dBm · 09:00",
    run_type: "simulation",
    run_created_at: "2026-09-22T09:00:00.000Z",
    scenario_fingerprint: "scenario-fingerprint",
    input_fingerprint: "input-fingerprint",
    dataset_ref: { dataset_id: "ankara", version: "1" },
    unavailable_reason: "",
    unsupported_reason: "",
  };

  it("shows state, source Version, Run, and technical details on demand", () => {
    render(<ResultContextBadge context={context} />);
    expect(screen.getByText(/Result out of date · Simulation/)).toBeInTheDocument();
    expect(screen.getByText("Capacity Plan · Version 4")).toBeInTheDocument();
    expect(screen.getByText("Simulation · 1 Cell · avg Rx -88.0 dBm · 09:00", { selector: ".result-context-run" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "STALE context" })).toHaveTextContent("Run IDrun-12345678901234567890");
    expect(screen.getByText(/The current plan has changed\./)).toBeInTheDocument();
    expect(screen.getByText("Details / Provenance")).toBeInTheDocument();
  });

  it("presents a mode-only change neutrally with the planning-mode explanation", () => {
    render(<ResultContextBadge context={{ ...context, freshness: "other_mode", mode_message: "Result belongs to Single-sector mode. Switch back to Single-sector or run the current plan." }} />);
    expect(screen.getByText("OTHER MODE")).toBeInTheDocument();
    expect(screen.queryByText("STALE")).not.toBeInTheDocument();
    expect(screen.getByText(/Result from another planning mode · Simulation/)).toBeInTheDocument();
    expect(screen.getByText("Result belongs to Single-sector mode. Switch back to Single-sector or run the current plan.")).toBeInTheDocument();
    expect(screen.queryByText(/The current plan has changed\./)).not.toBeInTheDocument();
  });

  it("uses the shared Version-state wording for the source line", () => {
    render(<ResultContextBadge context={{ ...context, freshness: "current", version_label: "No saved Version", version_state: "Version 4 · Unsaved changes" }} />);
    expect(screen.getByText("Capacity Plan · Version 4 · Unsaved changes")).toBeInTheDocument();
  });

  it("keeps narrow context compact and text-readable", () => {
    render(<ResultContextBadge compact context={{ ...context, freshness: "historical" }} />);
    expect(screen.getByText("HISTORICAL")).toBeInTheDocument();
    expect(screen.getByLabelText(/HISTORICAL · Capacity Plan · Version 4/)).toBeInTheDocument();
  });
});
