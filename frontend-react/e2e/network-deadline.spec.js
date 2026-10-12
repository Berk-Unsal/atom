/* global process */
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { DEFAULT_SIMULATION } from "../src/generated/policy.js";
import { buildNetworkOptimizationPayload } from "../src/utils/requestPayloads.js";
import { createDefaultOptimizationConfig } from "../src/utils/optimizationConfig.js";

test("real network optimization deadline: affected six-cell defaults preserve output and one-request cost", async ({ request }, testInfo) => {
  test.skip(process.env.ATOM_REAL_E2E !== "1", "Requires the isolated real backend");
  test.skip(testInfo.project.name !== "desktop-1440", "One isolated client/window");
  test.setTimeout(120_000);
  const dataset = JSON.parse(await readFile(new URL("../../data-pipeline/ankara_5g_nodes.geojson", import.meta.url), "utf8"));
  const towers = ["9664800", "26390", "9664790", "9664795", "9664791", "9664794"].map((cellId) => {
    const feature = dataset.features.find((entry) => String(entry.properties.cell_id) === cellId);
    return { id: feature.id, cellId, coordinates: feature.geometry.coordinates };
  });
  const payload = buildNetworkOptimizationPayload(towers, DEFAULT_SIMULATION, {}, createDefaultOptimizationConfig());
  const original = JSON.stringify(payload);
  const started = performance.now();
  const response = await request.post("/api/optimize-network", { data: payload, timeout: 70_000 });
  expect(response.status()).toBe(200);
  expect(performance.now() - started).toBeLessThan(60_000);
  expect(response.headers()["ratelimit-limit"]).toBe("20");
  expect(response.headers()["ratelimit-remaining"]).toBe("19");
  const body = await response.body();
  // Successful uncached production-handler response captured before the fix.
  expect(createHash("sha256").update(body).digest("hex")).toBe("651d3a97c8b3dec6c67d580dfeccd8f74cca9dbe6faf5d2261b9b6182290eed0");
  const result = JSON.parse(body.toString());
  expect(result.optimized_towers).toHaveLength(6);
  expect(result.scenario_fingerprint).toBe("network-d7a9f6c9a1b34208e5eceb368960fc61");
  expect(result.optimization.recommended_solution_id).toBe("220.0,220.0,350.0,120.0,90.0,90.0");
  expect(JSON.stringify(payload)).toBe(original);
});
