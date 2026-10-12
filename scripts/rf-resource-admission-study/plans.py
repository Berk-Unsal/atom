#!/usr/bin/env python3
"""Generate bounded supported scenarios; no scientific settings are overridden."""
import copy,json,pathlib
W=pathlib.Path('/tmp/atom-resource-study');(W/'plans').mkdir(exist_ok=True)
def clone(v):return copy.deepcopy(v)
def write(name,plans): (W/'plans'/f'{name}.json').write_text(json.dumps(plans))
def change(v,**kw):
 v=clone(v);v.update(kw)
 for k,val in kw.items():
  if k in ['radius_m','beam_width','tx_power_dbm']:
   if 'rf_profile' in v:v['rf_profile'][k]=val
   for t in v.get('towers',[]): t['rf_profile'][k]=val
 return v
def req(ep,body,client=1):return dict(endpoint='/api/'+ep,body=body,client=client)
def case(label,ep,body,**kw):return dict(label=label,requests=[req(ep,body)],**kw)
for freq in [2.6,28]:
 f=json.loads((W/'fixtures'/f'6-{freq}.json').read_text());s=f['simulations'][0];n=f['network'];i=f['interference'];tech=i['network_tech'];lon=s['tower_lon'];lat=s['tower_lat']
 surface=change(s,cell_size_m=25)
 rec=change(n,network_tech=tech,search_polygon=[[lon-.005,lat-.005],[lon+.005,lat-.005],[lon+.005,lat+.005],[lon-.005,lat+.005]])
 rec={k:v for k,v in rec.items() if k in ['network_tech','towers','rays','radius_m','frequency_ghz','tx_power_dbm','beam_width','calibration_offset_db','search_polygon','max_results']};rec['towers']=rec['towers'][:2]
 samples=lambda count:[dict(id=f'm-{k}',lon=lon+(k%50-25)*.00005,lat=lat+(k//50-25)*.00005,technology=tech,rsrp_dbm=-90) for k in range(count)]
 measurement={k:v for k,v in change(i,samples=samples(1)).items() if k in ['network_tech','towers','radius_m','frequency_ghz','tx_power_dbm','beam_width','bandwidth_mhz','noise_figure_db','calibration_offset_db','samples']}
 job=lambda count,base=s,name='resource':dict(name=name,base=base,matrix=dict(azimuths_deg=[k*360/count for k in range(count)]))
 plans=[]
 for rays in [8,60,120,360,720]:plans.append(case(f'rays-{rays}','simulate',change(s,rays=rays)))
 for radius in [1000,2500,5000]:plans.append(case(f'radius-{radius}','simulate',change(s,radius_m=radius)))
 for cells in [2,4,6]:v=clone(n);v['towers']=v['towers'][:cells];plans.append(case(f'cells-{cells}','evaluate-network',v))
 for size in [25,10]:plans.append(case(f'surface-{size}','coverage-surface',change(s,cell_size_m=size)))
 for spacing in [200,40,20]:plans.append(case(f'interference-spacing-{spacing}','interference',change(i,sample_spacing_m=spacing)))
 for count in [1,100,1000,5000]:plans.append(case(f'measurements-{count}','measurements/evaluate',change(measurement,samples=samples(count))))
 for policy in ['deterministic_multistart_coordinate_v1','deterministic_pareto_archive_search_v1']:
  for budget in [500,5000]:plans.append(case(f'{policy}-{budget}','optimize-network',change(n,search_policy=policy,max_unique_evaluations=budget)))
 for count in [1,4,16,64]:plans.append(dict(label=f'experiment-{count}',requests=[],async_=[job(count,name=f'runs-{count}')]))
 for p in plans:
  if 'async_' in p:p['async']=p.pop('async_')
 write(f'sensitivity-{freq}',plans)
 highS=change(s,rays=125,radius_m=5000,tx_power_dbm=60,beam_width=360)
 highN=change(n,rays=125,radius_m=5000,tx_power_dbm=60,beam_width=360)
 highI=change(i,radius_m=5000,tx_power_dbm=60,beam_width=360,sample_spacing_m=20)
 highRec=change(rec,rays=125,radius_m=5000,tx_power_dbm=60,beam_width=360,max_results=10)
 highRec['towers']=clone(n['towers'][:5])
 for t in highRec['towers']:t['rf_profile'].update(radius_m=5000,tx_power_dbm=60,beam_width=360)
 highs=[case('high-simulate','simulate',highS),case('high-rays-radius','simulate',change(s,rays=720,radius_m=850,tx_power_dbm=60,beam_width=360)),case('high-evaluate','evaluate-network',highN),case('high-optimize','optimize-network',highN),case('high-interference','interference',highI),case('high-azimuth','optimize-azimuth',highS),case('high-building','building-entry-analysis',highN),case('high-surface','coverage-surface',change(s,radius_m=1575,rays=120,cell_size_m=10,tx_power_dbm=60,beam_width=360)),case('high-recommend','recommend-sites',highRec),case('high-measurements','measurements/evaluate',change(measurement,radius_m=5000,tx_power_dbm=60,beam_width=360,samples=samples(5000))),case('max-search-budget','optimize-network',change(n,search_policy='deterministic_pareto_archive_search_v1',max_search_passes=64,max_unique_evaluations=100000,max_expanded_states=5000,max_search_rounds=64)),dict(label='high-experiment-64',requests=[],async_=[job(64,highS,'high-runs-64')])]
 for p in highs:
  if 'async_' in p:p['async']=p.pop('async_')
 write(f'high-{freq}',highs)
 concurrent=[]
 for label,a,b in [('opt-opt',req('optimize-network',n),req('optimize-network',n,2)),('opt-eval',req('optimize-network',n),req('evaluate-network',n,2)),('opt-interference',req('optimize-network',n),req('interference',i,2)),('eval-eval',req('evaluate-network',n),req('evaluate-network',n,2)),('recommend-opt',req('recommend-sites',rec),req('optimize-network',n,2)),('heavy-map-map',req('simulate',highS),req('simulate',highS,2))]: concurrent.append(dict(label=label,requests=[a,b]))
 concurrent +=[dict(label='same-IP',requests=[req('optimize-network',n),req('optimize-network',n)],gate=True),dict(label='three-IP',requests=[req('optimize-network',n,k) for k in [1,2,3]],gate=True),case('cancel-high-optimize','optimize-network',highN,cancel_ms=100),case('cancel-high-evaluate','evaluate-network',highN,cancel_ms=100)]
 write(f'concurrent-{freq}',concurrent)
 overlap=[dict(label='async-alone-16',requests=[],async_=[job(16,name='async-alone')]),dict(label='async-evaluate',requests=[req('evaluate-network',n)],async_=[job(16,name='async-evaluate')]),dict(label='async-optimize',requests=[req('optimize-network',n)],async_=[job(16,name='async-optimize')]),dict(label='async-two-interactive',requests=[req('optimize-network',n),req('evaluate-network',n,2)],async_=[job(64,name='async-two')])]
 for p in overlap:p['async']=p.pop('async_')
 write(f'overlap-{freq}',overlap)
 domains=[]
 for label,x,y in [('canonical',lon,lat),('central',32.854,39.922),('peripheral',32.65,39.80)]:domains.append(case('domain-'+label,'simulate',change(s,tower_lon=x,tower_lat=y)))
 domains.append(case('controlled-synthetic','simulate',s,synthetic=True))
 write(f'domains-{freq}',domains)
# Additional evidence-guided pairs and bounded search predictors, still within validation.
for freq in [2.6,28]:
 p=W/'plans'/f'high-{freq}.json';high=json.loads(p.read_text())
 for x in high:
  if x['label']=='high-recommend':x['requests'][0]['body']['search_polygon']=[[32.45,39.55],[33.25,39.55],[33.25,40.25],[32.45,40.25]]
 p.write_text(json.dumps(high));by_name={x['label']:x for x in high}
 p=W/'plans'/f'concurrent-{freq}.json';pairs=json.loads(p.read_text())
 for label,key in [('high-opt-opt','high-optimize'),('largest-map-pair','high-rays-radius')]:
  a=clone(by_name[key]['requests'][0]);b=clone(a);b['client']=2;pairs.append(dict(label=label,requests=[a,b]))
 p.write_text(json.dumps(pairs))
 f=json.loads((W/'fixtures'/f'6-{freq}.json').read_text());s=f['simulations'][0];n=f['network'];pred=[]
 for rays in [120,360,720]:
  v=change(s,rays=rays);v['rf_profile']['propagation_model']='legacy_fspl_walls';pred.append(case(f'legacy-rays-{rays}','simulate',v))
 for policy in ['deterministic_multistart_coordinate_v1','deterministic_pareto_archive_search_v1']:
  for budget in [10,50]:pred.append(case(f'bounded-{policy}-{budget}','optimize-network',change(n,search_policy=policy,max_unique_evaluations=budget)))
 v=clone(n)
 if not any(x['id']=='radio_quality' for x in v['optimization']['objectives']):v['optimization']['objectives'].append(dict(id='radio_quality',weight=50))
 for x in v['optimization']['objectives']:
  if x['id']=='radio_quality':x['weight']=50
 pred.append(case('radio-quality-optimizer','optimize-network',v));write(f'predictors-{freq}',pred)
 write(f'maps-{freq}',[case(f'map-cell-{k+1}','simulate',body) for k,body in enumerate(f['simulations'])])
 normalJob=lambda index:dict(name=f'worker-{index}',base=s,matrix=dict(azimuths_deg=[k*360/32 for k in range(32)]))
 write(f'workers4-{freq}',[dict(label='configured-four-workers-plus-two',requests=[req('optimize-network',n),req('evaluate-network',n,2)],async_=[])] )
 p=W/'plans'/f'workers4-{freq}.json';d=json.loads(p.read_text());d[0].pop('async_');d[0]['async']=[normalJob(k) for k in range(4)];p.write_text(json.dumps(d))

for freq in [2.6,28]:
 f=json.loads((W/'fixtures'/f'6-{freq}.json').read_text())
 n=change(f['network'],rays=720,radius_m=850,tx_power_dbm=60,beam_width=360)
 sims=[change(s,rays=720,radius_m=850,tx_power_dbm=60,beam_width=360) for s in f['simulations']]
 ev=[req('evaluate-network',n)]+[req('simulate',s) for s in sims]
 inter=req('interference',change(f['interference'],radius_m=850,tx_power_dbm=60,beam_width=360,sample_spacing_m=20))
 write(f'bundles-{freq}',[dict(label='high-evaluate-map-bundle',requests=ev,sequential=True),dict(label='high-repeat-bundle',requests=ev+[inter]+ev,sequential=True)])
for freq in [2.6,28]:
 f=json.loads((W/'fixtures'/f'6-{freq}.json').read_text());n=f['network'];s=change(f['simulations'][0],rays=125,radius_m=5000,tx_power_dbm=60,beam_width=360)
 job=dict(name='heavy-overlap-16',base=s,matrix=dict(azimuths_deg=[k*360/16 for k in range(16)]))
 write(f'overlap-heavy-{freq}',[dict(label='heavy-async-plus-two-interactive',requests=[req('optimize-network',n),req('evaluate-network',n,2)],async_=[])] )
 p=W/'plans'/f'overlap-heavy-{freq}.json';d=json.loads(p.read_text());d[0].pop('async_');d[0]['async']=[job];p.write_text(json.dumps(d))
