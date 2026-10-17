import { describe, expect, it } from "vitest";
import { readableRunLabel, runCellCount, runHeadlineMetric, runPlanningMode, runTimeLabel } from "./runLabel.js";

const completedAt = "2026-10-17T14:32:00.000Z";
const time = runTimeLabel(completedAt);
const single = { tower_lon: 32.85, tower_lat: 39.92 };
const network = { towers: [{ id: "cell-1" }, { id: "cell-2" }, { id: "cell-3" }] };

describe("readable Run labels", () => {
  it.each([
    ["a single-sector simulation", { run_type: "simulation", status: "succeeded", completed_at: completedAt, canonical_input_snapshot: { request: single }, summary: { simulation: { avg_rx_dbm: -72 } } }, `Simulation · 1 Cell · avg Rx -72.0 dBm · ${time}`],
    ["a network optimization", { run_type: "optimization", status: "succeeded", completed_at: completedAt, canonical_input_snapshot: { request: network }, summary: { stats: { score: 65.5 } } }, `Optimization · 3 Cells · score 65.5 · ${time}`],
    ["a composite-score optimization", { run_type: "optimization", status: "succeeded", completed_at: completedAt, canonical_input_snapshot: { request: network }, summary: { stats: { composite_score: 0.612 } } }, `Optimization · 3 Cells · score 61.2 · ${time}`],
    ["a single-cell azimuth optimization", { run_type: "optimization", status: "succeeded", completed_at: completedAt, canonical_input_snapshot: { request: single }, summary: {}, details: { public_pareto_solutions: [{ cell_configurations: [{ id: "101", optimal_azimuth: 134.6 }] }] } }, `Optimization · 1 Cell · best azimuth 135° · ${time}`],
    ["a failed Run without a metric", { run_type: "simulation", status: "failed", completed_at: completedAt, canonical_input_snapshot: { request: single }, summary: { simulation: { avg_rx_dbm: -72 } } }, `Simulation · 1 Cell · ${time}`],
  ])("leads %s with type, Cells, headline metric and time", (_label, run, expected) => {
    expect(readableRunLabel(run)).toBe(expected);
  });

  it("never includes the Run ID", () => {
    expect(readableRunLabel({ run_id: "1cfa19e7-aaaa-bbbb-cccc-5e048d000000", run_type: "simulation", status: "succeeded", created_at: completedAt })).not.toMatch(/1cfa19e7/);
  });

  it("omits parts the Run did not retain", () => {
    expect(readableRunLabel({ run_type: "simulation", created_at: "not a date" })).toBe("Simulation");
    expect(runCellCount({})).toBeNull();
    expect(runPlanningMode({ canonical_input_snapshot: { request: network } })).toBe("network");
    expect(runPlanningMode({ canonical_input_snapshot: { request: single } })).toBe("single");
    expect(runHeadlineMetric({ run_type: "optimization", summary: {} })).toBe("");
  });
});
