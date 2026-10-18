import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createProjectWorkspace, createScenario, exportProjectFile, importProjectFile } from "./projectStore.js";
import { createSiteCells } from "./siteGroups.js";

const settings = { frequencyGHz: 28, txPowerDbm: 30, rayCount: 120, radiusMeters: 400, azimuthDeg: 90, beamWidthDeg: 120, calibrationOffsetDb: 0 };

describe("site groups in project files", () => {
  it("round-trips grouped Cells through export and import", () => {
    const workspace = createProjectWorkspace({ id: "ankara-default", version: "2026.07", hashes: {} });
    const project = workspace.projects[0];
    const inventory = [{ id: "tower-1", cellId: "101", coordinates: [32.85, 39.92] }, ...createSiteCells({ coordinates: [32.86, 39.925], towers: [], settings })];
    const scenario = createScenario("Network plan 1", { plan: { settings, inventory, planningMode: "network" }, request: null, summary: {}, artifacts: null });
    project.scenarios.push(scenario);
    project.activeScenarioId = scenario.id;
    const imported = importProjectFile(exportProjectFile(project));
    const restored = imported.scenarios[0].plan.inventory;
    expect(restored.filter((cell) => cell.siteGroupId === "site-1").map((cell) => cell.sectorAzimuthDeg)).toEqual([0, 120, 240]);
    expect(restored.find((cell) => cell.id === "tower-1")).not.toHaveProperty("siteGroupId");
  });

  it("imports an older file without groups unchanged", () => {
    const text = readFileSync("../examples/ankara-sample.atom-project.json", "utf8");
    const imported = importProjectFile(text);
    expect(JSON.stringify(imported)).not.toMatch(/siteGroupId|site_group_id|sectorAzimuthDeg/);
  });
});
