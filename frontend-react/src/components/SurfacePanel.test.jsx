import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SurfacePanel from "./SurfacePanel.jsx";

describe("SurfacePanel", () => {
  it("renders the backend min/max dBm fields without NaN", () => {
    render(
      <SurfacePanel
        disabled={false}
        isLoading={false}
        onExport={vi.fn()}
        onOptionsChange={vi.fn()}
        onRun={vi.fn()}
        options={{ cellSizeMeters: 25, displayThresholdDBm: -110, opacity: 0.62, thresholdsDBm: [-110, -100] }}
        surface={{
          grid: { width: 33, height: 33 },
          stats: { min_dbm: -108.4, max_dbm: -71.2, valid_cell_count: 266 },
          contours: { features: [] },
        }}
        surfaceCellId="cell-a"
      />,
    );

    expect(screen.getByText("−108–−71 dBm")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
