import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Buffer } from "node:buffer";
import { exportProjectFile, importProjectFile } from "../frontend-react/src/utils/projectStore.js";

const source = JSON.parse(gunzipSync(readFileSync(new URL("../frontend-react/e2e/fixtures/persistence/six-cell-v2.atom-project.json.gz", import.meta.url))));
const pretty = JSON.stringify(source, null, 2);
const bytes = (value) => Buffer.byteLength(value);
const fragment = (value, depth) => {
  const text = JSON.stringify(value, null, 2);
  return bytes(text) + (text.split("\n").length - 1) * depth * 2;
};
const p = source.project;
const s = p.scenarios[0];
const a = s.artifacts;
const entries = [];
const row = (name, value) => entries.push({ name, bytes: value, percentage: value / bytes(pretty) * 100 });
row("Project metadata", Object.entries(p).filter(([key]) => !["draft", "scenarios", "domain"].includes(key)).reduce((total, [, value]) => total + fragment(value, 2), 0));
row("Project working draft / input state", fragment(p.draft, 2));
row("Scenario metadata, summary, dataset/model provenance", Object.entries(s).filter(([key]) => !["plan", "request", "domain", "artifacts"].includes(key)).reduce((total, [, value]) => total + fragment(value, 4), 0));
row("Scenario network / inventory inputs", fragment(s.plan, 4));
row("Scenario RF request", fragment(s.request, 4));
row("Versions / embedded domain metadata", fragment(s.domain, 4));
row("Merged per-Cell ray features (geometry + scientific properties)", fragment(a.simulation.geojson.features, 7));
row("RF statistics", fragment(a.simulation.stats, 6));
row("Optimization baseline", fragment(a.networkOptimization.baseline, 6));
row("Public Pareto alternatives", fragment(a.networkOptimization.pareto_frontier, 6));
row("Other optimization result / evidence", Object.entries(a.networkOptimization).filter(([key]) => !["baseline", "pareto_frontier"].includes(key)).reduce((total, [, value]) => total + fragment(value, 6), 0));
row("Interference (cleared by optimization in this workflow)", fragment(a.interferenceAnalysis, 5));
row("Other retained artifacts", Object.entries(a).filter(([key]) => !["simulation", "networkOptimization", "interferenceAnalysis"].includes(key)).reduce((total, [, value]) => total + fragment(value, 5), 0));
row("JSON keys, containers, separators and remaining whitespace", bytes(pretty) - entries.reduce((total, entry) => total + entry.bytes, 0));

function structuralStats(root) {
  const stack = [[root, 0]];
  let nodes = 0, depth = 0, largestArray = 0, largestObject = 0;
  while (stack.length) {
    const [value, level] = stack.pop();
    nodes += 1;
    depth = Math.max(depth, level);
    if (Array.isArray(value)) largestArray = Math.max(largestArray, value.length);
    else if (value && typeof value === "object") largestObject = Math.max(largestObject, Object.keys(value).length);
    if (value && typeof value === "object") for (const child of Object.values(value)) stack.push([child, level + 1]);
  }
  return { nodes, depth, largestArray, largestObject };
}
const features = a.simulation.geojson.features;
const duplicates = (field) => {
  const values = features.map((feature) => JSON.stringify(feature.properties[field]));
  return { occurrences: values.length, distinctValues: new Set(values).size };
};
const samples = [];
let compact;
for (let index = 0; index < 5; index += 1) {
  const start = performance.now();
  const legacy = JSON.stringify(source, null, 2);
  const prettyAt = performance.now();
  compact = exportProjectFile(p);
  const packedAt = performance.now();
  importProjectFile(compact);
  samples.push({ oldPrettyExportMs: prettyAt - start, packedExportMs: packedAt - prettyAt,
    completeImportMs: performance.now() - packedAt, oldBytes: bytes(legacy) });
}
const output = {
  reproducedWorkflow: "Six Cells / Evaluate / Interference / Optimize / Save Version / UI download",
  beforeBytes: bytes(pretty), beforeCompactJSONBytes: bytes(JSON.stringify(source)),
  afterBytes: bytes(compact), beforeStructure: structuralStats(source), afterStructure: structuralStats(JSON.parse(compact)),
  composition: entries,
  rayDetails: { features: features.length, perCell: Object.fromEntries([...new Set(features.map((feature) => feature.properties.cell_id))].map((cell) => [cell, features.filter((feature) => feature.properties.cell_id === cell).length])),
    geometryFragmentBytes: features.reduce((total, feature) => total + fragment(feature.geometry, 9), 0),
    losClassification: duplicates("los_classification"), linkBudget: duplicates("link_budget") },
  benchmark: { runtime: process.version, samples },
};
writeFileSync(new URL("../docs/assets/persistence-reliability/export-measurements.json", import.meta.url), JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ beforeBytes: output.beforeBytes, afterBytes: output.afterBytes, beforeNodes: output.beforeStructure.nodes, afterNodes: output.afterStructure.nodes }));
