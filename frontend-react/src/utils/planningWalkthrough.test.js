import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { exportProjectFile, importProjectFile, isDatasetCompatible } from "./projectStore.js";
import { buildNetworkOptimizationPayload } from "./requestPayloads.js";
import { validateRFProfile } from "./rfProfile.js";
import { buildReportMetrics } from "./reportModel.js";

const text = readFileSync("../examples/ankara-two-cell-walkthrough.atom-project.json", "utf8");
const evidence = JSON.parse(readFileSync("../docs/planning-walkthrough-evidence.json", "utf8"));
const manifest = JSON.parse(readFileSync("../data-pipeline/manifest.json", "utf8"));
const towers = JSON.parse(readFileSync("../data-pipeline/ankara_5g_nodes.geojson", "utf8")).features;

describe("reproducible public Ankara walkthrough", () => {
  it("uses the report's normalized reach-score units in the worked comparison", () => {
    const metric = buildReportMetrics({ raw_metrics: { coverage_reach_score: evidence.baseline.propagationReach, coverage_reach_maximum: 24000 } }).find((row) => row.id === "coverage");
    const guide = readFileSync("../docs/planning-walkthrough.md", "utf8");
    expect(guide).toContain(`${metric.label} (${metric.unit})`);
    expect(metric.value).toBe(evidence.baseline.propagationReach);
    expect(guide).not.toMatch(/\bm of summed ray reach\b/);
  });
  it("imports and round-trips the exact selected Cells, profiles and priorities", () => {
    const project = importProjectFile(text);
    const plan = project.scenarios[0].plan;
    const cells = plan.selectedNetworkTowerIds.map((id) => plan.inventory.find((cell) => cell.id === id));
    expect(cells).toHaveLength(2);
    expect(cells.every(Boolean)).toBe(true);
    expect(cells.map((cell) => validateRFProfile(cell.rfProfile))).toEqual([{}, {}]);
    expect(buildNetworkOptimizationPayload(cells, plan.settings, plan.networkAzimuths, plan.optimizationConfig)).toEqual(evidence.request);
    expect(importProjectFile(exportProjectFile(project)).scenarios[0].plan).toEqual(plan);
    expect(project.scenarios[0].artifacts).toBeNull();
    expect(project.scenarios[0].requiresRerun).toBe(true);
  });

  it("binds to the actual public pack and source record coordinates", () => {
    const project = importProjectFile(text);
    expect(isDatasetCompatible(project, { dataset: manifest })).toBe(true);
    expect(project.datasetRef).toEqual(evidence.dataset);
    for (const cell of project.scenarios[0].plan.inventory) {
      const source = towers.find((feature) => feature.id === cell.id);
      expect(source.geometry.coordinates).toEqual(cell.coordinates);
      expect(source.properties.cell_id).toBe(cell.cellId);
    }
    expect(isDatasetCompatible(project, { dataset: { ...manifest, version: "another-pack-version" } })).toBe(false);
  });
});
