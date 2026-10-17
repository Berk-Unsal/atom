import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ResultCompareView from "./ResultCompareView.jsx";

const version = (id, revision, identity, summary) => ({
  id: `version:${id}`,
  group: "Plan",
  kind: "version",
  label: `Plan · Version ${revision}`,
  scenarioId: "plan",
  revisionId: id,
  revisionNumber: revision,
  createdAt: `2026-10-17T1${revision}:00:00Z`,
  identity,
  summary,
});

describe("ResultCompareView", () => {
  it("shows an incompatibility notice instead of deltas for different datasets", () => {
    render(<ResultCompareView sources={[
      version("v1", 1, { dataset: "ankara@2026.07", model: "m1" }, { avgRxDBm: -70 }),
      version("v2", 2, { dataset: "istanbul@2026.01", model: "m1" }, { avgRxDBm: -60 }),
    ]} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Not comparable\..*different datasets/);
    expect(screen.queryByRole("table", { name: "KPI deltas" })).not.toBeInTheDocument();
  });

  it("shows KPI deltas for compatible states and shows a saved Version on request", () => {
    const onShowSource = vi.fn();
    const sources = [
      version("v1", 1, { dataset: "ankara@2026.07", model: "m1" }, { avgRxDBm: -70 }),
      version("v2", 2, { dataset: "ankara@2026.07", model: "m1" }, { avgRxDBm: -64.5 }),
    ];
    render(<ResultCompareView sources={sources} onShowSource={onShowSource} />);
    const row = within(screen.getByRole("table", { name: "KPI deltas" })).getByRole("row", { name: /Average Rx/ });
    expect(row).toHaveTextContent("-70.0 dBm-64.5 dBm+5.5 dBm");
    fireEvent.click(screen.getByRole("button", { name: "Show B" }));
    expect(onShowSource).toHaveBeenCalledWith(sources[1]);
  });

  it("asks for two states when fewer exist", () => {
    render(<ResultCompareView sources={[]} />);
    expect(screen.getByText("Two states needed to compare")).toBeInTheDocument();
  });
});
