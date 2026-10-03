// Exact frontend request builder + current defaults, with repository canonical
// Ankara locations. Run: node scripts/network-optimization-deadline-fixtures.mjs DIR
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_SIMULATION } from "../frontend-react/src/generated/policy.js";
import { buildNetworkOptimizationPayload } from "../frontend-react/src/utils/requestPayloads.js";
import { createDefaultOptimizationConfig } from "../frontend-react/src/utils/optimizationConfig.js";

const directory = process.argv[2];
if (!directory) throw new Error("Supply a fixture output directory");
await mkdir(directory, { recursive: true });
const coordinates = [[32.8477, 39.9113], [32.8585, 39.9081], [32.8488, 39.9240], [32.8677, 39.9054], [32.8639, 39.9062], [32.8523, 39.9135]];
const ids = ["LTE-35084", "LTE-35104", "LTE-35877", "LTE-313100", "LTE-313110", "LTE-322828"];
for (const frequencyGHz of [28, 2.6]) {
  for (const count of [2, 3, 4, 5, 6]) {
    const towers = coordinates.slice(0, count).map((point, index) => ({ id: ids[index], coordinates: point, azimuth: index * 60 }));
    const payload = buildNetworkOptimizationPayload(towers, { ...DEFAULT_SIMULATION, frequencyGHz }, {}, createDefaultOptimizationConfig());
    await writeFile(join(directory, `${count}-${frequencyGHz}.json`), JSON.stringify(payload, null, 2));
  }
}
// User-confirmed affected cells, in the supplied selection order. Dataset radio
// tags do not override the UI RF profile; all use the current selected settings.
const dataset = JSON.parse(await readFile(new URL("../data-pipeline/ankara_5g_nodes.geojson", import.meta.url), "utf8"));
const affectedIDs = ["9664800", "26390", "9664790", "9664795", "9664791", "9664794"];
const affected = affectedIDs.map((cellId) => {
  const feature = dataset.features.find((entry) => String(entry.properties.cell_id) === cellId);
  if (!feature) throw new Error(`Missing affected dataset cell ${cellId}`);
  return { id: feature.id, cellId, coordinates: feature.geometry.coordinates };
});
for (const frequencyGHz of [28, 2.6]) {
  for (const count of [2, 3, 4, 5, 6]) {
    const payload = buildNetworkOptimizationPayload(affected.slice(0, count), { ...DEFAULT_SIMULATION, frequencyGHz }, {}, createDefaultOptimizationConfig());
    await writeFile(join(directory, `user-${count}-${frequencyGHz}.json`), JSON.stringify(payload, null, 2));
  }
}
const pathological = buildNetworkOptimizationPayload(affected, DEFAULT_SIMULATION, {}, createDefaultOptimizationConfig());
pathological.search_policy = "deterministic_multistart_coordinate_v1";
pathological.max_search_passes = 64;
pathological.max_unique_evaluations = 100000;
await writeFile(join(directory, "pathological-6-28.json"), JSON.stringify(pathological, null, 2));
