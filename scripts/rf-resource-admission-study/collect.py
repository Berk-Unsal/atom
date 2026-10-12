#!/usr/bin/env python3
"""Publish measured dimensions, explicitly modeled arithmetic, and source bounds."""
import json,pathlib,hashlib,math,statistics,subprocess,platform,re
ROOT=pathlib.Path(__file__).resolve().parents[2];W=pathlib.Path('/tmp/atom-resource-study')
def load(p):return json.loads(p.read_text())
def metadata(body):
 towers=body.get('towers');profiles=[t.get('rf_profile',{}) for t in towers] if towers else [body.get('rf_profile',{})]
 radius=body.get('radius_m',400);rays=body.get('rays',120)
 result={k:body[k] for k in ['rays','radius_m','frequency_ghz','beam_width','tx_power_dbm','cell_size_m','sample_spacing_m','search_policy','max_search_passes','max_unique_evaluations','max_expanded_states','max_search_rounds','max_results'] if k in body}
 result.update(cells=len(towers) if towers is not None else 1,effective_radii_m=[p.get('radius_m',radius) for p in profiles],effective_beams_deg=[p.get('beam_width',body.get('beam_width',120)) for p in profiles],measurement_count=len(body.get('samples',[])),polygon_vertices=len(body.get('search_polygon',[])),request_sha256=hashlib.sha256(json.dumps(body,sort_keys=True).encode()).hexdigest())
 result['segment_budget_upper']=sum(rays*math.ceil(p.get('radius_m',radius)/25) for p in profiles)
 if 'cell_size_m' in body:result['grid_cells']=(math.ceil(2*radius/body['cell_size_m'])+1)**2
 if 'optimization' in body:result['optimization_objectives']=body['optimization'].get('objectives',[])
 return result
rows=[];ledgers=[]
for base,n in [(W,6),(pathlib.Path('/tmp/atom-resource-eight'),8),(pathlib.Path('/tmp/atom-resource-linux'),6)]:
 if not (base/'raw').exists():continue
 for p in sorted((base/'raw').glob('*.json')):
  name=p.name
  if name.endswith('.response.json') or '-jobs' in name or name.endswith('-resource.json') or '-optimized' in name:continue
  d=load(p)
  if not isinstance(d,dict) or 'rows' not in d:continue
  if not any(x in name for x in ['-endpoints.json','-workflows.json','-sensitivity-','-high-','-concurrent-','-overlap-','-domains-','-predictors-','-maps-','-workers4-','-explanations.json','-bundles-','-linux-']):continue
  ledgers.append({k:v for k,v in d.items() if k!='rows'}|dict(source_file=name,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
  for r in d['rows']:
   r['source_file']=name;r['environment']='instrumented-container' if base.name.endswith('-linux') else 'native-host';r['supported_cell_count']=r['n']<=6
   plan=r.pop('plan',None)
   if plan:
    r['inputs']=[metadata(x['body']) for x in plan['requests']]
    r['client_count']=len({x['client'] for x in plan['requests']})
    r['async_inputs']=[dict(runs=math.prod(max(1,len(v)) for v in x['matrix'].values()),base=metadata(x['base'])) for x in plan['async'] or []]
   rows.append(r)
container=load(W/'container.json') if (W/'container.json').exists() else None
browser=load(W/'browser.json') if (W/'browser.json').exists() else None
supported=[r for r in rows if r['n']==6 and r['environment']=='native-host']
single=[r for r in supported if (len(r['responses'])==1 and r.get('async_jobs',0)==0 and not r.get('cancel_ms',0) and not r.get('synthetic'))]
completed=[r for r in single if r['responses'][0]['status']==200]
workflows=[r for r in supported if r['source_file'].endswith('-workflows.json') or '-bundles-' in r['source_file']]
summary={}
for key in ['cpu_seconds','wall_seconds','rss_sampled_max_bytes','heap_sampled_max_bytes','response_bytes','allocation_bytes','equivalent_cores']:
 r=max(single,key=lambda x:x[key]);summary[key]=dict(value=r[key],label=r['label'],frequency_ghz=r['frequency_ghz'],status=r['responses'][0]['status'])
summary['completed_cpu_seconds']=dict(value=max(r['cpu_seconds'] for r in completed),label=max(completed,key=lambda r:r['cpu_seconds'])['label'])
summary['geometry']={k:dict(value=max(r['work'][k] for r in single),label=max(single,key=lambda r:r['work'][k])['label']) for k in single[0]['work']}
if workflows:
 r=max(workflows,key=lambda r:r['response_bytes']);summary['logical_workflow_bytes']=dict(value=r['response_bytes'],label=r['label'],frequency_ghz=r['frequency_ghz'])
ratios=[]
label_to_ep={'high-simulate':'/api/simulate','high-rays-radius':'/api/simulate','high-evaluate':'/api/evaluate-network','high-optimize':'/api/optimize-network','high-interference':'/api/interference','high-azimuth':'/api/optimize-azimuth','high-building':'/api/building-entry-analysis','high-surface':'/api/coverage-surface','high-recommend':'/api/recommend-sites','high-measurements':'/api/measurements/evaluate'}
for high,ep in label_to_ep.items():
 for f in [2.6,28]:
  h=next((r for r in supported if r['label']==high and r['frequency_ghz']==f),None);d=next((r for r in supported if r['label']==ep and r['frequency_ghz']==f),None)
  if not h or not d:continue
  ratios.append(dict(label=high,endpoint=ep,frequency_ghz=f,status=h['responses'][0]['status'],wall_ratio=h['wall_seconds']/d['wall_seconds'],cpu_ratio=h['cpu_seconds']/d['cpu_seconds'],geometry_ratios={k:h['work'][k]/d['work'][k] if d['work'][k] else None for k in h['work']},rss_delta_bytes=h['rss_sampled_max_bytes']-d['rss_sampled_max_bytes'],heap_delta_bytes=h['heap_sampled_max_bytes']-d['heap_sampled_max_bytes'],response_ratio=h['response_bytes']/d['response_bytes']))
transfer=[]
for r in sorted(completed,key=lambda r:r['response_bytes'],reverse=True)[:6]+workflows:
 transfer.append(dict(label=r['label'],frequency_ghz=r['frequency_ghz'],bytes=r['response_bytes'],modeled_seconds={str(m):r['response_bytes']*8/(m*1e6) for m in [10,50,100,1000]},model='MODELED raw bytes * 8 / decimal link rate; no compression, RTT, TLS, contention, parsing or rendering'))
# Deliberately try an uncalibrated input-only predictor against held-out radius/combination cases.
predictors=[]
for freq in [2.6,28]:
 baseline=next(r for r in supported if r['label']=='rays-120' and r['frequency_ghz']==freq)
 cases=[r for r in supported if r['frequency_ghz']==freq and (r['label'].startswith('rays-') or r['label'].startswith('radius-') or r['label'] in ['high-simulate','high-rays-radius'])]
 for r in cases:
  m=r['inputs'][0];ray=m.get('rays',120);radius=m.get('radius_m',400)
  for model,estimate in [('ray-only',baseline['cpu_seconds']*ray/120),('ray-times-radius',baseline['cpu_seconds']*ray/120*radius/400),('ray-times-area',baseline['cpu_seconds']*ray/120*(radius/400)**2)]:predictors.append(dict(frequency_ghz=freq,label=r['label'],model=model,predicted_cpu_seconds=estimate,actual_cpu_seconds=r['cpu_seconds'],actual_over_predicted=r['cpu_seconds']/estimate,relative_error=(estimate-r['cpu_seconds'])/r['cpu_seconds'],underestimated=estimate<r['cpu_seconds']))
errors=[]
for model in ['ray-only','ray-times-radius','ray-times-area']:
 rs=[r for r in predictors if r['model']==model];errors.append(dict(model=model,cases=len(rs),underestimated_cases=sum(r['underestimated'] for r in rs),maximum_underestimation_factor=max(r['actual_over_predicted'] for r in rs),maximum_overestimation_factor=max(1/r['actual_over_predicted'] for r in rs),safe_for_production=False))
correlations=[]
for freq in [2.6,28]:
 for prefix,field in [('rays-','rays'),('radius-','radius_m'),('cells-','cells'),('measurements-','measurement_count')]:
  rs=[r for r in supported if r['frequency_ghz']==freq and r['label'].startswith(prefix)]
  if len(rs)>1:
   x=[r['inputs'][0].get(field,120 if field=='rays' else 400) for r in rs];y=[r['cpu_seconds'] for r in rs]
   correlations.append(dict(frequency_ghz=freq,sweep=prefix,points=len(rs),pearson=statistics.correlation(x,y),note='descriptive in-sample correlation, no conservative bound or holdout guarantee'))
domain_inventory=load(W/'domain-inventory.json') if (W/'domain-inventory.json').exists() else None
# Separate geometry and byte predictors: exploratory, deliberately exposed to holdout domains.
geometry_trials=[];byte_trials=[]
for freq in [2.6,28]:
 baseline=next(r for r in supported if r['label']=='rays-120' and r['frequency_ghz']==freq)
 cases=[r for r in supported if r['frequency_ghz']==freq and len(r.get('inputs',[]))==1 and r['responses'][0]['endpoint']=='/api/simulate' and not r.get('synthetic') and not r.get('cancel_ms')]
 for r in cases:
  m=r['inputs'][0];steps=m['segment_budget_upper'];estimate=baseline['response_bytes']*steps/(120*16)
  byte_trials.append(dict(label=r['label'],frequency_ghz=freq,model='canonical bytes per requested segment budget',predicted_bytes=estimate,actual_bytes=r['response_bytes'],actual_over_predicted=r['response_bytes']/estimate,underestimated=estimate<r['response_bytes']))
  inv=next((x for x in (domain_inventory or {}).get('rows',[]) if x['label']==r['label'] and str(freq) in x['plan']),None)
  if inv:
   estimate=baseline['work']['spatial_candidates']*m.get('rays',120)/120*inv['union_footprints']/772*m.get('radius_m',400)/400
   actual=r['work']['spatial_candidates']
   geometry_trials.append(dict(label=r['label'],frequency_ghz=freq,model='canonical candidates times rays times domain footprint count times radius',predicted_candidates=estimate,actual_candidates=actual,actual_over_predicted=actual/estimate if estimate else None,underestimated=estimate<actual))
for dimension,trials in [('geometry',geometry_trials),('response-bytes',byte_trials)]:
 ratios_valid=[t['actual_over_predicted'] for t in trials if t['actual_over_predicted']]
 errors.append(dict(model=dimension,cases=len(trials),underestimated_cases=sum(t['underestimated'] for t in trials),maximum_underestimation_factor=max(ratios_valid),maximum_overestimation_factor=max(1/v for v in ratios_valid),safe_for_production=False))
job_rows=[]
for p in (W/'raw').glob('*-jobs.json'):
 for j in load(p):
  j['source_file']=p.name;j['snapshot_bundle_encoded_bytes']=p.stat().st_size;j['result_bytes_python_reserialized']=len(json.dumps(j.get('result'),separators=(',',':')).encode());j.pop('result',None);job_rows.append(j)
source_hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['backend-go','frontend-react/src'] for p in (ROOT/folder).rglob('*') if p.is_file() and (p.suffix in ['.go','.js','.jsx','.css'])}
supplemental=load(W/'checks/supplemental.json') if (W/'checks/supplemental.json').exists() else []
data=dict(schema_version=1,study_date_local='2026-10-04',classification='F',recommendation='Retain current policy; define and calibrate actual deployment target before implementing resource admission.',production_numeric_recommendation=None,production_numbers_certified=False,baseline=dict(branch='main',head='c48ef63c9ce064a72058e2b72c3cd095c7deb904',version='0.11.0',tracked_diff_stat='',preserved_untracked=['docs/rf-request-budget-policy-audit.md','docs/rf-request-budget-policy-measurements.json','scripts/rf-request-budget-policy-audit/']),production_invariance=dict(attempts=20,window_seconds=60,key='ClientIP',global_concurrency=2,client_concurrency=1,deadline_seconds=60,max_cells=6,production_files_changed=False),environment_samples=load(W/'environment.json') if (W/'environment.json').exists() else None,environment=dict(native=dict(cpu='Apple M4',architecture='arm64',logical_cpus=10,physical_memory_bytes=25769803776,go_version='go1.27.1',gomaxprocs=10,os=platform.platform(),container_quotas=None),container=dict(architecture='linux/arm64',logical_cpus=10,vm_memory_bytes=12600156160,cpu_max='max 100000',memory_max='max',go_build_version='go1.26.6',gomaxprocs=10,production_hardware_target_exists=False)),method=dict(label='LOCAL MEASUREMENT ONLY',rss_interval_ms=200,heap_goroutine_interval_ms=50,forced_gc_before_cases=True,cpu='getrusage process, includes GC and instrumentation',serialization='JSON encoder plus local writer/recorder',space_coverage='bounded finite evidence-guided sample; no certified maxima',synthetic='single controlled footprint; cost control only',container='unchanged Dockerfile image; instrumented test runtime separately labeled'),validated_source_inventory=load(W/'bounds-source.json'),initial_default_pass=dict(note='first pass overlapped image build; excluded from clean-pass comparisons',ledgers=[load(p) for p in (W/'initial-default').glob('*.json')]),ledgers=ledgers,rows=rows,observed_single_request_high_water=summary,default_high_comparisons=ratios,async_jobs=job_rows,async_queue_measurement=load(W/'queue.json') if (W/'queue.json').exists() else None,container_measurements=container,browser_measurements=browser,domain_prehandler_inventory=domain_inventory,modeled_transfer_times=transfer,predictor_trials=predictors,geometry_predictor_trials=geometry_trials,response_byte_predictor_trials=byte_trials,predictor_error=errors,correlations=correlations,checks=dict(baseline=load(W/'checks/baseline.json'),final=load(W/'checks/final.json') if (W/'checks/final.json').exists() else []),source_sha256=source_hashes,limitations=['No production hardware/SLO/load specified','No exhaustive validated-input or dataset complexity coverage','No mobile/device certification','No external network measurements','RSS/heap samples may miss peaks','Instrumented native and uninstrumented container toolchains differ','Local concurrency evidence cannot certify weaker or replicated deployments'])
data['checks']['supplemental']=supplemental
(ROOT/'docs/rf-resource-admission-measurements.json').write_text(json.dumps(data,indent=2)+'\n');print(len(rows),'rows',summary)
