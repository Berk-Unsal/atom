// Inventory-only selection; production payload builders; no RF measurements.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SIMULATION } from '../../frontend-react/src/generated/policy.js';
import { buildNetworkOptimizationPayload, buildInterferencePayload, buildSimulationPayload } from '../../frontend-react/src/utils/requestPayloads.js';
import { createDefaultOptimizationConfig } from '../../frontend-react/src/utils/optimizationConfig.js';

const out = process.argv[2];
if (!out) throw new Error('Dedicated evidence directory required');
fs.mkdirSync(path.join(out, 'fixtures'), { recursive: true });
const prior = JSON.parse(fs.readFileSync(new URL('../w1-shipping-runtime-qualification/domain-manifest.json', import.meta.url)));
const inventory = JSON.parse(fs.readFileSync(new URL('../../data-pipeline/ankara_5g_nodes.geojson', import.meta.url)));
const towers = inventory.features.map(f => ({ id: String(f.id), cellId: String(f.properties.cell_id), coordinates: f.geometry.coordinates, properties: f.properties }));
const selected = prior.selected.map(d => {
  const distance = t => (t.coordinates[0] - d.center[0]) ** 2 * Math.cos(d.center[1] * Math.PI / 180) ** 2 + (t.coordinates[1] - d.center[1]) ** 2;
  const seen = new Set(d.towers.map(t => t.cellId));
  const added = [];
  for (const t of [...towers].sort((a, b) => distance(a) - distance(b) || a.cellId.localeCompare(b.cellId, 'en', { numeric: true }))) {
    if (!seen.has(t.cellId)) { added.push(t); seen.add(t.cellId); }
    if (added.length === 2) break;
  }
  const eight = [...d.towers, ...added];
  if (seen.size !== 8) throw new Error('Eight distinct inventory IDs required');
  for (const t of eight) {
    const found = towers.find(x => x.cellId === t.cellId);
    if (!found || JSON.stringify(found.coordinates) !== JSON.stringify(t.coordinates)) throw new Error('Invalid inventory member');
  }
  const colocated = eight.map((t, i) => eight.slice(0, i).filter(x => JSON.stringify(x.coordinates) === JSON.stringify(t.coordinates)).map(x => [x.cellId, t.cellId])).flat();
  const result = { ...d, original_six_ids: d.towers.map(t => t.cellId), additional_two_ids: added.map(t => t.cellId), towers: eight, colocated_pairs: colocated, relative_geometry: eight.map(t => ({ cell_id: t.cellId, delta_lon: t.coordinates[0] - d.center[0], delta_lat: t.coordinates[1] - d.center[1], anchor_distance_m: Math.sqrt(distance(t)) * 111320 })) };
  for (const n of [6, 8]) for (const frequencyGHz of [2.6, 28]) {
    const settings = { ...DEFAULT_SIMULATION, frequencyGHz, rayCount: 120, radiusMeters: 400, txPowerDbm: 30, beamWidthDeg: 120, interferenceBandwidthMHz: frequencyGHz === 2.6 ? 20 : 100 };
    const cells = eight.slice(0, n);
    const f = { domain: d.id, band: d.band, split: d.split, level: 'W1', n, frequencyGHz, rays: 120, radius: 400, network: buildNetworkOptimizationPayload(cells, settings, {}, createDefaultOptimizationConfig()), interference: buildInterferencePayload(cells, settings, null, {}), simulations: cells.map((t, i) => buildSimulationPayload(t, settings, i)) };
    if (n === 6) {
      const frozen = JSON.parse(fs.readFileSync(new URL(`../w1-shipping-runtime-qualification/fixtures/${d.id}-${frequencyGHz}-W1.json`, import.meta.url)));
      if (JSON.stringify(f) !== JSON.stringify(frozen)) throw new Error('Six-Cell payload preservation failed');
    }
    fs.writeFileSync(path.join(out, 'fixtures', `${d.id}-${frequencyGHz}-${n}C-W1.json`), JSON.stringify(f), { flag: 'wx' });
  }
  return result;
});
fs.writeFileSync(path.join(out, 'layout-selection.json'), JSON.stringify({ schema_version: 1, method: 'Preserve frozen six IDs and order; append next two nearest distinct inventory IDs to original anchor by cosine-adjusted squared distance then numeric English ID order; no RF timing', dataset: prior.dataset, global_footprints: prior.global_footprints, global_vertices: prior.global_vertices, inventory_cells: prior.inventory_cells, selected }, null, 2), { flag: 'wx' });
