import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import P1411CandidatePanel from "./P1411CandidatePanel.jsx";

const baseProps = {
  endpoint: [32.851, 39.921],
  isAnalyzing: false,
  onAnalyze: vi.fn(),
  reference: null,
  selectedTower: { id: "cell-1", cellId: "cell-1", coordinates: [32.85, 39.92] },
  settings: { antennaHeightM: 25, receiverHeightM: 1.5 },
};

describe("P1411CandidatePanel", () => {
  it("requires explicit scenario controls and keeps alternatives opt-in", () => {
    const onAnalyze = vi.fn();
    render(<P1411CandidatePanel {...baseProps} onAnalyze={onAnalyze} />);

    expect(screen.getByText(/Reference candidate only — not used by network simulation/i)).toBeInTheDocument();
    expect(screen.getByText(/25 m TX \/ 1.5 m RX profile defaults are inputs only/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run P.1411 candidate reference" })).toBeEnabled();

    fireEvent.change(screen.getByRole("combobox", { name: "P.1411 morphology" }), { target: { value: "suburban" } });
    fireEvent.change(screen.getByRole("combobox", { name: "P.1411 rooftop relation" }), { target: { value: "both_below_rooftop" } });
    fireEvent.change(screen.getByRole("combobox", { name: "P.1411 path state" }), { target: { value: "nlos" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Request 4I.2A atmospheric comparison/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Compare current research_sub_thz wall events/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Research wall-event count" }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Run P.1411 candidate reference" }));

    expect(onAnalyze).toHaveBeenCalledWith(expect.objectContaining({
      frequencyGHz: 140,
      txHeightM: 25,
      rxHeightM: 1.5,
      morphology: "suburban",
      rooftopRelation: "both_below_rooftop",
      losState: "nlos",
      includeAtmosphericComparison: true,
      includeResearchComparison: true,
      researchWallEventCount: 1,
    }));
  });

  it("renders all candidates and comparison boundaries without ranking", () => {
    render(
      <P1411CandidatePanel
        {...baseProps}
        reference={{
          reference_model_id: "itu_r_p1411_table4_candidates_v1",
          scene_context: { frequency_ghz: 140, slant_distance_m: 100, morphology: "urban_high_rise", los_state: "los" },
          applicable_candidates: ["p1411_below_rooftop_los_v1"],
          candidates: [
            {
              model_id: "p1411_below_rooftop_los_v1",
              row: "Urban high-rise, urban low-rise/suburban, LoS",
              applicability: { applicable: true, status: "applicable", effective_distance_range_m: [5, 500], general_distance_range_m: [5, 660], required_rooftop_relation: "both_below_rooftop", required_los_state: "los" },
              model: { coefficients: { alpha: 2.07, beta: 31.23, gamma: 2.06 }, median_path_loss_db: 113.2, equation: "Lb(d,f)" },
              uncertainty: { sigma_db: 4.91, random_sampling: false, interpretation: "Median only." },
              p525_comparison: { fspl_db: 115.37, excess_relative_to_fspl_db: -2.17 },
              external_atmospheric_composition: { status: "comparison_only", total_path_loss_db: 115.44, difference_to_p1411_median_db: 2.24 },
              research_sub_thz_comparison: { status: "comparison_only", total_path_loss_db: 195.37, wall_event_count: 1 },
              limitations: ["No extrapolation."],
            },
            {
              model_id: "p1411_urban_highrise_nlos_v1",
              row: "Urban high-rise, NLoS",
              applicability: { applicable: false, status: "inapplicable", reasons: ["los_state_mismatch"], effective_distance_range_m: [20, 150], general_distance_range_m: [20, 715] },
              model: { coefficients: { alpha: 3.73, beta: 16.02, gamma: 2.26 }, equation: "Lb(d,f)" },
              uncertainty: { sigma_db: 7.62, random_sampling: false, interpretation: "Median only." },
              p525_comparison: { fspl_db: 115.37 },
              external_atmospheric_composition: { status: "deferred_not_requested" },
              research_sub_thz_comparison: { status: "deferred_not_requested" },
              limitations: [],
            },
          ],
          obstruction: { building_intersection_present: false, known_height_count: 0, unknown_height_count: 0 },
          comparison_notes: ["Not summed."],
          limitations: ["Not canonical."],
          fingerprint: "p1411-reference-test",
        }}
      />,
    );

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText("Applicable")).toBeInTheDocument();
    expect(screen.getByText("Inapplicable")).toBeInTheDocument();
    expect(screen.getByText(/Alternative atmospheric calculation/i)).toBeInTheDocument();
    expect(screen.getByText(/Alternative research_sub_thz calculation/i)).toBeInTheDocument();
    expect(screen.queryByText(/Recommended candidate/i)).not.toBeInTheDocument();
  });
});
