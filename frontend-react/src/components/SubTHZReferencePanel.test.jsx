import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SubTHZReferencePanel from "./SubTHZReferencePanel.jsx";

const baseProps = {
  endpoint: [32.851, 39.921],
  isAnalyzing: false,
  onAnalyze: vi.fn(),
  reference: null,
  selectedTower: { id: "cell-1", cellId: "cell-1", coordinates: [32.85, 39.92] },
  settings: { antennaHeightM: 25, receiverHeightM: 1.5, txPowerDbm: 30 },
};

describe("SubTHZReferencePanel", () => {
  it("keeps atmospheric terms opt-in and sends explicit options", () => {
    const onAnalyze = vi.fn();
    render(<SubTHZReferencePanel {...baseProps} onAnalyze={onAnalyze} />);

    expect(screen.queryByText("sub_thz_atmospheric_reference_v1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run atmospheric reference" })).toBeEnabled();
    expect(screen.getByText(/No receiver power is calculated until this block is enabled/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Include P\.838 rain/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /Rain rate/i }), { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "Run atmospheric reference" }));

    expect(onAnalyze).toHaveBeenCalledWith(expect.objectContaining({
      frequencyGHz: 140,
      txHeightM: 25,
      rxHeightM: 1.5,
      rainEnabled: true,
      rainRateMmh: 35,
      linkBudgetEnabled: false,
    }));
  });

  it("renders the standards ledger without implying receiver serviceability", () => {
    render(
      <SubTHZReferencePanel
        {...baseProps}
        reference={{
          reference_model_id: "sub_thz_atmospheric_reference_v1",
          fspl: { fspl_db: 115.6 },
          total: { atmospheric_db: 1.76, total_path_loss_db: 117.36 },
          geometry: { slant_distance_m: 102.7 },
          gas: { path_loss_db: 0.094, dry_air_db_per_km: 0.0187, water_vapour_db_per_km: 0.8968 },
          rain: { path_loss_db: 1.308, k: 1.5616, alpha: 0.6519 },
          local_fog: { path_loss_db: 0.358 },
          obstruction: { building_dataset_available: true, building_intersection_present: true, building_intersection_count: 1 },
          applicability: { status: "applicable", components: [{ enabled: true, reference: "ITU-R P.676-13" }] },
        }}
      />,
    );

    expect(screen.getByText("117.36 dB")).toBeInTheDocument();
    expect(screen.getByText(/no wall or diffraction loss applied/i)).toBeInTheDocument();
    expect(screen.getByText(/thresholds and serviceability remain out of scope/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Inspect standards, assumptions, and fingerprint"));
    expect(screen.getByText("sub_thz_atmospheric_reference_v1")).toBeInTheDocument();
  });
});
