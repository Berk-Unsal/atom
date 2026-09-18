import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import InterferenceResultsPanel from "./components/InterferenceResultsPanel.jsx";

describe("InterferenceResultsPanel", () => {
  it("renders nullable no-signal KPIs as unavailable", () => {
    render(<InterferenceResultsPanel analysis={{
      stats: {
        avg_sinr_db: null,
        p10_sinr_db: null,
        avg_rsrp_dbm: null,
        avg_rsrq_db: null,
        serviceable_pct: 0,
        interference_limited_pct: 0,
        no_signal_count: 24,
        affected_demand: 0,
        per_serving_cell: [],
      },
    }} />);
    expect(screen.getByText("Avg SINR").nextElementSibling).toHaveTextContent("—");
    expect(screen.getByText("P10 SINR").nextElementSibling).toHaveTextContent("—");
    expect(screen.getByText("24")).toBeInTheDocument();
  });

  it("renders the radio-quality contract additions", () => {
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
        affected_demand: 0,
        per_serving_cell: [],
      },
      model: {
        rsrp_threshold_dbm: -110,
        sinr_threshold_db: 0,
        rsrq_threshold_db: -20,
        resource_basis: "one occupied frequency resource element",
        co_channel_eligibility_rule: "exact configured channel",
      },
    }} />);
    expect(screen.getByText("Median SINR").nextElementSibling).toHaveTextContent("10.5 dB");
    expect(screen.getByText("Serviceable of signal").nextElementSibling).toHaveTextContent("80.0%");
    expect(screen.getByText(/Power ledger basis:/)).toBeInTheDocument();
  });
});
