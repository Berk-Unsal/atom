import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import InterferenceResultsPanel from "./InterferenceResultsPanel.jsx";

describe("InterferenceResultsPanel", () => {
  it("leads with quality outcomes and keeps thresholds and per-cell evidence secondary", () => {
    render(<InterferenceResultsPanel analysis={{
      stats: {
        avg_sinr_db: 12.3,
        p10_sinr_db: 1.2,
        median_sinr_db: 10.5,
        avg_rsrp_dbm: -91,
        avg_rsrq_db: -12,
        serviceable_pct: 50,
        serviceable_fraction: 0.8,
        interference_limited_pct: 10,
        no_signal_count: 2,
        affected_demand: 240,
        per_serving_cell: [{ cell_id: "cell-1", channel_id: "channel-a", avg_sinr_db: 12.3 }],
      },
      model: {
        rsrp_threshold_dbm: -110,
        sinr_threshold_db: 0,
        rsrq_threshold_db: -20,
        resource_basis: "one occupied frequency resource element",
      },
    }} />);

    expect(screen.getByText("Serviceable surface").nextSibling).toHaveTextContent("50.0%");
    expect(screen.getByText("Average SINR").nextSibling).toHaveTextContent("12.3 dB");
    const details = screen.getByText("Details / thresholds / per-cell results").closest("details");
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Details / thresholds / per-cell results"));
    expect(details).toHaveAttribute("open");
    expect(screen.getByText("P10 SINR").nextSibling).toHaveTextContent("1.2 dB");
    expect(screen.getByText((_, element) => element.tagName === "P" && element.textContent.includes("RSRP ≥ -110.0 dBm"))).toBeInTheDocument();
    expect(screen.getByText("cell-1")).toBeInTheDocument();
  });

  it("uses one empty state when no radio quality result exists", () => {
    render(<InterferenceResultsPanel analysis={{ stats: null }} />);
    expect(screen.getByText("No interference result")).toBeInTheDocument();
    expect(screen.getByText("Select at least two 4G or 5G cells, then run Analyze Interference.")).toBeInTheDocument();
  });
});
