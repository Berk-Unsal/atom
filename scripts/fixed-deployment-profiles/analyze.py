#!/usr/bin/env python3
"""Score immutable empirical outcomes. No fitting or admission implementation."""
import collections,datetime,gzip,json,pathlib,statistics,subprocess
from supplement_input_audit import verify_supplement
from protocol import HERE,ROOT,WORK,load,sha,verify,lines,assert_mixed_references,eligible
SUP=pathlib.Path('/tmp/atom-resource-fixed-explanation/geometry')
SURF=pathlib.Path('/tmp/atom-resource-fixed-surface/geometry')
SCI=pathlib.Path('/tmp/atom-resource-fixed-science/geometry')
def directory(label):return SCI if '-science-' in label else SURF if '-surface-valid-' in label else SUP if '-workflow-' in label else WORK/'geometry'

def stamp(v):return datetime.datetime.fromisoformat(v.replace('Z','+00:00'))
def request_elapsed(response):
 """Conservative elapsed evidence; never discard a longer recorded clock interval."""
 elapsed=response['wall_seconds']
 if response.get('start') and response.get('end'):elapsed=max(elapsed,(stamp(response['end'])-stamp(response['start'])).total_seconds())
 return elapsed

def clock_audit(rows):
 result=[]
 for row in rows:
  for response in row['responses']:
   if not response.get('start') or not response.get('end'):continue
   timestamp=(stamp(response['end'])-stamp(response['start'])).total_seconds()
   if abs(timestamp-response['wall_seconds'])>1:
    result.append({'batch':row['batch'],'plan_index':row['plan_index'],'profile':row['profile_id'],'level':row['level'],'operation':row['operation'],'endpoint':response['endpoint'],'status':response['status'],'start':response['start'],'end':response['end'],'monotonic_request_seconds':response['wall_seconds'],'timestamp_interval_seconds':timestamp,'cpu_seconds':row['cpu_seconds'],'interpretation':'Clock discontinuity consistent with VM pause or clock interruption; cause not independently verified. Retained observation cannot support positive headroom. No replacement repeat.'})
 return result

def archive(p):
 out=HERE/'evidence';out.mkdir(exist_ok=True);target=out/(p.name+'.gz');payload=gzip.compress(p.read_bytes(),mtime=0)
 if target.exists() and target.read_bytes()!=payload:raise ValueError('refuse replacement of archived evidence')
 if not target.exists():target.write_bytes(payload)
 return {'path':str(target.relative_to(ROOT)),'sha256':sha(target),'uncompressed_sha256':sha(p)}

def summary(rows):
 responses=[p for r in rows for p in r['responses'] if r['operation']!='cancel']
 if not rows:return {'n':0}
 return {'n':len(rows),'http_responses':len(responses),'http_failures':sum(r['status']!=200 for r in responses),'max_request_seconds':max([request_elapsed(r) for r in responses]+[0]),'max_monotonic_request_seconds':max([r['wall_seconds'] for r in responses]+[0]),'median_group_seconds':statistics.median(r['wall_seconds'] for r in rows),'max_group_seconds':max(r['wall_seconds'] for r in rows),'minimum_deadline_headroom_seconds':60-max([request_elapsed(r) for r in responses]+[0]),'peak_rss_bytes':max(r['rss_sampled_max_bytes'] for r in rows),'peak_cgroup_bytes':max(r['cgroup_lifetime_peak_bytes'] for r in rows),'peak_heap_bytes':max(r['heap_sampled_max_bytes'] for r in rows),'max_response_bytes':max([r['response_bytes'] for r in responses]+[0]),'max_workflow_bytes':max(r['response_bytes'] for r in rows),'cpu_seconds':sum(r['cpu_seconds'] for r in rows),'cgroup_cpu_seconds':sum(r['cgroup_cpu_seconds'] for r in rows),'throttle_seconds':sum(r['throttled_seconds'] for r in rows),'throttled_periods':sum(r['throttled_periods'] for r in rows),'periods':sum(r['periods'] for r in rows),'max_oom_events':max(r['memory_events'].get('oom',0) for r in rows),'max_oom_kill_events':max(r['memory_events'].get('oom_kill',0) for r in rows),'max_memory_max_events':max(r['memory_events'].get('max',0) for r in rows)}

def numerical_pass(row,limit,gates):
 responses=row['responses'][1:] if row['operation']=='cancel' else row['responses']
 return (bool(responses) and all(r['status']==200 and r['server_done'] and request_elapsed(r)<=gates['request_wall_max_seconds'] for r in responses)
 and (limit is None or row['cgroup_lifetime_peak_bytes']<=limit*gates['memory_peak_max_fraction_of_hard_limit'])
 and row['memory_events'].get('oom',0)==0 and row['memory_events'].get('oom_kill',0)==0 and row['memory_events'].get('max',0)==0
 and row.get('slots_after',1)==0 and row.get('active_clients_after',1)==0)

def async_failure_reasons(row,data,gates):
 if not data:return ['missing async evidence']
 reasons=[]
 if not data['initial_active']:reasons.append('no actual initial worker activity')
 if data['submission_failures']!=0:reasons.append('background submission failed')
 jobs=data['jobs'];responses=row['responses']
 if any(j['cache_hit'] for j in jobs):reasons.append('background cache hit')
 if any(j['status']=='failed' for j in jobs):reasons.append('background job failed')
 for i,response in enumerate(responses):
  a,b=stamp(response['start']),stamp(response['end'])
  overlap=any(a<=stamp(sample['at'])<=b and sample['active']==1 for sample in data['samples'])
  for job in jobs:
   if job.get('started_at') and job['completed_runs']>0:
    lo=stamp(job['started_at']);hi=stamp(job['finished_at']) if job.get('finished_at') else stamp(data['finished_at'])
    overlap=overlap or min(b,hi)>max(a,lo)
  if not overlap:reasons.append(f'no actual background overlap for response index {i}, start {response["start"]}')
 if data['sustained']:
  samples=[sample for sample in data['samples'] if sample['elapsed_seconds']<=30]
  if data['duration_seconds']<30:reasons.append('sustained duration below30seconds')
  if not samples or sum(sample['active']==1 for sample in samples)/len(samples)<.95:reasons.append('active worker samples below95percent during first30seconds')
 return reasons

def async_pass(row,data,gates):return not async_failure_reasons(row,data,gates)

def cancellation_pass(row,gates):
 if row['operation']!='cancel':return False
 first=row['responses'][0]
 return (first['status']==0 and first['server_done'] and request_elapsed(first)<1 and first['release_seconds']<=gates['cancellation_release_max_seconds'] and row['cancel_client_attempts']==2 and row['slots_after']==0 and row['active_clients_after']==0 and all(p['status']==200 for p in row['responses'][1:]))

def concurrent_overlap(row):
 rs=row['responses']
 return len(rs)==2 and min(stamp(r['end']) for r in rs)>max(stamp(r['start']) for r in rs)

def scientific_comparison(primary, supplemental, supplement_complete):
 raw=collections.defaultdict(set); hashes=collections.defaultdict(set); profiles=collections.defaultdict(set)
 expected=collections.Counter(); observed=collections.Counter(); valid=True
 endpoint='/api/building-entry-analysis'
 for row in primary:
  for response in row['responses']:
   if response['status']!=200:continue
   key=(response['endpoint'],response['request_sha256']);raw[key].add(response['sha256'])
   if key[0]==endpoint:
    if row['profile_id'] in ['A','B','C']:expected[(row['profile_id'],key)]+=1
   else:hashes[key].add(response['sha256']);profiles[key].add(row['profile_id'])
 for row in supplemental:
  for response in row['responses']:
   key=(response['endpoint'],response['request_sha256']);canonical=response.get('scientific_sha256')
   valid=valid and key[0]==endpoint and response['status']==200 and response['server_done'] and isinstance(canonical,str) and len(canonical)==64
   if canonical:
    hashes[key].add(canonical);profiles[key].add(row['profile_id']);observed[(row['profile_id'],key)]+=1
 coverage=bool(expected) and expected==observed and supplement_complete and valid
 unstable=[{'endpoint':k[0],'request_sha256':k[1],'hashes':sorted(v)} for k,v in hashes.items() if len(v)>1]
 return {'stable':coverage and not unstable,'request_groups':len(hashes),'groups_compared_across_profiles':sum(len(v)>=2 for v in profiles.values()),'unstable_groups':unstable,'building_entry_coverage_complete':coverage,'building_entry_expected_responses':sum(expected.values()),'building_entry_observed_responses':sum(observed.values()),'raw_response_hash_stability':{'stable':all(len(v)==1 for v in raw.values()),'unstable_groups':[{'endpoint':k[0],'request_sha256':k[1],'hashes':sorted(v)} for k,v in raw.items() if len(v)>1]},'method':'Exact endpoint/request SHA256 groups. Primary raw hashes for deterministic responses; separately preregistered complete Building Entry JSON hashes remove only diagnostics.elapsed_ms, retaining all scientific fields, numeric values, arrays, fingerprints and other diagnostics. Raw hashes remain preserved. Science-only supplement resource measurements excluded from performance gates.'}

def analyze():
 supplementCopies={kind:verify_supplement(kind,'after') for kind in ['workflow','surface','science']}
 lock=verify();G=WORK/'geometry';plans=load(HERE/'run-plans.json');supp=load(HERE/'workflow-supplement-lock.json');gates=lock['gates'];surface=load(HERE/'surface-supplement-lock.json');science=load(HERE/'science-supplement-lock.json');allPlans=plans|supp['plans']|surface['plans']|science['plans']
 if sha(HERE/'science-supplement-lock.json')!=(HERE/'science-supplement-lock.sha256').read_text().split()[0]:raise ValueError('science supplement lock changed')
 if sha(HERE/'surface-supplement-lock.json')!=(HERE/'surface-supplement-lock.sha256').read_text().split()[0]:raise ValueError('surface supplement lock changed')
 if sha(HERE/'workflow-supplement-lock.json')!=(HERE/'workflow-supplement-lock.sha256').read_text().split()[0]:raise ValueError('supplement lock changed')
 rowsByBatch={};completion={};envs={'science':load(SCI/'environment.json') if (SCI/'environment.json').exists() else {'batches':{}},'main':load(G/'environment.json'),'workflow':load(SUP/'environment.json') if (SUP/'environment.json').exists() else {'batches':{}},'surface':load(SURF/'environment.json') if (SURF/'environment.json').exists() else {'batches':{}}};asyncData={};evidence=[];autos={};violations=[]
 for label,cases in allPlans.items():
  folder=directory(label);rows=lines(folder/f'runs-{label}.jsonl');rowsByBatch[label]=rows
  meta=envs['science' if '-science-' in label else 'surface' if '-surface-valid-' in label else 'workflow' if '-workflow-' in label else 'main']['batches'].get(label)
  completion[label]={'planned':len(cases),'observed':len(rows),'complete':len(rows)==len(cases) and meta is not None and meta.get('wrapper_exit')==0 and meta.get('auto_valid') is True,'container':meta}
  for i,row in enumerate(rows):
   if i>=len(cases) or row['plan_index']!=i or row['lock_sha256']!=sha(HERE/'certification-lock.json'):violations.append(label+' ledger provenance')
   else:
    case=cases[i]
    if row['operation']!=case['operation'] or row['repeat']!=case['repeat']:violations.append(label+' plan order mismatch')
  p=folder/f'profile-{label}.json'
  if p.exists():autos[label]=load(p)
  for p in folder.glob(f'async-{label}-*.json'):
   data=load(p);asyncData[(label,int(p.stem.rsplit('-',1)[1]))]=data
  for stem in ['runs-','log-','profile-','startup-']:
   p=folder/(stem+label+('.jsonl' if stem=='runs-' else '.txt' if stem=='log-' else '.json'))
   if p.exists():evidence.append(archive(p))
  for p in folder.glob(f'async-{label}-*.json'):evidence.append(archive(p))
 for profile in ['A','B','C']:
  try:assert_mixed_references(plans,rowsByBatch,profile)
  except ValueError as e:violations.append(str(e))
 allRows=[dict(r,batch=label,profile_id=label.split('-')[0],validation_negative_control=r['level']=='W3' and r['operation']=='surface' and '-surface-valid-' not in label) for label,rr in rowsByBatch.items() for r in rr]
 rows=[r for r in allRows if '-science-' not in r['batch']]
 scienceRows=[r for r in allRows if '-science-' in r['batch']]
 scientific=scientific_comparison(rows,scienceRows,all(completion[k]['complete'] for k in science['plans']))
 negative_controls=[r for r in rows if r['validation_negative_control']]
 negative_control_ok=len(negative_controls)==42 and all(len(r['responses'])==1 and r['responses'][0]['status']==422 for r in negative_controls)
 if not negative_control_ok:violations.append('Frozen Surface negative-control annotation expected422; actual production validator returns400 for cell_size_m5 below10m minimum. Original expectation and observations retained; no qualification forced.')

 baseline=collections.defaultdict(list)
 for label,rr in rowsByBatch.items():
  if '-single-' not in label:continue
  for r in rr:
   if r['operation'] in ['evaluate','optimize']:
    fixture=allPlans[label][r['plan_index']]['fixture']
    for response in r['responses']:baseline[(label.split('-')[0],fixture,response['endpoint'])].append(request_elapsed(response))
 inflations=[]
 for label,rr in rowsByBatch.items():
  if '-mixed-' not in label:continue
  for row in rr:
   fixture=allPlans[label][row['plan_index']]['fixture']
   for response in row['responses']:
    key=(label.split('-')[0],fixture,response['endpoint']);refs=baseline.get(key,[])
    if len(refs)<5:continue
    ref=statistics.median(refs)
    inflations.append({'profile':key[0],'domain':row['domain'],'frequency_ghz':row['frequency_ghz'],'scenario':row['operation'],'endpoint':response['endpoint'],'mixed_wall_seconds':request_elapsed(response),'isolated_median_seconds':ref,'ratio':request_elapsed(response)/ref,'repeat':row['repeat']})
 profiles={};matrix={}
 for profile in ['A','B','C','D']:
  pr=[r for r in rows if r['profile_id']==profile];limit=lock['profiles'][profile]['memory_gib'];limit=limit*(1<<30) if limit else None
  profileLabels=[k for k in allPlans if k.startswith(profile+'-')]
  complete=all(completion[k]['complete'] for k in profileLabels)
  def group(predicate):return [r for r in pr if predicate(r)]
  def passes(rr,labels,extra=lambda r:True):
   return bool(rr) and all(completion[k]['complete'] for k in labels) and all(numerical_pass(r,limit,gates) and extra(r) for r in rr) and scientific['stable'] and not violations
  singles=[k for k in profileLabels if '-single-' in k];mixes=[k for k in profileLabels if '-mixed-' in k];workflows=[k for k in profileLabels if '-workflow-' in k]
  w1=group(lambda r:r['level']=='W1' and ('-single-' in r['batch'] or '-workflow-' in r['batch']));w2=group(lambda r:r['level'] in ['W2','W2-alt'] and '-single-' in r['batch']);w3=group(lambda r:r['level']=='W3' and not r['validation_negative_control'])
  concur=group(lambda r:r['operation'] in ['two-optimizers','optimize-evaluate','two-evaluates']);normal=group(lambda r:r['operation'].startswith('async-'));sustain=group(lambda r:r['operation'].startswith('sustained-'));cancel=group(lambda r:r['operation']=='cancel');fresh=group(lambda r:'-fresh-' in r['batch'])
  asyncExtra=lambda r:async_pass(r,asyncData.get((r['batch'],r['plan_index'])),gates)
  singleOK=passes(w1,singles+workflows)
  concurrentOK=passes(concur,mixes,concurrent_overlap)
  asyncOK=passes(normal+sustain,mixes,asyncExtra)
  w2OK=passes(w2,singles)
  cancelOK=bool(cancel) and all(cancellation_pass(r,gates) for r in cancel)
  freshOK=passes(fresh,[k for k in profileLabels if '-fresh-' in k])
  general=complete and singleOK and concurrentOK and asyncOK and cancelOK and freshOK and profile!='D'
  verdict=('CERTIFIED W1+W2' if general and w2OK else 'CERTIFIED W1' if general else 'PARTIAL' if singleOK else 'NOT CERTIFIED') if profile!='D' else 'DEVELOPMENT CONTROL — NOT CERTIFIED'
  bad=[{'batch':r['batch'],'index':r['plan_index'],'operation':r['operation'],'domain':r['domain'],'frequency_ghz':r['frequency_ghz'],'class':r['level'],'max_request_seconds':max([request_elapsed(v) for v in r['responses']]+[0]),'statuses':[v['status'] for v in r['responses']],'peak_cgroup_bytes':r['cgroup_lifetime_peak_bytes']} for r in pr if not numerical_pass(r,limit,gates) and r['operation']!='cancel']
  # Expose observed behavior without turning it into formal qualification.
  def observed(rr,extra=lambda r:True):return bool(rr) and all(numerical_pass(r,limit,gates) and extra(r) for r in rr)
  observedGates={'W1_single_numerical':observed(w1),'W2_single_numerical':observed(w2),'concurrency_numerical_and_overlap':observed(concur,concurrent_overlap),'normal_async_numerical_and_overlap':observed(normal,asyncExtra),'sustained_async_numerical':observed(sustain),'sustained_async_numerical_and_overlap':observed(sustain,asyncExtra),'fresh_first_request_numerical':observed(fresh)}
  def state(value,tested=True):return 'CERTIFIED' if value and profile!='D' else 'NOT CERTIFIED' if tested else 'NOT TESTED'
  matrix[profile]={'W1 single':state(singleOK),'W1 concurrency=2':state(concurrentOK,bool(concur)),'W1 async overlap':state(asyncOK,bool(normal+sustain)),'W2 single':state(w2OK),'W2 concurrency':'NOT TESTED','W2 async overlap':'NOT TESTED','W3':'BEST EFFORT' if w3 else 'NOT TESTED'}
  profileInflations=[r for r in inflations if r['profile']==profile]
  profiles[profile]={'definition':lock['profiles'][profile],'verdict':verdict,'complete':complete,'general_W1_certified':general,'W2_certified':general and w2OK,'single_W1':summary(w1),'single_W2':summary(w2),'W3':summary(w3),'W3_validation_negative_controls':summary(group(lambda r:r['validation_negative_control'])),'concurrency':{op:summary(group(lambda r:r['operation']==op)) for op in ['two-optimizers','optimize-evaluate','two-evaluates']},'normal_async':{op:summary(group(lambda r:r['operation']==op)) for op in ['async-optimize','async-evaluate']},'sustained_async':{op:summary(group(lambda r:r['operation']==op)) for op in ['sustained-optimize','sustained-evaluate']},'fresh_first_request':summary(fresh),'fresh_pass':freshOK,'observed_gates':observedGates,'cancellation_pass':cancelOK,'cancellation_cases':len(cancel),'memory':summary(pr),'memory_headroom_min_fraction':1-max([r['cgroup_lifetime_peak_bytes'] for r in pr if '-single-' in r['batch'] or '-mixed-' in r['batch'] or '-workflow-' in r['batch'] or '-fresh-' in r['batch']]+[0])/limit if limit else None,'largest_latency_inflation':max(profileInflations,key=lambda x:x['ratio']) if profileInflations else None,'gate_failures':bad,'operations':{op:summary(group(lambda r:r['operation']==op and r['level']=='W1' and '-single-' in r['batch'])) for op in lock['workloads']['W1']['operations']}}
 certified=[p for p in ['A','B','C'] if profiles[p]['general_W1_certified']];minimum=certified[0] if certified else None
 # Recommendation is an operational interpretation, separate from immutable certification gates.
 comparisons={}
 for p in ['A','B','C']:
  x=profiles[p]
  concurrency=max((v.get('max_request_seconds',0) for v in x['concurrency'].values()),default=0)
  asyncWall=max((v.get('max_request_seconds',0) for category in ['normal_async','sustained_async'] for v in x[category].values()),default=0)
  comparisons[p]={'W1_max_seconds':x['single_W1'].get('max_request_seconds'),'W2_max_seconds':x['single_W2'].get('max_request_seconds'),'W2_certified':x['W2_certified'],'concurrency_max_seconds':concurrency,'async_max_seconds':asyncWall,'memory_headroom_fraction':x['memory_headroom_min_fraction'],'W1_deadline_headroom_seconds':x['single_W1'].get('minimum_deadline_headroom_seconds'),'mixed_deadline_headroom_seconds':60-max(concurrency,asyncWall)}
 recommended=None;recommendation_evidence=[]
 if minimum:
  base=comparisons[minimum]
  for p in certified[1:]:
   x=comparisons[p];categories=['W1_max_seconds','concurrency_max_seconds','async_max_seconds']
   ratios={key:x[key]/base[key] for key in categories if base[key] and x[key] is not None}
   extends=x['W2_certified'] and not base['W2_certified']
   no_regression=len(ratios)==3 and all(v<=1.1 for v in ratios.values())
   contention_gain=any(ratios.get(k,1)<=.8 for k in ['concurrency_max_seconds','async_max_seconds'])
   memory_ok=x['memory_headroom_fraction']>=base['memory_headroom_fraction']
   qualifies=memory_ok and no_regression and (extends or contention_gain)
   recommendation_evidence.append({'profile':p,'relative_max_request_seconds':ratios,'extends_W2':extends,'no_over10percent_W1_or_mixed_regression':no_regression,'at_least20percent_contention_improvement':contention_gain,'memory_headroom_non_decreasing':memory_ok,'qualifies':qualifies})
   if qualifies and recommended is None:recommended=p
 responses=[dict(v,profile=r['profile_id'],domain=r['domain'],class_id=r['level'],operation=r['operation']) for r in rows for v in r['responses'] if r['operation']!='cancel']
 largest=max(responses,key=lambda r:r['response_bytes']) if responses else None
 workflows=[r for r in rows if r['level'] in ['W1','W2','W2-alt'] and r['operation'] in ['evaluate-maps','optimize-maps','cycle','explain'] and ('-single-' in r['batch'] or '-workflow-' in r['batch'])]
 largestWorkflow=max(workflows,key=lambda r:r['response_bytes']) if workflows else None
 sustained=[]
 for (label,index),data in asyncData.items():
  if not data['sustained']:continue
  samples=[s for s in data['samples'] if s['elapsed_seconds']<=30];row=rowsByBatch[label][index]
  sustained.append({'batch':label,'plan_index':index,'domain':row['domain'],'frequency_ghz':row['frequency_ghz'],'scenario':row['operation'],'duration_seconds':data['duration_seconds'],'active_sample_fraction':sum(s['active']==1 for s in samples)/len(samples) if samples else None,'submitted':data['submitted'],'submission_cap_reached':data['submitted']>=lock['async_protocol']['sustained_max_submissions'],'last_active_sample_elapsed_seconds':max([sample['elapsed_seconds'] for sample in data['samples'] if sample['active']==1]+[0]),'submission_failures':data['submission_failures'],'pass':async_pass(row,data,gates),'failure_reasons':async_failure_reasons(row,data,gates)})
 result={'schema_version':1,'certification_date':'2026-10-05','source_version':lock['baseline']['version'],'baseline':lock['baseline'],'baseline_evidence':load(HERE/'baseline-evidence.json'),'lock_sha256':sha(HERE/'certification-lock.json'),'workflow_supplement_lock_sha256':sha(HERE/'workflow-supplement-lock.json'),'science_supplement_lock_sha256':sha(HERE/'science-supplement-lock.json'),'science_supplement_reason':science['reason'],'surface_supplement_lock_sha256':sha(HERE/'surface-supplement-lock.json'),'surface_static_validation_correction':surface['reason'],'invalid_predecessor':lock['predecessor'],'dataset':lock['dataset'],'profiles':profiles,'matrix':matrix,'profile_comparison':comparisons,'recommendation_evidence':recommendation_evidence,'recommendation_method':'Among fully W1-certified references, prefer the smallest larger reference with no over10percent regression in worst W1/concurrency/async latency, non-decreasing memory headroom, and either W2 extension or at least20percent worst concurrency/async latency improvement. Interpretation of measured operational headroom, not a new certification gate. No recommendation merely for a larger allocation or isolated benchmark speed.','minimum_certified_profile':minimum,'recommended_certified_profile':recommended,'certified_profile_ids':certified,'completion':completion,'planned_groups':sum(map(len,allPlans.values())),'observed_groups':len(allRows),'primary_performance_groups':len(rows),'science_only_groups':len(scienceRows),'all_planned_complete':all(v['complete'] for v in completion.values()),'methodology_violations':violations,'scientific_invariance':scientific,'validation_negative_controls':{'planned':42,'observed':len(negative_controls),'locked_expected_status':422,'all_expected422':negative_control_ok,'observed_status_counts':dict(collections.Counter(str(p['status']) for r in negative_controls for p in r['responses'])),'production_validator_status':400,'production_validator_reason':'cell_size_m must be between 10 and 250','production_validator_source':'backend-go/raytracer/coverage_surface.go:102 and backend-go/coverage_surface_route.go','source_error_body_sha256':'d07a3fb2f912c180fdb5f8b5f5a081e1b0368585e9e14dd6e01ba3b6f3d80d25','source_error_bodies_match':bool(negative_controls) and all(p['sha256']=='d07a3fb2f912c180fdb5f8b5f5a081e1b0368585e9e14dd6e01ba3b6f3d80d25' for r in negative_controls for p in r['responses'])},'response_volume_by_class':{class_id: {'largest_single':max([q for q in responses if (q['class_id'].startswith('W2') if class_id=='W2' else q['class_id']==class_id)],key=lambda q:q['response_bytes'],default=None)} for class_id in ['W1','W2','W3']},'largest_latency_inflation':max(inflations,key=lambda x:x['ratio']) if inflations else None,'largest_single_response':largest,'largest_workflow':{k:largestWorkflow[k] for k in ['profile_id','domain','frequency_ghz','level','operation','response_bytes','wall_seconds']} if largestWorkflow else None,'idle_sleep_prevention':load(HERE/'idle-sleep-prevention.json'),'clock_discontinuities':clock_audit(rows),'timing_evidence_method':'Keep both original monotonic durations and UTC start/end timestamps. Score the longer recorded interval against the unchanged45-second elapsed gate. Clock discontinuities are reported as interrupted observations, not discarded or replaced. No relaxed numerical threshold.','overall_observation':summary(rows),'async_verification':[{'batch':label,'plan_index':index,'initial_active':data['initial_active'],'duration_seconds':data['duration_seconds'],'submitted':data['submitted'],'submission_failures':data['submission_failures'],'sustained':data['sustained'],'pass':async_pass(rowsByBatch[label][index],data,gates),'failure_reasons':async_failure_reasons(rowsByBatch[label][index],data,gates)} for (label,index),data in asyncData.items()],'sustained':sustained,'environment':envs,'auto_snapshots':autos,'gates':gates,'workloads':lock['workloads'],'runtime_parity':{'measured_go_version':'go1.27.1','shipping_docker_go_version':'go1.26.6','shipping_backend_go_directive':'1.26.6','shipping_runtime_certified':False,'source':'Dockerfile backend-build and backend-go/go.mod; measured Auto snapshots','interpretation':'Tested-runtime reference only. Default shipping Docker runtime has not been qualified by this study.'},'supported_workload_boundary':{'dataset':'exact Ankara2026.07 file hashes','cell_layouts':'the eight frozen nearest-six inventory layouts; arbitrary six-Cell combinations or locations are outside measured certification','optimization':'frontend default objective priorities/constraints, with radio_quality weight0; no custom per-cell RF overrides beyond locked fixtures','RF_settings':'exact W1/W2/W3 fixture parameters and request hashes; no guarantee for every intermediate or API-valid maximum input','runtime':'Linux arm64/cgroupv2,Go1.27.1,CGO disabled,pinnedimage,Go defaults,shared AppleM4 VM reference','claim':'reference deployment for tested dataset/runtime/workload envelope; resource floors alone never grant general certification'},'domains':load(HERE/'domain-manifest.json')['selected'],'repeats':lock['repeats'],'process_startup':{k:load(directory(k)/f'startup-{k}.json') for k in allPlans if (directory(k)/f'startup-{k}.json').exists()},'cancellation':[{k:r[k] for k in ['profile_id','domain','frequency_ghz','cancel_client_attempts','slots_after','active_clients_after','responses']} for r in rows if r['operation']=='cancel'],'evidence':evidence,'supplement_input_verification':supplementCopies,'production_invariants':lock['production_invariants'],'estimator_driven_admission_paused':True,'auto_matching_design':{'implemented':False,'feasible':'Descriptive eligibility only when resource, dataset, runtime and policy evidence is known; no automatic admission.','inputs':['known effective CPU','known hard memory ceiling','known effective memory upper bound','independent Docker provenance because Auto Linux environment is unknown','exact dataset ID, version, file hashes and counts','Linux arm64 / cgroup v2 / tested Go 1.27.1 / Go defaults / verified binary','worker 1 / queue 16','RF 20 attempts / 60-second window / 2 global slots / 1 per-client slot / 60-second deadline / 6 Cells'],'transient_free_ram_excluded':True,'numbers_alone_imply_certification':False},'unknown_zero':{'production_shared':'Already uses nil pointers for unavailable dataset metadata; no ambiguity requiring a production fix.','historical':'geometryDescribe(nil, bounds) returns zero counts in the frozen prototype due to nil-safe SearchBounds. Original artifacts are retained.','successor':'fixedGeometryObservation returns state unknown and null counts for nil; a real empty index has known zero counts. Regression test: TestFixedUnknownGeometry. Audit only.'},'limitations':['Exact Ankara 2026.07 pack only; no safe generic complexity ceiling inferred.','Two domains per geometry band; five repeats per band, frequency and critical operation alternate domains 3/2. Finite observations are not statistical tail guarantees.','Recorded VM clock discontinuities are retained; their cause is not independently verified. The longer recorded request interval fails the unchanged elapsed gate.','Apple M4 shared development host, 10 CPU / 11.7 GiB VM; the existing atom-app is retained. CPU quota constrains maximum consumption, not dedicated physical core reservation or host speed equivalence.','Linux Auto environment is deliberately unknown; Docker inspection independently establishes container provenance.','Building Entry raw hashes include elapsed_ms. The156-request science-only supplement removes only that field; its buffered JSON client measurements do not score performance.','Actual HTTP uncompressed loopback streaming is not a WAN network SLO or browser rendering benchmark.','Process CPU, RSS and heap include sampler, client and retained state; mixed CPU is aggregate. RSS is sampled every 50 ms; kernel memory.peak includes startup/cache. No memory reservation model.','The main explanation row excludes its prerequisite; a separately preregistered 120-workflow supplement supplies complete Optimize plus explanation evidence.','Profiles describe bounded tested reference floors; larger hardware, other architectures and runtime versions require operational verification. No monotonic scaling promise.','W2 concurrency and async overlap are not tested. Finite W3 edge probes never guarantee all API-valid maxima. Original API-invalid Surface probes remain negative controls; separately frozen valid 10 m probes supply W3 Surface evidence.','Unbounded D is never certified. Three invalid bootstrap preliminary rows are excluded and preserved.'],'version_recommendation':'No VERSION bump or release; documentation and internal tooling only.','freeze_decision':'Freeze empirical evidence and policy; publish only profiles meeting every locked W1 gate. No adaptive admission, resource UI, Cell cap or algorithm changes.','next_action':'Preregister a shipping Go1.26.6 qualification for the recommended tested reference and same Ankara/W1 envelope, with a corrected sustained producer that remains active through every interactive call; preserve all current observations.' if recommended else 'Preregister a shipping Go1.26.6 qualification for the minimum tested reference and same Ankara/W1 envelope, with a corrected sustained producer that remains active through every interactive call; preserve all current observations.' if minimum else 'Preregister a successor qualification of the same W1 envelope on the shipping Go1.26.6 runtime, correcting the new contract to expect HTTP400 for the invalid Surface control and keeping background computation active through every interactive call, including the final tail; preserve all current failed/interrupted observations.'}
 (ROOT/'docs/fixed-deployment-profile-certification.json').write_text(json.dumps(result,indent=2)+'\n')
 return result
if __name__=='__main__':
 r=analyze();print('Completed',r['observed_groups'],'/',r['planned_groups'],'groups;certified',r['certified_profile_ids'])
