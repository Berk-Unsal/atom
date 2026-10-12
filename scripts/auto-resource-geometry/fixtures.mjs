// Audit payloads always use the established frontend builders.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SIMULATION } from '../../frontend-react/src/generated/policy.js';
import { buildNetworkOptimizationPayload, buildInterferencePayload, buildSimulationPayload } from '../../frontend-react/src/utils/requestPayloads.js';
import { createDefaultOptimizationConfig } from '../../frontend-react/src/utils/optimizationConfig.js';
const out=process.argv[2]; fs.mkdirSync(out,{recursive:true});
const data=JSON.parse(fs.readFileSync(new URL('../../data-pipeline/ankara_5g_nodes.geojson',import.meta.url)));
const towers=data.features.map(f=>({id:String(f.id),cellId:String(f.properties.cell_id),coordinates:f.geometry.coordinates,properties:f.properties}));
const unique=[...new Map(towers.map(t=>[t.coordinates.join(','),t])).values()].sort((a,b)=>a.cellId.localeCompare(b.cellId,'en',{numeric:true}));
if(!fs.existsSync(path.join(out,'domains.json'))){
 const candidates=unique.map(anchor=>({id:`inventory-${anchor.cellId}`,center:anchor.coordinates,towers:[...towers].sort((a,b)=>distance(a,anchor)-distance(b,anchor)||a.cellId.localeCompare(b.cellId,'en',{numeric:true})).filter((t,i,ts)=>ts.findIndex(x=>x.cellId===t.cellId)===i).slice(0,6)}));
 fs.writeFileSync(path.join(out,'candidates.json'),JSON.stringify(candidates));
} else {
 const domains=JSON.parse(fs.readFileSync(path.join(out,'domains.json'))).selected;
 for(const d of domains) for(const frequencyGHz of [2.6,28]) for(const [level,rayCount,radiusMeters] of [['normal',120,400],['rays',240,400],['radius',120,800],['held-setting',180,600]]){
  const settings={...DEFAULT_SIMULATION,frequencyGHz,rayCount,radiusMeters,txPowerDbm:30,beamWidthDeg:120,interferenceBandwidthMHz:frequencyGHz===2.6?20:100};
  const selected=d.towers;
  const f={domain:d.id,band:d.band,split:d.split,level,n:6,frequencyGHz,rays:rayCount,radius:radiusMeters,network:buildNetworkOptimizationPayload(selected,settings,{},createDefaultOptimizationConfig()),interference:buildInterferencePayload(selected,settings,null,{}),simulations:selected.map((t,i)=>buildSimulationPayload(t,settings,i))};
  fs.writeFileSync(path.join(out,`${d.id}-${frequencyGHz}-${level}.json`),JSON.stringify(f));
 }
}
function distance(a,b){return (a.coordinates[0]-b.coordinates[0])**2*Math.cos(b.coordinates[1]*Math.PI/180)**2+(a.coordinates[1]-b.coordinates[1])**2;}
