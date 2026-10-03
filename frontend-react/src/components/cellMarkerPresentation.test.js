import { describe, expect, it } from "vitest";
import { cellMarkerPresentation } from "./cellMarkerPresentation.js";

describe("Cell marker visual states", () => {
  it("keeps selection order centered and gives active + selected a separate outer ring", () => {
    const selected = cellMarkerPresentation({ selected: true, order: 3 });
    const activeSelected = cellMarkerPresentation({ selected: true, active: true, order: 3 });
    expect(activeSelected.order).toBe(3);
    expect(activeSelected.pathOptions).toEqual(selected.pathOptions);
    expect(activeSelected.radius).toBe(selected.radius);
    expect(activeSelected.hitRadius).toBeGreaterThanOrEqual(activeSelected.radius);
    expect(activeSelected.rings).toEqual([expect.objectContaining({ state: "active", radius: expect.any(Number) })]);
    expect(activeSelected.rings[0].radius).toBeGreaterThan(activeSelected.radius);
    expect(activeSelected.rings[0].pathOptions.fill).toBe(false);
  });
  it("keeps available Cells quieter than inspected, selected, and active Cells", () => {
    const available = cellMarkerPresentation();
    expect(cellMarkerPresentation({ zoom: 12 }).hitRadius).toBeGreaterThanOrEqual(6);
    expect(available.hitRadius).toBeGreaterThan(available.radius);
    for (const state of ["inspected", "selected", "active"]) {
      const emphasized = cellMarkerPresentation({ [state]: true });
      expect(emphasized.radius).toBeGreaterThan(available.radius);
      expect(emphasized.pathOptions.fillOpacity).toBeGreaterThan(available.pathOptions.fillOpacity);
    }
  });
  it("distinguishes inspection and Map Focus by solid and dashed rings", () => {
    const marker = cellMarkerPresentation({ active: true, selected: true, inspected: true, focused: true });
    expect(marker.rings.map((ring) => ring.state)).toEqual(["active", "focused", "inspected"]);
    expect(marker.rings.find((ring) => ring.state === "focused").pathOptions.dashArray).toBeTruthy();
    expect(marker.rings.find((ring) => ring.state === "inspected").pathOptions.dashArray).toBeUndefined();
  });
});
