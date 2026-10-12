import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SIMULATION } from '../../frontend-react/src/generated/policy.js';
import { buildNetworkOptimizationPayload, buildInterferencePayload, buildSimulationPayload } from '../../frontend-react/src/utils/requestPayloads.js';
import { createDefaultOptimizationConfig } from '../../frontend-react/src/utils/optimizationConfig.js';
const out=process.argv[2];
const domains=JSON.parse(fs.readFileSync(new URL('./domain-manifest.json',import.meta.url))).selected;
const settingsByClass=[['W1',120,400,{}],['W2',240,600,{}],['W2-alt',240,600,{search_policy:'deterministic_multistart_coordinate_v1',max_search_passes:2,max_unique_evaluations:192}],['W3',360,1500,{search_policy:'deterministic_pareto_archive_search_v1',max_search_passes:3,max_unique_evaluations:768}]];
for(const d of domains) for(const frequencyGHz of [2.6,28]) for(const [level,rayCount,radiusMeters,search] of settingsByClass) {
 const settings={...DEFAULT_SIMULATION,frequencyGHz,rayCount,radiusMeters,txPowerDbm:30,beamWidthDeg:120,interferenceBandwidthMHz:frequencyGHz===2.6?20:100};
 const network={...buildNetworkOptimizationPayload(d.towers,settings,{},createDefaultOptimizationConfig()),...search};
 const f={domain:d.id,band:d.band,split:d.split,level,n:6,frequencyGHz,rays:rayCount,radius:radiusMeters,network,interference:buildInterferencePayload(d.towers,settings,null,{}),simulations:d.towers.map((t,i)=>buildSimulationPayload(t,settings,i))};
 fs.writeFileSync(path.join(out,`${d.id}-${frequencyGHz}-${level}.json`),JSON.stringify(f),{flag:'wx'});
}
