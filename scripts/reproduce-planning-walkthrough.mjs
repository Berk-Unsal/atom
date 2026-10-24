// Run from a complete checkout with Node 24+ and the Go API already running.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildNetworkOptimizationPayload } from "../frontend-react/src/utils/requestPayloads.js";
import { importProjectFile, datasetReference } from "../frontend-react/src/utils/projectStore.js";

const [base = "http://localhost:8080", outputDirectory] = process.argv.slice(2);
if (!outputDirectory || process.argv.length > 4) {
  throw new Error("Usage: node scripts/reproduce-planning-walkthrough.mjs http://localhost:8080 /path/to/evidence");
}
const baseURL = new URL(base);
if (!["http:", "https:"].includes(baseURL.protocol) || baseURL.username || baseURL.password) {
  throw new Error("Use an HTTP(S) API origin without credentials.");
}
const project = importProjectFile(await readFile(new URL("../examples/ankara-two-cell-walkthrough.atom-project.json", import.meta.url), "utf8"));
const recorded = JSON.parse(await readFile(new URL("../docs/planning-walkthrough-evidence.json", import.meta.url), "utf8"));
const plan = project.scenarios[0].plan;
const cells = plan.selectedNetworkTowerIds.map((id) => plan.inventory.find((cell) => cell.id === id));
assert.ok(cells.every(Boolean), "Every selected Cell must be retained in the fixture");
const request = buildNetworkOptimizationPayload(cells, plan.settings, plan.networkAzimuths, plan.optimizationConfig);
assert.deepEqual(request, recorded.request, "Walkthrough inputs differ from the recorded example");

async function api(route, payload) {
  const response = await fetch(new URL(route, baseURL), {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "application/json" } : {},
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(90_000),
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(`${route}: HTTP ${response.status}; Retry-After=${response.headers.get("retry-after") ?? "absent"}. ${await response.text()}`);
  }
  return response.json();
}

function metrics(response) {
  const stats = response.stats;
  return {
    score: stats.score,
    servedDemandWeight: stats.raw_metrics.served_weighted_demand,
    relevantDemandWeight: stats.raw_metrics.total_weighted_demand,
    residentialBuildings: stats.unique_residential_buildings,
    overlapBuildings: stats.overlap_buildings,
    propagationReach: stats.raw_metrics.coverage_reach_score,
  };
}

const meta = await api("/api/meta");
assert.deepEqual(datasetReference(meta), project.datasetRef, "Select the exact Ankara pack and hashes before running this example");
assert.equal(meta.model_version, recorded.runtime.modelVersion, "The recorded model version differs");
// Two sequential RF requests. No retry or budget override; a busy API fails visibly.
const baseline = await api("/api/evaluate-network", request);
const optimization = await api("/api/optimize-network", request);
const alternative = optimization.pareto_frontier.find((solution) => solution.id === recorded.alternative.solutionId);
assert.ok(alternative, "The recorded trade-off is absent from this frontier");
const summary = {
  runtime: { applicationVersion: meta.application_version, buildCommit: meta.build_commit, modelVersion: meta.model_version },
  dataset: datasetReference(meta),
  scenarioFingerprint: optimization.scenario_fingerprint,
  baseline: metrics(baseline),
  recommended: { azimuths: optimization.optimized_towers.map((cell) => ({ id: cell.id, azimuth: cell.optimal_azimuth })), ...metrics(optimization) },
  alternative: { solutionId: alternative.id, ...metrics(alternative) },
};
await mkdir(outputDirectory, { recursive: true });
for (const [name, value] of Object.entries({ request, meta, baseline, optimization, summary })) {
  await writeFile(path.join(outputDirectory, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}
assert.equal(baseline.scenario_fingerprint, recorded.scenarioFingerprint);
assert.equal(summary.scenarioFingerprint, recorded.scenarioFingerprint);
assert.deepEqual(summary.baseline, recorded.baseline);
assert.deepEqual(summary.recommended, recorded.recommended);
assert.deepEqual(summary.alternative, recorded.alternative);
assert.deepEqual(metrics(optimization.baseline), summary.baseline, "Optimize must retain the same baseline as Evaluate");
console.log(JSON.stringify(summary, null, 2));
console.log(`Recorded comparison matched. Full API evidence: ${path.resolve(outputDirectory)}`);
