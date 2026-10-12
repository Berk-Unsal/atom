import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SIMULATION } from '../../frontend-react/src/generated/policy.js';
import { buildNetworkOptimizationPayload, buildInterferencePayload, buildSimulationPayload } from '../../frontend-react/src/utils/requestPayloads.js';
import { createDefaultOptimizationConfig } from '../../frontend-react/src/utils/optimizationConfig.js';
const out=process.argv[2];
const domains=JSON.parse(fs.readFileSync(path.join(out,'domains.json'))).selected;
const lock=JSON.parse(fs.readFileSync(new URL('./validation-lock.json',import.meta.url)));
for(const d of domains) for(const frequencyGHz of lock.frequencies_ghz) for(const rf of lock.rf_settings) for(const search of lock.search_settings){
 const settings={...DEFAULT_SIMULATION,frequencyGHz,rayCount:rf.rays,radiusMeters:rf.radius_m,txPowerDbm:30,beamWidthDeg:120,interferenceBandwidthMHz:frequencyGHz===2.6?20:100};
 const selected=d.towers;
 const network=buildNetworkOptimizationPayload(selected,settings,{},createDefaultOptimizationConfig());
 for(const [k,v] of Object.entries(search)) if(k!=='id') network[k]=v;
 const f={domain:d.id,band:d.band,split:'validation',level:rf.id+'--'+search.id,n:6,frequencyGHz,rays:rf.rays,radius:rf.radius_m,network,interference:buildInterferencePayload(selected,settings,null,{}),simulations:selected.map((t,i)=>buildSimulationPayload(t,settings,i))};
 fs.writeFileSync(path.join(out,`${d.id}-${frequencyGHz}-${f.level}.json`),JSON.stringify(f),{flag:'wx'});
}
