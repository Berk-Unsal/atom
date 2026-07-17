import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getJSON: vi.fn(),
  postJSON: vi.fn(),
}));

vi.mock("./utils/apiClient.js", () => ({
  getJSON: api.getJSON,
  postJSON: api.postJSON,
  isAbortError: (error) => error?.name === "AbortError",
}));

vi.mock("./components/MapCanvas.jsx", () => ({
  default: () => <div data-testid="map-canvas" />,
}));

import App from "./App.jsx";

const towerGeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      id: "tower-1",
      type: "Feature",
      geometry: { type: "Point", coordinates: [32.85, 39.92] },
      properties: { cell_id: "101", radio_type: "NR" },
    },
  ],
};

const simulationPayload = {
  geojson: {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} }],
  },
  stats: { avg_rx_dbm: -88, blocked_pct: 10, min_range_m: 100, max_range_m: 400 },
};

const gapPayload = {
  geojson: { type: "FeatureCollection", features: [] },
  stats: { gap_buildings: 4, gap_pct: 2, returned_gaps: 0 },
};

describe("App planning workflow", () => {
  beforeEach(() => {
    api.getJSON.mockReset();
    api.postJSON.mockReset();
    api.getJSON.mockImplementation((path) => {
      if (path === "/api/towers") {
        return Promise.resolve(towerGeoJSON);
      }
      if (path === "/api/buildings/summary") {
        return Promise.resolve({ total_buildings: 100, data_quality: "good" });
      }
      return Promise.resolve({});
    });
    api.postJSON.mockImplementation((path) => {
      if (path === "/api/coverage-gaps") {
        return Promise.resolve(gapPayload);
      }
      return Promise.resolve(simulationPayload);
    });
  });

  it("invalidates results without launching RF work until Run is pressed", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    expect(api.postJSON).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Open Sector result results/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Transmit power (dBm)" }), {
      target: { value: "31" },
    });
    await act(async () => Promise.resolve());

    expect(api.postJSON).not.toHaveBeenCalled();
    expect(screen.getByText("Plan changed", { selector: ".run-state" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open Sector result results/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(api.postJSON).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("Ready")).toBeInTheDocument());
  });

  it("does not launch a sector request when switching into network planning", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Network mode, 0 selected" }));
    await act(async () => Promise.resolve());

    expect(api.postJSON).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add 1 cell" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Interference" })).not.toBeDisabled();
  });

  it("cancels map area selection with Escape", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Draw selection area" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(api.postJSON).not.toHaveBeenCalled();
  });

  it("keeps propagation assumptions available before interference analysis", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Data" }));
    expect(screen.getByRole("region", { name: "Propagation model assumptions" })).toBeInTheDocument();
    expect(screen.getByText("FSPL + wall loss")).toBeInTheDocument();
    expect(screen.getByText(/Fast fading, diffraction, sidelobes/)).toBeInTheDocument();
  });

  it("shows a consistent global recovery state when RF capacity is busy", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Close tool drawer" }));
    api.postJSON.mockRejectedValueOnce(new Error("RF analysis capacity is busy; retry shortly"));
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("RF analysis capacity is busy; retry shortly");
    expect(screen.getByText("Action needed", { selector: ".run-state" })).toBeInTheDocument();
    expect(screen.getByText("Action needed", { selector: ".run-state" })).toHaveClass("error");
  });

  it("clears prior RF evidence when a measurement calibration changes the plan", async () => {
    api.postJSON.mockImplementation((path) => {
      if (path === "/api/coverage-gaps") return Promise.resolve(gapPayload);
      if (path === "/api/measurements/evaluate") {
        return Promise.resolve({
          geojson: {
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              geometry: { type: "Point", coordinates: [32.85, 39.92] },
              properties: { id: "m-1", status: "valid", residual_db: 6 },
            }],
          },
          stats: { sample_count: 20, valid_sample_count: 20, mae_db: 6, rmse_db: 6, median_bias_db: 6 },
          calibration: {
            eligible: true,
            reason: "Review holdout error before applying this global correction.",
            recommended_total_offset_db: 6,
            holdout_mae_before_db: 6,
            holdout_mae_after_db: 0,
          },
        });
      }
      return Promise.resolve(simulationPayload);
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run Sector" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Run Sector" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Open Sector result results/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Data" }));
    const fileInput = screen.getByLabelText(/Import measurement CSV/i);
    const measurementFile = {
      text: () => Promise.resolve("id,longitude,latitude,technology,rsrp_dbm\nm-1,32.85,39.92,5g,-80"),
    };
    fireEvent.change(fileInput, { target: { files: [measurementFile] } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Evaluate residuals" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Evaluate residuals" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply correction to plan" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Apply correction to plan" }));

    expect(screen.queryByRole("button", { name: /Open Sector result results/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Apply correction to plan")).not.toBeInTheDocument();
    expect(screen.getByText("Plan changed", { selector: ".run-state" })).toBeInTheDocument();
  });
});
