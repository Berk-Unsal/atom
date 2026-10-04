import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createProjectWorkspace, createScenario, decodeProjectFile, exportProjectFile,
  importProjectFile, MAX_PROJECT_FILE_BYTES, PROJECT_FILE_SCHEMA_VERSION } from "./projectStore.js";
import { packProjectRays, unpackProjectRays } from "./projectRayColumns.js";
import { workspaceToDomain } from "../repository/projectCompatibility.js";

const fixture = JSON.parse(gunzipSync(readFileSync("e2e/fixtures/persistence/six-cell-v2.atom-project.json.gz")));

function fileWithFeatures(features) {
  const project = createProjectWorkspace().projects[0];
  project.scenarios = [createScenario("Rays", { artifacts: { simulation: { geojson: { type: "FeatureCollection", features } } } })];
  return { schemaVersion: PROJECT_FILE_SCHEMA_VERSION, project };
}

describe("bounded lossless project files", () => {
  it("round-trips the real six-Cell UI export without losing scientific data or Versions", () => {
    const project = fixture.project;
    expect(new TextEncoder().encode(JSON.stringify(fixture, null, 2)).byteLength).toBeGreaterThan(MAX_PROJECT_FILE_BYTES);
    const before = structuredClone(project);
    const text = exportProjectFile(project);
    expect(new TextEncoder().encode(text).byteLength).toBeLessThan(MAX_PROJECT_FILE_BYTES);
    expect(JSON.parse(text).schemaVersion).toBe(3);
    expect(decodeProjectFile(JSON.parse(text))).toEqual(project);
    expect(project).toEqual(before);
    expect(exportProjectFile(project)).toBe(text);
    const imported = importProjectFile(text);
    expect(imported.scenarios[0].artifacts).toEqual(project.scenarios[0].artifacts);
    expect(imported.scenarios[0].plan).toEqual(project.scenarios[0].plan);
    expect(imported.scenarios[0].request).toEqual(project.scenarios[0].request);
    const version = imported.scenarios[0].domain.revisions[0];
    expect(version.request_inputs).toEqual(project.scenarios[0].domain.revisions[0].request_inputs);
    expect(version.resolved_fingerprints).toEqual(project.scenarios[0].domain.revisions[0].resolved_fingerprints);
    expect(version.scenario_id).toBe(imported.scenarios[0].id);
    expect(imported.importProvenance.identityMap[project.scenarios[0].domain.current_revision_id]).toBe(version.scenario_revision_id);
  }, 20_000);

  it("keeps imported local identities independent and embedded Run/Version lineage coherent", () => {
    const project = createProjectWorkspace().projects[0];
    project.domain = { project_id: project.id, inventory_id: "inventory", inventory_revision_id: "inventory-v1" };
    project.scenarios = [createScenario("Provenance", { plan: { planningMode: "network" } })];
    const scenario = project.scenarios[0];
    project.activeScenarioId = scenario.id;
    scenario.domain = {
      scenario_id: scenario.id, current_revision_id: "v2", revision: 2,
      revisions: [
        { scenario_revision_id: "v1", scenario_id: scenario.id, revision: 1, selected_cell_ids: [], inventory_revision_id: "inventory-v1" },
        { scenario_revision_id: "v2", scenario_id: scenario.id, revision: 2, selected_cell_ids: [], parent_revision_id: "v1", originating_run_id: "run",
          resolved_fingerprints: { scenario_fingerprint: "unchanged" }, request_inputs: { cell_id: "cell" } },
      ],
      runs: [{ run_id: "run", run_type: "simulation", project_id: project.id, scenario_id: scenario.id,
        scenario_revision_id: "v1", status: "succeeded", canonical_input_snapshot: { request: { cell_id: "cell" } } }],
    };
    const imported = importProjectFile(exportProjectFile(project));
    const map = imported.importProvenance.identityMap;
    expect(imported.scenarios[0].domain.runs[0].scenario_revision_id).toBe(map.v1);
    expect(imported.scenarios[0].domain.runs[0].project_id).toBe(imported.id);
    expect(imported.scenarios[0].domain.revisions[1].originating_run_id).toBe(map.run);
    expect(imported.scenarios[0].domain.revisions[1].parent_revision_id).toBe(map.v1);
    const domain = workspaceToDomain({ schemaVersion: 2, activeProjectId: imported.id, projects: [project, imported] });
    expect(domain.scenarios).toHaveLength(2);
    expect(new Set(domain.scenario_revisions.map((revision) => revision.scenario_revision_id)).size).toBe(4);
    expect(domain.runs).toHaveLength(2);
  });

  it("preserves mixed keys, empty containers, nulls, order and independent decoded values", () => {
    const features = Array.from({ length: 200 }, (_, index) => ({
      type: "Feature", geometry: { type: "LineString", coordinates: [[1, 2], [1 + index, 3]] },
      properties: { fixed: "same", ...(index % 2 ? { absentOnEvenRows: null } : {}),
        evidence: index % 3 ? { values: [null, false, "", {}] } : { values: [] } },
    }));
    const { project } = fileWithFeatures(features);
    const packed = packProjectRays(project);
    const decoded = unpackProjectRays(packed, { maxBytes: MAX_PROJECT_FILE_BYTES, maxNodes: 1_000_000 });
    expect(decoded).toEqual(project);
    decoded.scenarios[0].artifacts.simulation.geojson.features[1].properties.evidence.values.push(123);
    expect(decoded.scenarios[0].artifacts.simulation.geojson.features[2].properties.evidence.values).not.toContain(123);
  });

  it("preserves exact JSON numbers including exponent extremes and subnormals", () => {
    const values = [Number.MIN_VALUE, Number.MAX_VALUE, -1.2345678901234567, 1e-100, 1e100, 0];
    const features = values.map((value) => ({ type: "Feature", properties: { value },
      geometry: { type: "LineString", coordinates: [[value, 0], [0, value]] } }));
    const { project } = fileWithFeatures(features);
    expect(decodeProjectFile(JSON.parse(exportProjectFile(project)))).toEqual(project);
  });

  it.each([
    { count: -1, columns: ["constant", {}] },
    { count: 25_001, columns: ["constant", {}] },
    { count: 2, columns: ["dictionary", [{}], [0, 1]] },
    { count: 2, columns: ["values", [{}]] },
    { count: 2, columns: ["objects", ["x", "x"], [["constant", 1], ["constant", 2]]] },
    { count: 2, columns: ["arrays", ["3"], [["constant", 1]]] },
    { count: 2, columns: ["groups", [[[0, 0], ["constant", {}]]]] },
    { count: 2, columns: ["groups", [[[0], ["constant", {}]]]] },
    { count: 2, columns: ["unknown", {}] },
    { count: 2, columns: ["numbers", "1,NaN"] },
    { count: 2, columns: ["numbers", "1,1e999"] },
    { count: 2, columns: ["numbers", "1,2,3"] },
    { count: 2, columns: ["numbers", "1,+2"] },
  ])("rejects corrupted column representation %#", (features) => {
    expect(() => importProjectFile(JSON.stringify(fileWithFeatures(features)))).toThrow(/ray columns/i);
  });

  it("rejects expansion bombs before allocating decoded Features", () => {
    const features = { count: 25_000, columns: ["constant", { evidence: "x".repeat(2048) }] };
    const file = fileWithFeatures(features);
    const packed = file.project.scenarios[0].artifacts.simulation.geojson.features;
    expect(() => decodeProjectFile(file)).toThrow(/expansion.*budget/i);
    expect(file.project.scenarios[0].artifacts.simulation.geojson.features).toBe(packed);
    expect(() => importProjectFile(JSON.stringify(fileWithFeatures({ count: 25_000,
      columns: ["constant", Array(50).fill(null)] })))).toThrow(/expansion.*budget/i);
  });

  it.each([
    ["array", Array(25_001).fill(null), /oversized array/i],
    ["string", "x".repeat(1024 * 1024 + 1), /oversized string/i],
    ["nodes", Array.from({ length: 25_000 }, () => Array(10).fill(0)), /too many nested values/i],
    ["keys", Object.fromEntries(Array.from({ length: 2_001 }, (_, index) => [`key${index}`, null])), /too many fields/i],
  ])("keeps the encoded %s guard", (_, value, error) => {
    const project = createProjectWorkspace().projects[0];
    project.draft = { plan: { untrusted: value } };
    expect(() => importProjectFile(JSON.stringify({ schemaVersion: 3, project }))).toThrow(error);
  });

  it("rejects malformed JSON, future schemas, unsafe keys and corrupted results", () => {
    expect(() => importProjectFile("{")).toThrow(/valid JSON/i);
    expect(() => importProjectFile(JSON.stringify({ ...fixture, schemaVersion: 99, project: createProjectWorkspace().projects[0] }))).toThrow(/schema/i);
    expect(() => importProjectFile('{"constructor":{}}')).toThrow(/unsafe/i);
    const project = createProjectWorkspace().projects[0];
    project.scenarios = [createScenario("Broken", { artifacts: { simulation: "bad" } })];
    expect(() => importProjectFile(JSON.stringify({ schemaVersion: 2, project }))).toThrow(/invalid result/i);
  });

  it.each([
    { runs: {} }, { revisions: "bad" }, { revisions: [{ scenario_revision_id: "v" }] },
    { runs: [{ run_id: "r", run_type: "invalid", status: "succeeded" }] },
  ])("rejects malformed retained domain metadata before workspace hydration %#", (domain) => {
    const file = fileWithFeatures([]);
    file.project.scenarios[0].domain = domain;
    expect(() => importProjectFile(JSON.stringify(file))).toThrow(/invalid Version or Run metadata/i);
  });

  it("imports the shipped legacy input-only project and legacy result-bearing snapshots", () => {
    const text = readFileSync("../examples/ankara-sample.atom-project.json", "utf8");
    expect(importProjectFile(text).scenarios.length).toBeGreaterThan(0);
    for (const schemaVersion of [1, 2]) {
      const project = createProjectWorkspace().projects[0];
      project.scenarios = [createScenario("Legacy", { artifacts: { simulation: { stats: { avg_rx_dbm: -90 } } } })];
      expect(importProjectFile(JSON.stringify({ schemaVersion, project })).scenarios[0].artifacts.simulation.stats.avg_rx_dbm).toBe(-90);
    }
  });
});
