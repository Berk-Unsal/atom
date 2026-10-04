#!/usr/bin/env python3
"""Assemble observed costs and explicitly offline policy models; no policy mutations."""
import json, pathlib, platform, subprocess, math, statistics, hashlib, re
ROOT=pathlib.Path(__file__).resolve().parents[2];W=pathlib.Path('/tmp/atom-rf-policy')
records=[json.loads(p.read_text()) for p in sorted((W/'raw').glob('*-endpoints.json'))]
workflows=[json.loads(p.read_text()) for p in sorted((W/'raw').glob('*-workflows.json'))]
concurrency=[json.loads(p.read_text()) for p in sorted((W/'raw').glob('*-concurrent.json'))]
abuse=json.loads((W/'raw/6-2.6-abuse.json').read_text())
endpoint_rows=[r for x in records for r in x['rows']]
# Integer examples calibrated AFTER measurement. A token is 100 measured CPU ms.
weights={ep:max(1,math.ceil(max(r['cpu_seconds'] for r in endpoint_rows if r['label']==ep)/.1)) for ep in sorted({r['label'] for r in endpoint_rows})}
# Map costs need all cells, not just the first representative cell.
# Per-map upper sample is taken from the earlier capacity ledger with identical RF source,
# Current per-cell measurements below are authoritative for this audit.
maps=[]
for p in sorted((W/'raw').glob('*-map-costs.json')):maps+=json.loads(p.read_text())['rows']
if maps:weights['/api/simulate']=max(weights['/api/simulate'],max(math.ceil(r['cpu_seconds']/.1) for r in maps))
def sequence(n,kind):
 e=['/api/evaluate-network']+['/api/simulate']*n
 o=['/api/optimize-network']+['/api/simulate']*n
 return {'A':e,'B':e+['/api/interference'],'C':e+['/api/interference']+e,'D':o,'E':e,'D_explain':o+['/api/explain-network-cell'],'gate_paid_action':e+['/api/interference']+e+['/api/explain-network-cell','/api/simulate']}[kind]
fixed=[]
for limit in [20,24,30,40]:
 for n in [6,8,9]:
  c=2*n+3;fixed.append({'limit':limit,'cells':n,'C_attempts':c,'C_remaining':limit-c,'gate_paid_action_attempts':c+2,'gate_remaining':limit-c-2,'two_C_shared_IP_remaining':limit-2*c,'two_Evaluate_shared_IP_remaining':limit-2*(n+1),'resource_allowance_multiplier':limit/20})
weighted=[]
for n in [6,8]:
 for kind in ['A','B','C','D','E','D_explain','gate_paid_action']:
  seq=sequence(n,kind);weighted.append({'cells':n,'workflow':kind,'attempts':len(seq),'CPU100ms_integer_units':sum(weights[x] for x in seq)})
# Non-deployment calibration example: smallest capacity that fits ONE measured eight-cell
# heavy workflow plus explanation AND the conservative paid-action gate.
illustrative_capacity=max(r['CPU100ms_integer_units'] for r in weighted if r['cells']==8)
for r in weighted:r['illustrative_remaining']=illustrative_capacity-r['CPU100ms_integer_units']
ratios=[]
for n in [6,8]:
 for frequency in [2.6,28]:
  subset=[r for r in endpoint_rows if r['n']==n and r['frequency_ghz']==frequency]
  get=lambda ep:next(r for r in subset if r['label']=='/api/'+ep)
  for a,b in [('optimize-network','interference'),('optimize-network','simulate'),('evaluate-network','simulate'),('simulate','sub-thz-material-reference'),('recommend-sites','optimize-network'),('explain-network-cell','simulate')]:
   x,y=get(a),get(b);ratios.append({'cells':n,'frequency_ghz':frequency,'numerator':a,'denominator':b,'wall_ratio':x['wall_seconds']/y['wall_seconds'],'cpu_ratio':x['cpu_seconds']/y['cpu_seconds'],'spatial_query_ratio':x['work']['spatial_queries']/y['work']['spatial_queries'] if y['work']['spatial_queries'] else None,'response_size_ratio':x['response_bytes']/y['response_bytes']})
tracked=subprocess.check_output(['git','ls-files'],cwd=ROOT,text=True).splitlines()
hashes={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in tracked if p.startswith(('backend-go/','frontend-react/src/'))}
class_groups={'heavy':['/api/evaluate-network','/api/optimize-network','/api/optimize-azimuth','/api/recommend-sites'],'map':['/api/simulate','/api/analyze-sector','/api/coverage-surface','/api/interference']}
classes=[]
for n in [6,8]:
 for kind in ['A','B','C','D','D_explain','gate_paid_action']:
  counts={c:0 for c in ['heavy','map','diagnostic']}
  for ep in sequence(n,kind): counts[next((c for c,eps in class_groups.items() if ep in eps),'diagnostic')]+=1
  classes.append({'n':n,'workflow':kind,'class_attempts':counts,'illustrative_remaining':{c:20-v for c,v in counts.items()},'aggregate_attempts':sum(counts.values())})
ledger={'audit_date' :'2026-10-04','timezone':'Europe/Istanbul','baseline':{'branch':'main','head':'c48ef63c9ce064a72058e2b72c3cd095c7deb904','version':'0.11.0','git_status':'clean','git_diff_stat':'empty'},'host':{'platform':platform.platform(),'go':records[0]['go_version'],'logical_cpus':records[0]['logical_cpus'],'gomaxprocs':records[0]['gomaxprocs'],'memory_bytes':int(subprocess.check_output(['sysctl','-n','hw.memsize'])),'processor':subprocess.check_output(['sysctl','-n','machdep.cpu.brand_string'],text=True).strip()},'measurement_method':{'copy_only_instrumentation':True,'supported_production_cell_cap':6,'isolated_copy_cell_cap':8,'real_buildings':records[0]['dataset_buildings'],'rss_sample_ms':200,'heap_goroutine_sample_ms':50,'cpu':'getrusage user + system for whole process; sampler overhead included','wall':'handler plus JSON encoding and recorder writes, dataset loading and pre-request GC excluded','experiment':'includes asynchronous job completion except cached-experiment; POST response only is in responses','clock':'frozen fresh window for deterministic workflow/semantics; real time for bounded abuse','heap':'FreeOSMemory before each sample; recorder buffers and response copies included; sampled maxima not exact peaks','rays':120,'radius_m':400,'frequency_ghz':[2.6,28],'samples_per_endpoint_per_case':1,'weights_not_production_values':True},'endpoint_measurements':records,'per_cell_map_measurements':maps,'workflow_measurements':workflows,'concurrent_measurements':concurrency,'shared_workflow_measurements':[json.loads(p.read_text()) for p in sorted((W/'raw').glob('*-shared-workflows.json'))],'browser_parse':json.loads((W/'browser-parse.json').read_text()),'abuse_measurements':abuse,'semantics':json.loads((W/'semantics.json').read_text()),'cost_ratio_matrix':ratios,'alternate_models':{'fixed_limits':fixed,'weighted_CPU100ms':{'weights':weights,'illustrative_capacity':illustrative_capacity,'capacity_derivation':'minimum integer envelope fitting all modeled eight-cell single workflows; UX calibration ONLY, not a safe server budget','workflows':weighted},'logical_workflow':{'C_units':3,'conservative_gate_units':5,'evaluate_reserved_HTTP_attempts':'N+1','optimizer_reserved_HTTP_attempts':'N+1','resource_warning':'A unit can contain N simulations or many optimizer proposals; no free/unbounded follow-ups are justified.'},'separate_classes':{'illustrative_limits_per_class':{'heavy':20,'map':20,'diagnostic':20},'class_model':classes,'heavy':['evaluate-network','optimize-network','optimize-azimuth','recommend-sites'],'map':['simulate','analyze-sector','coverage-surface','interference'],'diagnostic':['path-profile','sub-thz-material-reference'],'warning':'Endpoint classes overlap in RF and payload costs; shared aggregate envelope still needed.'},'general_cost_tokens':{'fixed_measured_envelopes':[{'limit':L,'CPU_seconds':L*max(r['cpu_seconds'] for r in endpoint_rows),'spatial_queries':L*max(r['work']['spatial_queries'] for r in endpoint_rows),'response_bytes':L*max(r['response_bytes'] for r in endpoint_rows)} for L in [20,24,30,40]],'CPU_seconds_by_workflow':[{'n':r['n'],'frequency_ghz':r['frequency_ghz'],'label':r['label'],'cpu_seconds':r['cpu_seconds'],'response_bytes':r['response_bytes']} for x in workflows for r in x['rows']],'illustrative_fractional_CPU_capacity_seconds':max(r['cpu_seconds'] for x in workflows for r in x['rows'] if r['n']==8),'illustrative_bandwidth_gate_bytes':max(r['response_bytes'] for x in workflows for r in x['rows'] if r['n']==8 and r['label'].startswith('C-'))+max(r['response_bytes'] for r in maps if r['label'].startswith('map-cell'))+max(r['response_bytes'] for r in endpoint_rows if r['label']=='/api/explain-network-cell'),'rate_or_capacity_recommended':None}},'production_source_sha256':hashes,'validation':{'backend_go_test':'pass','backend_go_test_race':'pass','backend_go_vet':'pass','frontend_tests':'423 passed in 68 files','frontend_lint':'pass','frontend_build':'pass with chunk-size warning','real_backend_optimizer_e2e':'pass','real_backend_budget_e2e':'pass in isolated fresh-server run','combined_browser_run':'budget test failed because previous optimizer spent one shared-IP unit; corrected invocation isolates server, test unchanged','native_full_pack_measurements':'all endpoint/workflow/concurrency/map/shared-key/abuse/semantics cases passed','isolated_audit_race_semantics':'pass','extra_full_pack_eight_concurrent_race':'FAILED: both requests returned 504 at unchanged 60-second deadline; no data race reported; native metrics retained separately','docs_build':'pass','docs_validation':'47 HTML pages and 41 API paths; audit virtualenv supplies PyYAML','version_check':'pass 0.11.0','git_diff_check':'pass','tracked_production_diff':'empty'},'recommendation':{'direction':'Keep current 20-attempt policy unchanged pending deployment-calibrated resource admission study.','numeric_production_change':None,'root_cause':'E: multiple (B HTTP units, C follow-up shape, D IP sharing; A arithmetic only for a defined expanded workflow)','next_action':'Run a bounded deployment-calibrated admission study for prepaid CPU/geometry and response-cost envelopes, including asynchronous experiments and server-verified workflow reservations.'},'limitations':['Single native host, one cold measurement per endpoint/case; not a percentile/SLA or deployment saturation certification.','Normal/default fixture cost does not bound maximum rays, radius, measurement count, surface resolution, experiment matrix, or optional optimizer search.','OS RSS includes index, Go retained pages and recorder buffers; concurrent process CPU cannot be assigned to each request.','Control clocks make deterministic workflow accounting; abuse uses real clocks and may cross windows.','No authenticated per-user identity; alternative accounting alone cannot separate NAT peers.']}
protected=sorted(set(re.findall(r'"(/api/[^"]+)":',(ROOT/'backend-go/rf_protection.go').read_text().split('type rfClientState')[0])))
assert set(protected)=={r['label'] for r in endpoint_rows if r['label'].startswith('/api/')}
ledger['production_invariance']={'protected_routes':protected,'all_19_measured':len(protected)==19,'tracked_production_diff_empty':subprocess.check_output(['git','diff','--name-only'],cwd=ROOT,text=True).strip()=='','request_limit':20,'window_seconds':60,'key':'Gin ClientIP','global_concurrency':2,'per_client_concurrency':1,'computation_deadline_seconds':60,'cell_cap':6,'fixed_window_short_straddling_burst':39,'two_window_total_including_priming':40}
(ROOT/'docs/rf-request-budget-policy-measurements.json').write_text(json.dumps(ledger,indent=2)+'\n')
print('wrote measurements',len(endpoint_rows),'endpoint rows',len(maps),'map rows')
