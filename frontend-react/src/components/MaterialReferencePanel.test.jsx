import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MaterialReferencePanel from "./MaterialReferencePanel.jsx";

describe("MaterialReferencePanel", () => {
  it("sends an isolated P.2040 slab request with explicit geometry and media", () => {
    const onRun = vi.fn();
    render(<MaterialReferencePanel analysis={null} isAnalyzing={false} onRun={onRun} />);

    expect(screen.getByText(/Material reference only — not used by network simulation/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run material reference" })).toBeEnabled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Slab thickness" }), { target: { value: "0.02" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Slab polarization" }), { target: { value: "TM" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Incidence angle" }), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Run material reference" }));

    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({
      schema_version: 1,
      frequency_ghz: 140,
      material_source: "p2040_reference",
      material_id: "glass_100_400",
      thickness_m: 0.02,
      incidence_angle_deg: 30,
      polarization: "TM",
      incident_medium: expect.objectContaining({ name: "air", relative_permittivity: 1 }),
      exit_medium: expect.objectContaining({ name: "air", relative_permittivity: 1 }),
    }));
  });

  it("uses one user property form and renders the non-combined comparison", () => {
    const onRun = vi.fn();
    render(<MaterialReferencePanel analysis={null} isAnalyzing={false} onRun={onRun} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Material source" }), { target: { value: "user_defined" } });
    fireEvent.change(screen.getByRole("combobox", { name: "User loss form" }), { target: { value: "loss_tangent" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "User loss tangent" }), { target: { value: "0.02" } });
    fireEvent.click(screen.getByRole("button", { name: "Run material reference" }));

    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({
      material_source: "user_defined",
      user_material: expect.objectContaining({
        loss_tangent: 0.02,
      }),
    }));
    expect(onRun.mock.calls[0][0].user_material.conductivity_s_per_m).toBeUndefined();

    render(
      <MaterialReferencePanel
        analysis={{
          model_id: "p2040_material_slab_reference_v1",
          status: "applicable",
          readiness: "reference_only",
          material: { name: "Glass", property_source: "p2040_reference", relative_permittivity: 6.57, conductivity_s_per_m: 1.71, loss_tangent: 0.03, thickness_m: 0.01, thickness_provenance: "user_declared", frequency_range_ghz: [100, 400], complex_relative_permittivity: { real: 6.57, imaginary: -0.22 } },
          geometry: { frequency_ghz: 140, incidence_angle_deg: 0, polarization: "TE" },
          ledger: { reflection_coefficient: { real: -0.4, imaginary: 0.01 }, transmission_coefficient: { real: 0.2, imaginary: 0.03 }, reflected_power_fraction: 0.16, transmitted_power_fraction: 0.14, absorbed_power_fraction: 0.7, interface_reflection_power_fraction: 0.19, multiple_internal_reflections_included: true, transmission_loss_db: 8.55 },
          comparison: { historical_research_heuristic_db: 80, slab_transmission_loss_db: 8.55, combined: false },
          applicability: { status: "applicable" },
          reference: { revision: "ITU-R P.2040-4 (2025-09)" },
          assumptions: [], limitations: [], fingerprint: "material-reference-test",
        }}
        isAnalyzing={false}
        onRun={vi.fn()}
      />,
    );
    expect(screen.getByText("No — side by side")).toBeInTheDocument();
    expect(screen.getByText("reference_only")).toBeInTheDocument();
    expect(screen.getByText(/Multiple internal reflections: included/i)).toBeInTheDocument();
  });
});
