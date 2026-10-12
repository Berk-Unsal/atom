#!/usr/bin/env python3
"""Interpretable, study-only estimators. Held-out values never affect fitting/margins."""
import collections, hashlib, json, math, pathlib, statistics
ROOT=pathlib.Path(__file__).resolve().parents[2]
NON_RAY_OPERATIONS={'interference','surface','building-entry'}
ISOLATED={'simulate','evaluate','evaluate-maps','optimize','optimize-maps','interference','explain','azimuth','surface','building-entry','recommendation'}
MODELS={'parameters':['rays','radius_m','frequency_28'], 'footprints':['rays','radius_m','frequency_28','footprints'], 'vertices':['rays','radius_m','frequency_28','vertices'], 'edges':['rays','radius_m','frequency_28','edges'], 'density':['rays','radius_m','frequency_28','vertex_density','area'], 'geometry':['rays','radius_m','frequency_28','footprints','vertices']}
TARGETS=['cpu_seconds','response_bytes','spatial_candidates','edge_intersection_checks','allocation_bytes','rss_sampled_max_bytes','wall_seconds','heap_sampled_max_bytes','cgroup_sampled_max_bytes']
def stats(values):
 v=list(values)
 if not v:return None
 mean=statistics.mean(v);median=statistics.median(v)
 return dict(n=len(v),min=min(v),median=median,max=max(v),spread=max(v)-min(v),relative_spread=(max(v)-min(v))/median if median else None,coefficient_of_variation=statistics.pstdev(v)/mean if mean else None)
def features(row,names):
 geo=row['geometry'];raw=dict(row,footprints=geo['footprints'],vertices=geo['vertices'],edges=geo['edges'],vertex_density=geo['vertices_per_km2'],area=geo['area_km2'],frequency_28=float(row['frequency_ghz']==28))
 return [raw[n] if n=='frequency_28' else math.log(max(raw[n],1e-9)) if n=='area' else math.log1p(raw[n]) for n in names]
def solve(matrix,rhs):
 a=[row[:]+[b] for row,b in zip(matrix,rhs)];n=len(a)
 for i in range(n):
  pivot=max(range(i,n),key=lambda k:abs(a[k][i]));a[i],a[pivot]=a[pivot],a[i]
  if abs(a[i][i])<1e-12:raise ValueError('singular system')
  d=a[i][i];a[i]=[x/d for x in a[i]]
  for j in range(n):
   if j!=i:
    d=a[j][i];a[j]=[x-d*y for x,y in zip(a[j],a[i])]
 return [row[-1] for row in a]
def fit(rows,target,names):
 if any(r['split']!='calibration' or r['level']=='held-setting' for r in rows):raise ValueError('held-out contamination')
 x=[features(r,names) for r in rows];means=[statistics.mean(v) for v in zip(*x)];scales=[statistics.pstdev(v) or 1 for v in zip(*x)]
 x=[[1]+[(v-m)/s for v,m,s in zip(row,means,scales)] for row in x];y=[math.log(max(r[target],1e-9)) for r in rows];n=len(names)+1
 gram=[[sum(row[i]*row[j] for row in x)+(0.1 if i==j and i else 0) for j in range(n)] for i in range(n)];rhs=[sum(row[i]*v for row,v in zip(x,y)) for i in range(n)]
 return dict(features=names,means=means,scales=scales,coefficients=solve(gram,rhs),ridge=.1,target=target,training_groups=len(rows),training_domains=sorted({r['domain'] for r in rows}),formula='exp(b0 + sum(bi * (transform(feature_i)-mean_i)/scale_i)); log1p count/rays/radius, log area, binary 28GHz')
def predict(model,row):
 x=features(row,model['features']);z=model['coefficients'][0]+sum(b*(v-m)/s for b,v,m,s in zip(model['coefficients'][1:],x,model['means'],model['scales']));return math.exp(max(-40,min(z,40)))
def errors(pairs):
 if not pairs:return None
 rel=[p/a-1 for p,a in pairs if a>0];ratios=[a/p for p,a in pairs if p>0]
 return dict(n=len(pairs),zero_actual_count=sum(a==0 for p,a in pairs),median_signed_relative_error=statistics.median(rel) if rel else None,median_absolute_relative_error=statistics.median(abs(x) for x in rel) if rel else None,max_underestimation_fraction=max([0]+[-x for x in rel]),max_underestimation_actual_over_predicted=max([1]+ratios),max_overestimation_fraction=max([0]+rel),underestimate_percent=100*sum(x<0 for x in rel)/len(rel) if rel else 0,log_rmse=math.sqrt(statistics.mean(math.log(max(p,1e-9)/max(a,1e-9))**2 for p,a in pairs)))
def corr(xs,ys):
 if len(xs)<3 or statistics.pstdev(xs)==0 or statistics.pstdev(ys)==0:return None
 mx,my=statistics.mean(xs),statistics.mean(ys);return sum((x-mx)*(y-my) for x,y in zip(xs,ys))/math.sqrt(sum((x-mx)**2 for x in xs)*sum((y-my)**2 for y in ys))
def aggregate(rows):
 groups=collections.defaultdict(list)
 for r in rows:
  if r['operation'] in ISOLATED:groups[(r['profile'],r['domain'],r['frequency_ghz'],r['level'],r['operation'])].append(r)
 output=[]
 for key,rs in groups.items():
  r={k:rs[0][k] for k in ['profile','domain','band','split','frequency_ghz','level','operation','rays','radius_m','cells','geometry']}
  for name in TARGETS:
   r[name]=statistics.median(x['work'][name] if name in ['spatial_candidates','edge_intersection_checks'] else x[name] for x in rs)
  r['ray_count_affects_compute']=r['operation'] not in NON_RAY_OPERATIONS;r['rays_only_control']=r['operation'] in NON_RAY_OPERATIONS and r['level']=='rays';r['repeat_count']=len(rs);r['statistics']={name:stats([x[name] for x in rs]) for name in ['wall_seconds','cpu_seconds','response_bytes','gc_count','gc_pause_seconds','allocation_bytes','rss_sampled_max_bytes','heap_sampled_max_bytes','throttled_seconds','deadline_headroom_seconds']};r['statistics']['spatial_candidates']=stats(x['work']['spatial_candidates'] for x in rs)
  output.append(r)
 return output

def models_for(groups):
 result={}
 for op in sorted(ISOLATED):
  rows=[r for r in groups if r['profile']=='D' and r['operation']==op];train=[r for r in rows if r['split']=='calibration' and r['level']!='held-setting' and not r['rays_only_control']];hold=[r for r in rows if (r['split']=='held-out' or r['level']=='held-setting') and not r['rays_only_control']];targets={}
  for target in TARGETS:
   if not train or not hold or max(r[target] for r in train)<=0:targets[target]={'status':'not identifiable: no nonzero calibration work'};continue
   candidates=[]
   for name,all_names in MODELS.items():
    names=[n for n in all_names if n!='rays' or op not in NON_RAY_OPERATIONS]
    cv=[]
    for domain in sorted({r['domain'] for r in train}):
     fold=[r for r in train if r['domain']!=domain];m=fit(fold,target,names);cv.extend((predict(m,r),r[target]) for r in train if r['domain']==domain)
    candidates.append((errors(cv)['log_rmse'],name,errors(cv)))
   candidates.sort();_,name,cv=candidates[0];model=fit(train,target,[n for n in MODELS[name] if n!='rays' or op not in NON_RAY_OPERATIONS]);margin=cv['max_underestimation_actual_over_predicted']
   pairs=[(predict(model,r),r[target]) for r in hold];raw=errors(pairs);bounded=errors([(p*margin,a) for p,a in pairs]);domainpairs=[(predict(model,r),r[target]) for r in hold if r['split']=='held-out' and r['level']!='held-setting'];settingpairs=[(predict(model,r),r[target]) for r in hold if r['level']=='held-setting'];worst=max(hold,key=lambda r:r[target]/predict(model,r));hardware_hold=[r for r in groups if r['profile'] in ['A','B'] and r['operation']==op]
   gate=margin<=4 and bounded['underestimate_percent']<=5 and bounded['max_underestimation_fraction']<=.1
   targets[target]={'model':model,'selected_family':name,'selection':'lowest leave-one-calibration-domain-out log RMSE; ray count excluded for operations whose source never consumes it; no held-out values enter coefficients or numerical margin','calibration_cv':cv,'all_candidates_cv':{n:e for _,n,e in candidates},'held_out':raw,'held_out_domains':errors(domainpairs),'held_out_settings':errors(settingpairs),'hardware_transfer_errors':{p:errors([(predict(model,r),r[target]) for r in hardware_hold if r['profile']==p]) for p in ['A','B']},'calibration_only_margin':margin,'held_out_with_calibration_margin':bounded,'retrospective_required_held_out_margin':raw['max_underestimation_actual_over_predicted'],'study_numeric_gate_pass':gate,'worst_underprediction_case':{k:worst[k] for k in ['domain','level','frequency_ghz','operation']},'readiness':'PROMISING BUT MORE CALIBRATION' if gate else 'NOT READY'}
  result[op]=targets
 return result

def analyze(w,supplement=None):
 environment=json.loads((w/'environment.json').read_text());environment['geometry_binary_sha256']=hashlib.sha256((w.parent/'geometry.test').read_bytes()).hexdigest();environment['baseline'].update(status_short='',diff_stat='',status_captured='at task start before audit files were created');domains=json.loads((w/'domains.json').read_text());rows=[]
 for profile in ['A','B','D']:
  rows.extend(json.loads(line) for line in (w/f'runs-{profile}.jsonl').read_text().splitlines())
 for row in rows:row['measurement_stage']='main'
 supplement_metadata=None
 if supplement is not None:
  supplement_metadata=json.loads((supplement/'environment.json').read_text());supplement_metadata['geometry_binary_sha256']=hashlib.sha256((supplement.parent/'geometry.test').read_bytes()).hexdigest()
  if supplement_metadata['geometry_binary_sha256']!=environment['geometry_binary_sha256']:raise ValueError('supplement binary mismatch')
  extra_profile=json.loads((supplement/'profile-D.json').read_text());main_profile=json.loads((w/'profile-D.json').read_text())
  if extra_profile['diagnostic_fingerprint']!=main_profile['diagnostic_fingerprint']:raise ValueError('supplement profile/dataset/runtime mismatch')
  extra=[json.loads(line) for line in (supplement/'runs-D.jsonl').read_text().splitlines()]
  if len(extra)!=24 or any(x['profile']!='D' or x['split']!='held-out' or x['level']!='held-setting' or x['operation'] not in {'evaluate-maps','optimize-maps','explain','azimuth'} for x in extra):raise ValueError('invalid held-out supplement')
  for row in extra:row['measurement_stage']='held-setting-supplement'
  rows.extend(extra)
 groups=aggregate(rows);models=models_for(groups);preflight=[]
 for profile in ['A','B','D']:
  ps=json.loads((w/f'preflight-{profile}.json').read_text());pg=collections.defaultdict(list)
  for r in ps:pg[(r['domain'],r['radius'],r['cells'],r['kind'])].append(r)
  for (d,r,n,k),rs in pg.items():preflight.append(dict(profile=profile,domain=d,radius_m=r,cells=n,kind=k,footprints=rs[0]['footprints'],wall=stats(x['wall_seconds'] for x in rs),cpu=stats(x['cpu_seconds'] for x in rs),allocation=stats(x['allocation_bytes'] for x in rs)))
 effects=[]
 for profile in ['A','B','D']:
  for freq in ([2.6,28] if profile=='D' else [2.6]):
   for op in ['simulate','evaluate','optimize','interference']:
    pair=[next(r for r in groups if r['profile']==profile and r['domain']==d+'-calibration' and r['frequency_ghz']==freq and r['level']=='normal' and r['operation']==op) for d in ['sparse','dense']];s,d=pair
    effects.append(dict(profile=profile,frequency_ghz=freq,operation=op,sparse_wall=s['statistics']['wall_seconds']['median'],dense_wall=d['statistics']['wall_seconds']['median'],wall_inflation=d['statistics']['wall_seconds']['median']/s['statistics']['wall_seconds']['median'],sparse_cpu=s['cpu_seconds'],dense_cpu=d['cpu_seconds'],cpu_inflation=d['cpu_seconds']/s['cpu_seconds'],sparse_geometry=s['geometry'],dense_geometry=d['geometry']))
 hardware=[]
 for domain in ['sparse-calibration','dense-calibration']:
  for op in ['simulate','evaluate','optimize','interference']:
   rs=[next(r for r in groups if r['profile']==p and r['domain']==domain and r['frequency_ghz']==2.6 and r['level']=='normal' and r['operation']==op) for p in ['A','B','D']];hardware.append(dict(domain=domain,operation=op,A_to_B_wall_ratio=rs[0]['statistics']['wall_seconds']['median']/rs[1]['statistics']['wall_seconds']['median'],A_to_D_wall_ratio=rs[0]['statistics']['wall_seconds']['median']/rs[2]['statistics']['wall_seconds']['median'],wall_by_profile={r['profile']:r['statistics']['wall_seconds']['median'] for r in rs},cpu_by_profile={r['profile']:r['cpu_seconds'] for r in rs}))
 mixed=[]
 for profile in ['A','B','D']:
  for domain in ['sparse-calibration','dense-calibration']:
   for scenario in ['async-optimize','async-evaluate','two-optimizers','optimize-evaluate']:
    rs=[r for r in rows if r['profile']==profile and r['domain']==domain and r['operation']==scenario]
    for response_index in range(2 if scenario in ['two-optimizers','optimize-evaluate'] else 1):
     op='evaluate' if scenario=='async-evaluate' or (scenario=='optimize-evaluate' and response_index==1) else 'optimize';isolated=next(r for r in groups if r['profile']==profile and r['domain']==domain and r['operation']==op and r['frequency_ghz']==2.6 and r['level']=='normal')['statistics']['wall_seconds']['median'];times=[r['responses'][response_index]['wall_seconds'] for r in rs]
     mixed.append(dict(profile=profile,domain=domain,scenario=scenario,operation=op,response_index=response_index,isolated_median=isolated,mixed=stats(times),median_inflation=statistics.median(times)/isolated,max_inflation=max(times)/isolated,throttled_seconds=stats(r['throttled_seconds'] for r in rs),gc_count=stats(r['gc_count'] for r in rs),gc_pause=stats(r['gc_pause_seconds'] for r in rs),cgroup_peak=stats(r['cgroup_sampled_max_bytes'] for r in rs),deadline_headroom=stats(r['deadline_headroom_seconds'] for r in rs),async_overlap=stats(r['async'].get('overlap_seconds',0) for r in rs)))
 correlations={}
 for op in sorted(ISOLATED):
  rs=[r for r in groups if r['profile']=='D' and r['operation']==op];desc={name:[r['geometry'][field] for r in rs] for name,field in [('footprints','footprints'),('vertices','vertices'),('edges','edges'),('footprint_density','footprints_per_km2'),('vertex_density','vertices_per_km2'),('area','area_km2')]};desc.update({name:[r[name] for r in rs] for name in ['rays','radius_m','cells']});ys={name:[r[name] if name in TARGETS else r['statistics']['wall_seconds']['median'] for r in rs] for name in TARGETS+['wall_seconds']};correlations[op]={target:{name:(None if name=='rays' and op in NON_RAY_OPERATIONS else corr(xs,y)) for name,xs in desc.items()} for target,y in ys.items()}
 warm=[]
 keyed=collections.defaultdict(list)
 for r in rows:
  if r['operation'] in ISOLATED:keyed[(r['profile'],r['domain'],r['frequency_ghz'],r['level'],r['operation'])].append(r)
 for key,rs in keyed.items():
  if len(rs)<3:continue
  first=min(rs,key=lambda r:r['repeat']);later=[r for r in rs if r['repeat']!=first['repeat']];warm.append(dict(profile=key[0],domain=key[1],frequency_ghz=key[2],level=key[3],operation=key[4],first_wall=first['wall_seconds'],repeat_median=statistics.median(r['wall_seconds'] for r in later),first_to_repeat_ratio=first['wall_seconds']/statistics.median(r['wall_seconds'] for r in later)))
 # Classes use CPU predictions alone; bounds are set from calibration, then checked unchanged.
 class_train=[r for r in groups if r['profile']=='D' and r['split']=='calibration' and r['level']!='held-setting' and r['operation'] in ISOLATED and not r['rays_only_control']]
 cpu_predictions=sorted(predict(models[r['operation']]['cpu_seconds']['model'],r) for r in class_train);cuts=[cpu_predictions[int(q*(len(cpu_predictions)-1))] for q in [.25,.5,.75]]
 def band(r):return sum(predict(models[r['operation']]['cpu_seconds']['model'],r)>c for c in cuts)+1
 classes=[]
 for b in range(1,5):
  train=[r for r in class_train if band(r)==b];hold=[r for r in groups if r['profile']=='D' and (r['split']=='held-out' or r['level']=='held-setting') and not r['rays_only_control'] and band(r)==b];bounds={target:stats(r[target] for r in train) for target in ['cpu_seconds','rss_sampled_max_bytes','response_bytes']};classes.append(dict(band=b,training_bounds=bounds,held_out_bounds={target:stats(r[target] for r in hold) for target in bounds},exceeds_training_max={target:sum(r[target]>bounds[target]['max'] for r in hold) for target in bounds}))
 joint_class_bounds=all(all(n==0 for n in c['exceeds_training_max'].values()) for c in classes)
 adjacent_overlap={target:[max(0,min(classes[i]['training_bounds'][target]['max'],classes[i+1]['training_bounds'][target]['max'])-max(classes[i]['training_bounds'][target]['min'],classes[i+1]['training_bounds'][target]['min'])) for i in range(3)] for target in ['cpu_seconds','rss_sampled_max_bytes','response_bytes']}
 class_rejected=not joint_class_bounds or any(any(x>0 for x in adjacent_overlap[target]) for target in ['rss_sampled_max_bytes','response_bytes'])
 hashes=collections.defaultdict(set)
 for r in rows:
  if r['operation'] in ['simulate','evaluate','optimize','interference'] and r['level']=='normal':hashes[(r['domain'],r['frequency_ghz'],r['operation'])].add(tuple(x['sha256'] for x in r['responses']))
 mixed_hash_matches=[]
 for row in rows:
  if row['operation'] in ISOLATED:continue
  for response in row['responses']:
   op={'/api/optimize-network':'optimize','/api/evaluate-network':'evaluate'}.get(response['endpoint'])
   if op and response['response_bytes']>0:
    expected=hashes[(row['domain'],row['frequency_ghz'],op)];mixed_hash_matches.append((response['sha256'],) in expected)
 pauses=[r['gc_pause_seconds']/r['wall_seconds'] for r in rows if r['wall_seconds']>0];throttle=[r for r in rows if r['throttled_periods']>0]
 variance=[]
 for profile in ['A','B','D']:
  isolated=[r for r in rows if r['profile']==profile and r['operation'] in ISOLATED]
  normalized=[]
  for row in isolated:
   key=(row['profile'],row['domain'],row['frequency_ghz'],row['level'],row['operation']);median=statistics.median(r['wall_seconds'] for r in keyed[key]);normalized.append(row['wall_seconds']/median)
  variance.append(dict(profile=profile,within_group_wall_inflation=stats(normalized),normalized_wall_vs_gc_pause_correlation=corr(normalized,[r['gc_pause_seconds'] for r in isolated]),normalized_wall_vs_gc_count_correlation=corr(normalized,[r['gc_count'] for r in isolated]),normalized_wall_vs_throttled_time_correlation=corr(normalized,[r['throttled_seconds'] for r in isolated]),worst_isolated_rows=[{k:r[k] for k in ['domain','operation','frequency_ghz','level','repeat','wall_seconds','cpu_seconds','gc_count','gc_pause_seconds','throttled_seconds','throttled_periods','allocation_bytes','heap_before_bytes','heap_after_bytes']} for r in sorted(isolated,key=lambda r:r['wall_seconds']/statistics.median(x['wall_seconds'] for x in keyed[(r['profile'],r['domain'],r['frequency_ghz'],r['level'],r['operation'])]),reverse=True)[:10]]))
 summary={'run_count':len(rows),'isolated_group_count':len(groups),'mixed_run_count':sum(r['operation'] not in ISOLATED and r['operation']!='cancel' for r in rows),'canonical_repeats':'5 for ordinary operations; 3 for optimize, optimize+maps, explain, recommendation; variants and mixed scenarios 3; every important case repeats','all_rf_statuses_200':all(x['status']==200 for r in rows if r['operation']!='cancel' for x in r['responses']),'minimum_request_deadline_headroom':min(r['deadline_headroom_seconds'] for r in rows),'maximum_sampled_rss_bytes':max(r['rss_sampled_max_bytes'] for r in rows),'maximum_sampled_cgroup_bytes':max(r['cgroup_sampled_max_bytes'] for r in rows),'maximum_gc_pause_fraction_of_wall':max(pauses),'gc_events':sum(r['gc_count'] for r in rows),'rows_with_throttling':len(throttle),'scientific_response_hashes_stable_for_repeats_and_profiles':all(len(x)==1 for x in hashes.values()),'hash_group_count':len(hashes),'mixed_and_cancel_followup_scientific_hashes_match_isolated':all(mixed_hash_matches),'mixed_hash_comparisons':len(mixed_hash_matches),'worst_cpu_heldout_underprediction_factor':max(m['cpu_seconds']['held_out']['max_underestimation_actual_over_predicted'] for m in models.values()),'worst_response_heldout_underprediction_factor':max(m['response_bytes']['held_out']['max_underestimation_actual_over_predicted'] for m in models.values()),'cost_bands_rejected':class_rejected,'production_admission_estimator_ready':False}
 return {'schema_version':1,'study':'Geometry Density & Mixed-Load Envelope','certification':'development VM exploratory audit; no production capacity/admission guarantee','environment':environment,'supplement_environment':supplement_metadata,'profiles':{p:json.loads((w/f'profile-{p}.json').read_text()) for p in ['A','B','D']},'domain_selection':domains,'summary':summary,'methodology':{'rf':'normal 120 rays/400m/30dBm/120deg at 2.6 and 28GHz; rays 240/400m; radius 120/800m; fully held setting 180/600m','matrix':'D: all eight domains, both frequencies, eleven operations; variants at sparse/dense train+holdout 2.6GHz; A/B: sparse+dense train at 2.6GHz six core operations; mixed four scenarios sparse+dense at 2.6GHz on all profiles; no 8CPU rerun','omissions':'A/B 28GHz and medium/very-dense; variants at28GHz; moderate fit variants for azimuth/explain and maps (only held180/600 tested in a fresh24-case D supplement); only one real dataset; no cold OS page-cache eviction, full queue/cache retention, browser/network or exclusive deployment host; no synthetic controls','supplement':'24 fresh-process D cases complete held180-ray/600m coverage for Evaluate+maps/Optimize+maps/Explain/Azimuth on sparse+dense held-out domains, three repeats; same binary, Auto fingerprint and data; calibration coefficients/margins unchanged. Stage is explicit in every raw row; separate process/reset can affect GC/cache state.', 'feature_audit':'Interference/Surface/Building Entry do not consume request ray count. Ray-only cases are unchanged-compute controls and excluded from model fitting/scoring; held-setting still changes radius to an unfitted600m. Source-based feature correction occurred after partial held-out results were inspected; treat all held-out conclusions as exploratory, require a fresh locked validation before design. No held-out value enters automated selection/fitting/margins.', 'cache':'preflight stage loads a pack, then RF stage reloads the same pack in the same process; each RF request sees its fully loaded index and preceding domain scan; old stage heap may await GC; no forced GC/FreeOSMemory/GOGC change; request-local caches remain unchanged; first measured case compared to subsequent repeats, not cold-start RF; completed experiment cache/jobs reset consistently before each async case to guarantee uncached16-run work; frontend absent','sampling':'50ms RSS/cgroup/heap/slots sampling plus before/after, runtime allocation/GC deltas, getrusage processCPU, cgroupCPU/throttle. Instrumented httptest recorder includes extra buffering and response copies. Lifetime peak includes dataset startup and all prior cases; samples can miss transients. No per-interactive CPU attribution under concurrency','preflight':'single conservative enclosing bbox of relevant tower radii +2m padding, full intersecting footprint outer rings; recommendation adds every inventory candidate in search polygon before caps; count overestimates circle union/gaps; building-entry still scans global footprint inventory, beyond local preflight descriptors','safety_gate':'Predeclared study-only: calibration leave-domain-out margin <=4; held-out underestimates <=5%, worst shortfall<=10%. Selected by training logRMSE. Retrospective held-out margins describe this sample only; no retuning. Four independent held-out locations insufficient for admission certification.'},'isolated_groups':groups,'geometry_effects':effects,'hardware_effects':hardware,'mixed_load':mixed,'preflight':preflight,'models':models,'variance':variance,'correlations':correlations,'warm_run_comparisons':warm,'cost_classes':{'cpu_prediction_quartile_cutoffs_seconds':cuts,'classes':classes,'adjacent_training_range_overlap':adjacent_overlap,'all_heldout_targets_within_training_maxima':joint_class_bounds,'decision':'reject joint cost bands: CPU bins do not bound memory/response and held-out maxima can exceed training bounds; descriptive internal experiment only'},'readiness':{'safe_concurrency':'NOT READY','compute_reservation':'PROMISING BUT MORE CALIBRATION' if any(v['cpu_seconds'].get('study_numeric_gate_pass') for v in models.values()) else 'NOT READY','memory_reservation':'NOT READY','response_reservation':'PROMISING BUT MORE CALIBRATION','async_workers':'NOT READY'},'dataset_search':{'real_installed_packs':['data-pipeline/manifest.json'],'other_manifest':'backend-go/raytracer/testdata/sample-pack/manifest.json is a synthetic test fixture, not a legitimate deployment dataset; documentation acquisition manifests are optional layer/source audits','cross_dataset_predictive_value':'not identifiable: global counts constant across one real dataset','synthetic_controls':'not used; actual production-pack domains provide observed geometry range'},'freeze':'freeze audit evidence and reusable test-only tooling; keep foundation observation-only; no estimator certified','eight_cell_evidence':{'source':'docs/network-size-capacity-audit.md','six_cell_optimizer_median_seconds_2_6_ghz':5.886,'eight_cell_optimizer_single_seconds_2_6_ghz':8.374,'six_cell_optimizer_median_seconds_28_ghz':5.745,'eight_cell_optimizer_single_seconds_28_ghz':8.249,'eight_cell_repeat_workflow_attempts':19,'remaining_attempts':1,'finding':'eight-cell demand is plausibly parameterizable, but prior eight timings have one primary sample and budget headroom is only one attempt; this six-cell estimator audit neither certifies nor recommends cap increase'},'next_action':'Run a predeclared estimator validation on additional disjoint deployment-target domains and RF/search settings, with actual HTTP streaming and sustained async overlap, using calibration-only margins unchanged.','raw_runs':rows}

if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--workdir',default='/tmp/atom-resource-geometry');p.add_argument('--supplement-workdir');p.add_argument('--output',default=str(ROOT/'docs/auto-resource-geometry-calibration.json'));a=p.parse_args();report=analyze(pathlib.Path(a.workdir)/'geometry',pathlib.Path(a.supplement_workdir)/'geometry' if a.supplement_workdir else None);pathlib.Path(a.output).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['summary'],indent=2))
