// Reproduce the historical fixture selection, then use W1 RF settings for a
// clearly secondary geometry continuity control. Never time 10/12-Cell inputs.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SIMULATION } from '../../frontend-react/src/generated/policy.js';
import { buildNetworkOptimizationPayload, buildInterferencePayload, buildSimulationPayload } from '../../frontend-react/src/utils/requestPayloads.js';
import { createDefaultOptimizationConfig } from '../../frontend-react/src/utils/optimizationConfig.js';

const out = process.argv[2];
const source = JSON.parse(fs.readFileSync(path.join(out, 'historical-original', 'inventory.json')));
const cells = source.towers.slice(0, 8);
const base = JSON.parse(fs.readFileSync(path.join(out, 'layout-selection.json')));
for (const n of [6, 8]) for (const frequencyGHz of [2.6, 28]) {
  const settings = { ...DEFAULT_SIMULATION, frequencyGHz, rayCount: 120, radiusMeters: 400, txPowerDbm: 30, beamWidthDeg: 120, interferenceBandwidthMHz: frequencyGHz === 2.6 ? 20 : 100 };
  const towers = cells.slice(0, n);
  const f = { domain: 'historical-continuity', band: 'historical', split: 'secondary', level: 'W1', n, frequencyGHz, rays: 120, radius: 400, network: buildNetworkOptimizationPayload(towers, settings, {}, createDefaultOptimizationConfig()), interference: buildInterferencePayload(towers, settings, null, {}), simulations: towers.map((t, i) => buildSimulationPayload(t, settings, i)) };
  fs.writeFileSync(path.join(out, 'fixtures', `historical-continuity-${frequencyGHz}-${n}C-W1.json`), JSON.stringify(f), { flag: 'wx' });
}
const original = JSON.parse(fs.readFileSync(path.join(out, 'historical-original', '8-2.6.json')));
fs.writeFileSync(path.join(out, 'historical-comparison.json'), JSON.stringify({ source_tool: 'scripts/network-capacity-audit/fixtures.mjs', selection_rule: source.selectionRule, eight_cell_ids: cells.map(t => t.cellId), towers: cells, original_rf_rays: original.network.rays, original_rf_radius_m: original.network.radius_m, control_rf_rays: 120, control_rf_radius_m: 400, paired_domain_matches: base.selected.filter(d => JSON.stringify(d.towers.map(t => t.cellId)) === JSON.stringify(cells.map(t => t.cellId))).map(d => d.id), role: 'secondary historical geometry continuity only; explicitly W1 RF settings, not a primary layout or requalification of historical timing' }, null, 2), { flag: 'wx' });
