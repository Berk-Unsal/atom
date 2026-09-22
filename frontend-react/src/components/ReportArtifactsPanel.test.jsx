import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReportArtifactsPanel from "./ReportArtifactsPanel.jsx";

const artifact = {
  artifact_id: "artifact-1",
  report_id: "report-1",
  title: "Historic report",
  scenario_name: "Baseline",
  scenario_revision_id: "revision-1",
  run_ids: ["run-1"],
  format: "markdown",
  generated_at: "2026-09-21T10:00:00.000Z",
  byte_size: 2048,
  content_hash: "a".repeat(64),
  generator_version: "atom-report-generator-v1",
  availability: "available",
};

describe("ReportArtifactsPanel", () => {
  it("shows durable metadata and wires inspect, download, regenerate, and delete actions", () => {
    const callbacks = {
      onDelete: vi.fn(),
      onDownload: vi.fn(),
      onInspect: vi.fn(),
      onRegenerate: vi.fn(),
    };
    render(<ReportArtifactsPanel artifacts={[artifact]} selectedArtifactId={artifact.artifact_id} {...callbacks} />);

    expect(screen.getByText("Historic report")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Historic report.*Baseline.*Run run-1/i }));
    expect(screen.getByRole("region", { name: "HISTORICAL context" })).toHaveTextContent(/Historical result.*Report/);
    expect(screen.getByRole("region", { name: "Report source" })).toHaveTextContent("Scenario: Baseline");
    expect(screen.getByRole("region", { name: "Report source" })).toHaveTextContent("Version: Version unavailable");
    fireEvent.click(screen.getAllByText("Details / Provenance")[1]);
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Download Historic report/i }));
    fireEvent.click(screen.getByRole("button", { name: /Regenerate Historic report/i }));
    fireEvent.click(screen.getByRole("button", { name: /Delete Historic report/i }));

    expect(callbacks.onInspect).toHaveBeenCalledWith(artifact);
    expect(callbacks.onDownload).toHaveBeenCalledWith(artifact);
    expect(callbacks.onRegenerate).toHaveBeenCalledWith(artifact);
    expect(callbacks.onDelete).toHaveBeenCalledWith(artifact);
  });

  it("blocks downloads for corrupt or missing bytes and explains the status", () => {
    const missing = { ...artifact, artifact_id: "artifact-missing", availability: "missing" };
    render(<ReportArtifactsPanel artifacts={[missing]} selectedArtifactId={missing.artifact_id} />);
    expect(screen.getByText("UNAVAILABLE", { selector: ".result-context-state" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "UNAVAILABLE context" })).toHaveTextContent(/Report bytes are missing or unreadable/);
    expect(screen.getByRole("button", { name: /Download Historic report/i })).toBeDisabled();
  });

  it("requires the exact retained Version for source navigation", () => {
    const source = { ...artifact, scenario_id: "scenario-1" };
    const scenarios = [{ id: "scenario-1", name: "Baseline", domain: { scenario_id: "scenario-1", revisions: [{ scenario_revision_id: "revision-1", revision: 1 }] } }];
    const onOpenSource = vi.fn();
    const { unmount } = render(<ReportArtifactsPanel artifacts={[source]} selectedArtifactId={source.artifact_id} scenarios={scenarios} onOpenSource={onOpenSource} />);

    const openSource = screen.getAllByRole("button", { name: "Open source Version" })[0];
    openSource.focus();
    expect(openSource).toHaveFocus();
    fireEvent.click(openSource);
    expect(onOpenSource).toHaveBeenCalledWith(source);
    unmount();

    const missingSource = { ...source, artifact_id: "artifact-missing-source", scenario_revision_id: "revision-missing" };
    render(<ReportArtifactsPanel artifacts={[missingSource]} selectedArtifactId={missingSource.artifact_id} scenarios={scenarios} />);
    expect(screen.getByText(/UNAVAILABLE · The exact source Version is not retained/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open source Version" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Report source" })).toHaveTextContent("Version: Version unavailable");
  });

  it("explains that a live Report was generated from an unsaved plan", () => {
    const liveReport = {
      ...artifact,
      artifact_id: "artifact-live",
      scenario_revision_id: null,
      run_ids: [],
      provenance: { source_kind: "live_compatibility" },
    };
    render(<ReportArtifactsPanel artifacts={[liveReport]} selectedArtifactId={liveReport.artifact_id} />);

    expect(screen.getByText("HISTORICAL", { selector: ".result-context-state" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "HISTORICAL context" })).toHaveTextContent("Report No Run");
    expect(screen.getByText("Current unsaved plan at generation")).toBeInTheDocument();
    expect(screen.getByText("This Report was not tied to a saved Version.")).toBeInTheDocument();
    const provenance = screen.getAllByText("Details / Provenance")[1].closest("details");
    expect(provenance).not.toHaveAttribute("open");
    expect(provenance).toHaveTextContent("live_compatibility");
  });
});
