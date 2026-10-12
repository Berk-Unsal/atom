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
    run_label: "Run run-1234…567890",
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
    expect(screen.getByRole("region", { name: "STALE context" })).toHaveTextContent(/Simulation Run run-1234/);
    expect(screen.getByText(/The current plan has changed\./)).toBeInTheDocument();
    expect(screen.getByText("Details / Provenance")).toBeInTheDocument();
  });

  it("keeps narrow context compact and text-readable", () => {
    render(<ResultContextBadge compact context={{ ...context, freshness: "historical" }} />);
    expect(screen.getByText("HISTORICAL")).toBeInTheDocument();
    expect(screen.getByLabelText(/HISTORICAL · Capacity Plan · Version 4/)).toBeInTheDocument();
  });
});
