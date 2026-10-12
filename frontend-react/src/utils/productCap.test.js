import { describe, expect, it } from "vitest";
import { DEFAULT_SIMULATION } from "../generated/policy.js";
import { buildNetworkOptimizationPayload, buildSimulationPayload } from "./requestPayloads.js";
import { buildPlanningReport, renderHtmlReport, renderMarkdownReport } from "./reportExport.js";
import { createProject, updateProjectDraft, exportProjectFile, importProjectFile } from "./projectStore.js";
const cells = Array.from({ length: 8 }, (_, index) => ({ id: `tower-${index + 1}`, cellId: `cell-${index + 1}`, coordinates: [32.85 + index * .001, 39.92], rfProfile: { channelId: `CH-${index + 1}`, txPowerDbm: 30 + index } }));
describe("normal eight-Cell product", () => {
  it("preserves every ordered identity, coordinate, profile and azimuth", () => {
    const angles = Object.fromEntries(cells.map((t, i) => [t.id, i * 30]));
    const payload = buildNetworkOptimizationPayload(cells, DEFAULT_SIMULATION, angles);
    expect(payload.towers).toHaveLength(8);
    expect(payload.towers.map((t) => t.id)).toEqual(cells.map((t) => t.cellId));
    payload.towers.forEach((t, i) => { expect(t).toMatchObject({ tower_lon: cells[i].coordinates[0], tower_lat: cells[i].coordinates[1], azimuth: i * 30 }); expect(t.rf_profile).toMatchObject({ channel_id: `CH-${i + 1}`, tx_power_dbm: 30 + i }); expect(buildSimulationPayload(cells[i], { ...DEFAULT_SIMULATION, azimuthDeg: i * 30 }, i).rf_profile).toEqual(t.rf_profile); });
  });
  it("renders all eight IDs in HTML and Markdown reports", () => {
    const report = buildPlanningReport({ selectedNetworkTowers: cells, planningMode: "network", settings: DEFAULT_SIMULATION, networkResultKind: "evaluation", networkOptimization: { optimized_towers: cells.map((t, i) => ({ id: t.cellId, optimal_azimuth: i * 30 })), stats: {} } });
    for (const text of [renderHtmlReport(report), renderMarkdownReport(report)]) for (const t of cells) expect(text).toContain(t.cellId);
  });
  it("round-trips eight selected IDs without raising project guards", () => {
    const project = updateProjectDraft(createProject("Eight"), { planningMode: "network", selectedNetworkTowerIds: cells.map((t) => t.id), settings: DEFAULT_SIMULATION, networkOptimization: { optimized_towers: cells.map((t) => ({ id: t.cellId, optimal_azimuth: 90 })) } });
    const parsed = importProjectFile(exportProjectFile(project));
    expect(JSON.stringify(parsed)).toContain("tower-8");
    expect(JSON.stringify(parsed)).toContain("cell-8");
  });
});
