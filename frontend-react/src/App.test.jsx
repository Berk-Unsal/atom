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
});
