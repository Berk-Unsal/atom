import { describe, expect, it } from "vitest";
import { availableParetoAxes, defaultParetoAxes, paretoAxisValue, paretoKeyboardOrder, paretoObjectiveValue, paretoScatterGeometry } from "./paretoChart.js";

const solution = (id, objectives, extra = {}) => ({ id, stats: { objectives, score: extra.score, raw_metrics: extra.raw ?? {}, objective_status: extra.status ?? {} } });

const solutions = [
  solution("a", { demand: 0.283, residential: 0.5, coverage: 0.6, overlap: 0.9 }, { score: 70, raw: { overlap_ratio: 0.08 } }),
  solution("b", { demand: 0.283, residential: 0.73, coverage: 0.52, overlap: 0.8 }, { score: 64, raw: { overlap_ratio: 0.14 } }),
  solution("c", { demand: 0.283, residential: 0.62, coverage: 0.58, overlap: 0.85 }, { score: 66 }),
];

describe("Pareto trade-off chart geometry", () => {
  it("reads retained metrics only: utilities, the raw overlap ratio and the score", () => {
    expect(paretoObjectiveValue(solutions[0].stats, "propagation_reach")).toBe(0.6);
    expect(paretoObjectiveValue(solutions[0].stats, "overlap")).toBe(0.08);
    expect(paretoObjectiveValue(solutions[2].stats, "overlap")).toBeCloseTo(0.15);
    expect(paretoObjectiveValue({ objectives: { demand: 0.4 }, objective_status: { demand: { available: false } } }, "demand")).toBeNull();
    expect(paretoAxisValue(solutions[1], "score")).toBe(64);
    expect(paretoAxisValue({ stats: { composite_score: 0.612 } }, "score")).toBeCloseTo(61.2);
  });

  it("offers radio quality only when every solution evaluated it", () => {
    expect(availableParetoAxes(solutions).map((axis) => axis.id)).toEqual(["demand", "residential", "propagation_reach", "overlap", "score"]);
    const withRadio = solutions.map((item) => ({ ...item, stats: { ...item.stats, raw_metrics: { ...item.stats.raw_metrics, radio_quality_serviceable_fraction: 0.7 } } }));
    expect(availableParetoAxes(withRadio, true).map((axis) => axis.id)).toContain("radio_quality");
  });

  it("defaults to the two objectives with the widest spread so identical demand does not collapse the chart", () => {
    expect(defaultParetoAxes(solutions, availableParetoAxes(solutions))).toEqual({ x: "residential", y: "propagation_reach" });
  });

  it("places points inside the plot and lists solutions it cannot plot", () => {
    const geometry = paretoScatterGeometry([...solutions, solution("d", { residential: 0.4 })], "residential", "propagation_reach");
    expect(geometry.points).toHaveLength(3);
    expect(geometry.unplotted).toEqual([{ id: "d", rank: 4 }]);
    for (const point of geometry.points) {
      expect(point.x).toBeGreaterThanOrEqual(geometry.padding.left);
      expect(point.x).toBeLessThanOrEqual(geometry.width - geometry.padding.right);
      expect(point.y).toBeGreaterThanOrEqual(geometry.padding.top);
      expect(point.y).toBeLessThanOrEqual(geometry.height - geometry.padding.bottom);
    }
    const higher = geometry.points.find((point) => point.id === "a");
    const lower = geometry.points.find((point) => point.id === "b");
    expect(higher.y).toBeLessThan(lower.y);
  });

  it("orders keyboard focus left to right and is deterministic", () => {
    const geometry = paretoScatterGeometry(solutions, "residential", "propagation_reach");
    expect(paretoKeyboardOrder(geometry.points).map((point) => point.id)).toEqual(["a", "c", "b"]);
    expect(paretoKeyboardOrder(geometry.points)).toEqual(paretoKeyboardOrder([...geometry.points].reverse()));
  });

  it("keeps a single-valued axis drawable", () => {
    const geometry = paretoScatterGeometry(solutions, "demand", "score");
    expect(new Set(geometry.points.map((point) => point.x)).size).toBe(1);
    expect(Number.isFinite(geometry.points[0].x)).toBe(true);
  });
});
