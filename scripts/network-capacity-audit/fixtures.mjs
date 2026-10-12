import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SIMULATION } from '../../frontend-react/src/generated/policy.js';
import { buildNetworkOptimizationPayload, buildInterferencePayload, buildSimulationPayload } from '../../frontend-react/src/utils/requestPayloads.js';
import { createDefaultOptimizationConfig } from '../../frontend-react/src/utils/optimizationConfig.js';
const out = process.argv[2];
if (!out) throw new Error('Output directory required');
fs.mkdirSync(out, { recursive: true });
const dataset = JSON.parse(fs.readFileSync(new URL('../../data-pipeline/ankara_5g_nodes.geojson', import.meta.url)));
// Preserve the recent deadline reproduction, then append nearest inventory cells.
const baseIDs = ['9664800','26390','9664790','9664795','9664791','9664794'];
const base = baseIDs.map(id => dataset.features.find(f => String(f.properties.cell_id) === id));
if (base.some(f => !f)) throw new Error('Missing inventory cell');
const center = base.reduce((a,f) => a.map((x,i) => x + f.geometry.coordinates[i]/base.length), [0,0]);
const distance = f => (f.geometry.coordinates[0]-center[0])**2 * Math.cos(center[1]*Math.PI/180)**2 + (f.geometry.coordinates[1]-center[1])**2;
const remaining = dataset.features.filter(f => !baseIDs.includes(String(f.properties.cell_id))).sort((a,b) => distance(a)-distance(b) || String(a.properties.cell_id).localeCompare(String(b.properties.cell_id), 'en', {numeric:true}));
const seen = new Set(baseIDs);
const chosen = [...base];
for (const f of remaining) { const id=String(f.properties.cell_id); if(!seen.has(id)) { chosen.push(f); seen.add(id); } if(chosen.length===12) break; }
const towers = chosen.map(f => ({id: String(f.id), cellId:String(f.properties.cell_id), coordinates:f.geometry.coordinates, properties:f.properties}));
fs.writeFileSync(path.join(out,'inventory.json'), JSON.stringify({center, selectionRule:'deadline-audit six IDs in original order; append nearest distinct cell IDs by cosine-adjusted squared coordinate distance, ID tie-break', towers, features:chosen},null,2));
for(const n of [6,8,10,12]) for(const frequencyGHz of [2.6,28]) {
 const settings={...DEFAULT_SIMULATION, frequencyGHz, interferenceBandwidthMHz:frequencyGHz===2.6?20:100};
 const selected=towers.slice(0,n);
 fs.writeFileSync(path.join(out,`${n}-${frequencyGHz}.json`),JSON.stringify({n,frequencyGHz,settings,towers:selected, network:buildNetworkOptimizationPayload(selected,settings,{},createDefaultOptimizationConfig()), interference:buildInterferencePayload(selected,settings,null,{}), simulations:selected.map((tower,index)=>buildSimulationPayload(tower,settings,index))}));
}
console.log(JSON.stringify({center,towers:towers.map(t=>({id:t.id,cellId:t.cellId,coordinates:t.coordinates})),out},null,2));
