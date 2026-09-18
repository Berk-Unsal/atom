import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SpecularReflectionReferencePanel from "./SpecularReflectionReferencePanel.jsx";

describe("SpecularReflectionReferencePanel", () => {
  it("exposes the isolated boundary and sends the controlled ENU fixture", () => {
    const onRun = vi.fn();
    render(<SpecularReflectionReferencePanel analysis={null} isAnalyzing={false} onRun={onRun} />);

    expect(screen.getByText(/Isolated one-bounce reference — not used by network simulation/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Evaluate reflected path" }));

    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({
      frequencyGHz: 140,
      polarization: "TE",
      tx: expect.objectContaining({ x: 50, y: -50, z: 10 }),
      facade: expect.objectContaining({ baseZ: 0, topZ: 20, normalX: 1 }),
      material: expect.objectContaining({ mode: "interface", materialSource: "user_defined" }),
    }));
  });

  it("renders qualification evidence and the total-path ledger", () => {
    render(
      <SpecularReflectionReferencePanel
        analysis={{
          status: "qualified_reference",
          readiness: "reference_only",
          geometry: { reflection_point_enu: { x: 0, y: 0, z: 10 }, d1_m: 70.710678, d2_m: 70.710678, total_reflected_path_length_m: 141.421356, incidence_angle_deg: 45, reflection_angle_deg: 45 },
          spreading: { fspl_reflected_path_db: 118.380644 },
          material: { reflection_coefficient: { real: -0.4514, imaginary: 0, power_fraction: 0.203777 } },
          link_budget: { reflected_path_reference_power_dbm: -95.2891 },
          antennas: { tx: { departure_azimuth_deg: 315, departure_elevation_deg: 0 }, rx: { arrival_look_azimuth_deg: 225, arrival_look_elevation_deg: 0 } },
          applicability: { reasons: [], qualifications: ["roughness_unknown", "antenna_far_field_unknown"] },
          visibility: { leg1_visibility: { status: "visible" }, leg2_visibility: { status: "visible" } },
          diffuse_scattering_modelled: false,
          assumptions: [],
          fingerprint: "specular-test",
        }}
        isAnalyzing={false}
        onRun={vi.fn()}
      />,
    );

    expect(screen.getByText("qualified_reference")).toBeInTheDocument();
    expect(screen.getByText("-95.29 dBm")).toBeInTheDocument();
    expect(screen.getByText("118.381 dB")).toBeInTheDocument();
    expect(screen.getByText("roughness_unknown")).toBeInTheDocument();
    expect(screen.getByText("antenna_far_field_unknown")).toBeInTheDocument();
  });
});
