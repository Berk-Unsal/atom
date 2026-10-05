#!/usr/bin/env python3
"""Score shipping W1 observations; preserve missing, failed and interrupted evidence."""
import collections,datetime,gzip,json,pathlib,re,statistics
from protocol import HERE,ROOT,WORK,load,sha,verify,numerical,overlap,background_failures,mixed_guard

def archive(path,alias):
 target=HERE/'evidence'/(alias+'.gz');target.parent.mkdir(exist_ok=True);payload=gzip.compress(path.read_bytes(),mtime=0)
 if target.exists() and target.read_bytes()!=payload:raise ValueError('refuse replacement of evidence: '+str(target))
 if not target.exists():target.write_bytes(payload)
 return {'path':str(target.relative_to(ROOT)),'sha256':sha(target),'uncompressed_sha256':sha(path)}
def summary(rows):
 rs=[r for row in rows for r in row['responses'] if row['operation'] not in ['cancel','surface-control','budget']]
 return {'groups':len(rows),'HTTP_responses':len(rs),'HTTP_failures':sum(r['status']!=200 for r in rs),'incomplete_streams':sum(not r['stream_complete'] for r in rs),'max_elapsed_seconds':max([r['elapsed_seconds'] for r in rs]+[0]),'minimum_deadline_headroom_seconds':60-max([r['elapsed_seconds'] for r in rs]+[0]),'peak_RSS_bytes':max([max(r['rss_sampled_max_bytes'],r['after_probes']['rss_bytes']) for r in rows]+[0]),'peak_cgroup_bytes':max([r['cgroup_lifetime_peak_bytes'] for r in rows]+[0]),'process_cpu_seconds':sum(r['after']['process_cpu_seconds']-r['before']['process_cpu_seconds'] for r in rows),'throttled_seconds':sum((r['after']['cpu']['throttled_usec']-r['before']['cpu']['throttled_usec'])/1e6 for r in rows),'throttled_periods':sum(r['after']['cpu']['nr_throttled']-r['before']['cpu']['nr_throttled'] for r in rows),'periods':sum(r['after']['cpu']['nr_periods']-r['before']['cpu']['nr_periods'] for r in rows),'max_response_bytes':max([r['response_bytes'] for r in rs]+[0]),'max_workflow_bytes':max([sum(r['response_bytes'] for r in row['responses']) for row in rows]+[0])}

def required_requests(rows):
 """Include the declared slot probes when reporting the complete safety envelope."""
 rs=[]
 for row in rows:
  main=row['responses']
  if row['operation'] in ['cancel','surface-control']:main=[]
  elif row['operation']=='budget':main=main[:20]
  rs.extend(main+row['slot_probes'])
 worst=max(rs,key=lambda r:r['elapsed_seconds']) if rs else None
 return {'responses':len(rs),'HTTP_failures':sum(r['status']!=200 for r in rs),'incomplete_streams':sum(not r['stream_complete'] for r in rs),'max_elapsed_seconds':worst['elapsed_seconds'] if worst else 0,'minimum_deadline_headroom_seconds':60-worst['elapsed_seconds'] if worst else 60,'slowest_request':worst}

def resource_events(rows):
 return {k:max([q['after_probes']['memory_events'].get(k,0) for q in rows]+[0]) for k in ['oom','oom_kill','max']}

def repeat_stability(rows):
 groups=collections.defaultdict(list)
 for q in rows:
  if '-single-' not in q['batch']:continue
  for response in q['responses']:groups[q['fixture'],q['operation'],response['endpoint'],response['request_sha256']].append(response['elapsed_seconds'])
 records=[]
 for key,values in groups.items():
  if len(values)<2:continue
  records.append({'fixture':key[0],'operation':key[1],'endpoint':key[2],'request_sha256':key[3],'observations':len(values),'minimum_seconds':min(values),'maximum_seconds':max(values),'median_seconds':statistics.median(values),'max_to_median_ratio':max(values)/statistics.median(values)})
 return {'exact_repeated_request_groups':len(records),'worst_max_to_median':max(records,key=lambda v:v['max_to_median_ratio']) if records else None,'interpretation':'Within-fixture repeated observations only; finite-repeat spread is not a percentile/tail guarantee.'}
def analyze():
 lock=verify();plans=load(HERE/'run-plans.json');execution=load(HERE/'execution.json') if (HERE/'execution.json').exists() else {'batches':{}};rows=[];by_batch={};complete={};violations=[];bg={};evidence=[];heap={}
 for label,cases in plans.items():
  folder=WORK/label;p=folder/'runs.jsonl';batch=[json.loads(line) for line in p.read_text().splitlines()] if p.exists() else [];by_batch[label]=batch;meta=execution['batches'].get(label,{})
  complete[label]={'planned':len(cases),'observed':len(batch),'complete':len(cases)==len(batch) and meta.get('exit_code')==0,'runtime':meta}
  for i,row in enumerate(batch):
   if i>=len(cases) or any(row.get(k)!=v for k,v in dict(cases[i],plan_index=i,batch=label,profile=label.split('-')[0],qualification_lock_sha256=sha(HERE/'qualification-lock.json')).items()):violations.append(label+' ledger identity mismatch')
  rows+=batch
  if not complete[label]['complete']:continue  # Never archive a still-growing ledger.
  for p in folder.iterdir():
   if p.is_file():evidence.append(archive(p,label+'-'+p.name))
   if p.name.startswith('async-') and p.suffix=='.json':bg[label,int(p.stem.split('-')[1])]=load(p)
  identity=load(folder/'process-identity.json')
  if identity['primary_executable_sha256']!=lock['shipping']['binary_sha256']:violations.append(label+' primary binary identity')
  trace=re.findall(r'(\d+)->(\d+)->(\d+) MB', (folder/'server.log').read_text())
  heap[label]={'GC_events_observed':len(trace),'peak_GC_start_end_heap_bytes':max([int(v)*(1<<20) for triplet in trace for v in triplet[:2]]+[0]),'peak_post_GC_live_heap_bytes':max([int(t[2])*(1<<20) for t in trace]+[0]),'method':'standard Go1.26.6 gctrace; GC-event sizes atMiB resolution, not sampledHeapAlloc maximum'}
  if not trace:violations.append(label+' missing required heap observation')
 if all(v['complete'] for v in complete.values()):
  for profile in ['A','B','C']:
   try:mixed_guard(plans,by_batch,profile)
   except (ValueError,AssertionError) as e:violations.append(str(e))
 scientific=collections.defaultdict(set);seen=collections.defaultdict(set)
 for row in rows:
  for r in row['responses']+row['slot_probes']:
   if r['status']!=200 or not r['stream_complete']:continue
   key=(r['endpoint'],r['request_sha256']);digest=r.get('scientific_sha256') if r['endpoint']=='/api/building-entry-analysis' else r['sha256']
   if not digest:violations.append('missing scientific hash '+row['batch']);continue
   scientific[key].add(digest);seen[key].add(row['profile'])
 unstable=[{'endpoint':k[0],'request_sha256':k[1],'hashes':sorted(v)} for k,v in scientific.items() if len(v)!=1]
 science={'stable':bool(scientific) and not unstable,'groups':len(scientific),'groups_compared_all_ABC':sum(v=={'A','B','C'} for v in seen.values()),'unstable':unstable,'excluded_fields':['diagnostics.elapsed_ms for Building Entry only'],'numeric_tokens_and_array_order_preserved':True}
 if any(v!={'A','B','C'} for v in seen.values()) and all(v['complete'] for v in complete.values()):violations.append('scientific input groups lack allABC coverage')
 interrupted=[{'batch':row['batch'],'index':row['plan_index'],'operation':row['operation'],'profile':row['profile'],'response':r} for row in rows for r in row['responses']+row['slot_probes'] if r['clock_discontinuity']]
 for row in rows:
  utc_group=datetime.datetime.fromisoformat(row['after']['at']).timestamp()-datetime.datetime.fromisoformat(row['started_at']).timestamp()
  if abs(utc_group-row['group_monotonic_seconds'])>1:interrupted.append({'batch':row['batch'],'index':row['plan_index'],'operation':row['operation'],'profile':row['profile'],'group_monotonic_seconds':row['group_monotonic_seconds'],'group_UTC_seconds':utc_group})
 profiles={};isolated=collections.defaultdict(list);inflation=[]
 for row in rows:
  if '-single-' in row['batch'] and row['operation'] in ['evaluate','optimize']:
   for r in row['responses']:isolated[row['profile'],row['fixture'],r['endpoint']].append(r['elapsed_seconds'])
 for row in rows:
  if '-mixed-' not in row['batch']:continue
  for r in row['responses']:
   refs=isolated[row['profile'],row['fixture'],r['endpoint']]
   if len(refs)==5:
    median=statistics.median(refs);inflation.append({'profile':row['profile'],'fixture':row['fixture'],'scenario':row['operation'],'endpoint':r['endpoint'],'elapsed_seconds':r['elapsed_seconds'],'isolated_median_seconds':median,'ratio':r['elapsed_seconds']/median})
 for p in ['A','B','C']:
  pr=[r for r in rows if r['profile']==p];limit=lock['profiles'][p]['memory_gib']*(1<<30);single=[r for r in pr if '-single-' in r['batch']];fresh=[r for r in pr if '-fresh-' in r['batch']];cancel=[r for r in pr if r['operation']=='cancel'];controls=[r for r in pr if r['operation']=='surface-control'];budget=[r for r in pr if r['operation']=='budget'];concur=[r for r in pr if r['operation'] in ['two-optimizers','optimize-evaluate','two-evaluates']];normal=[r for r in pr if r['operation'].startswith('async-')];sustained=[r for r in pr if r['operation'].startswith('sustained-')];failures=[];async_results=[]
  for row in pr:
   reasons=[]
   if not numerical(row,limit):reasons.append('HTTP/stream/time/memory/control/slot gate')
   if row in concur and not overlap(row['responses']):reasons.append('interactive requests did not overlap')
   if row in normal+sustained:
    data=bg.get((row['batch'],row['plan_index']))
    reasons+=background_failures(row,data) if data else ['missing background evidence']
    async_results.append({'batch':row['batch'],'index':row['plan_index'],'scenario':row['operation'],'fixture':row['fixture'],'interactive_calls':len(row['responses']),'passed':not reasons,'failure_reasons':reasons,'final_tail_overlap_passed':not reasons if row in sustained else None})
   if reasons:failures.append({'batch':row['batch'],'index':row['plan_index'],'operation':row['operation'],'fixture':row['fixture'],'reasons':reasons})
  profile_complete=all(v['complete'] for k,v in complete.items() if k.startswith(p+'-'));invalid=not profile_complete or bool(violations) or any(e['profile']==p for e in interrupted)
  verdict='INVALID / INSUFFICIENT' if invalid else 'NOT CERTIFIED W1' if failures or not science['stable'] else 'CERTIFIED W1'
  profiles[p]={'definition':lock['profiles'][p],'verdict':verdict,'complete':profile_complete,'W1_single':summary(single),'concurrency':{op:summary([r for r in concur if r['operation']==op]) for op in ['two-optimizers','optimize-evaluate','two-evaluates']},'normal_async':summary(normal),'sustained_async':summary(sustained),'async_results':async_results,'fresh':summary(fresh),'cancellation_cases':len(cancel),'cancellation_passed':sum(numerical(r,limit) for r in cancel),'max_release_observation_seconds':max([r['responses'][0]['release_observation_seconds'] for r in cancel]+[0]),'surface_controls':len(controls),'surface_status_counts':dict(collections.Counter(str(r['responses'][0]['status']) for r in controls)),'budget_cases':len(budget),'budget_passed':sum(numerical(r,limit) for r in budget),'memory':summary(pr),'memory_headroom_fraction':1-max([r['cgroup_lifetime_peak_bytes'] for r in pr]+[0])/limit,'failure_cases':failures}
 for p in ['A','B','C']:
  pr=[q for q in rows if q['profile']==p]
  profiles[p]['required_interactive_requests']=required_requests(pr)
  profiles[p]['memory_events']=resource_events(pr)
  profiles[p]['repeat_stability']=repeat_stability(pr)
  stats=profiles[p]['memory'];profiles[p]['throttled_period_fraction']=stats['throttled_periods']/stats['periods'] if stats['periods'] else 0
 certified=[p for p in ['A','B','C'] if profiles[p]['verdict']=='CERTIFIED W1'];minimum=certified[0] if certified else None;recommended=minimum;comparison=[]
 if minimum:
  def categories(p):
   x=profiles[p];return {'W1':x['W1_single']['max_elapsed_seconds'],'concurrency':max(v['max_elapsed_seconds'] for v in x['concurrency'].values()),'normal_async':x['normal_async']['max_elapsed_seconds'],'sustained_async':x['sustained_async']['max_elapsed_seconds']}
  base=categories(minimum)
  for p in certified[1:]:
   c=categories(p);ratios={k:c[k]/base[k] for k in base};memory_ok=profiles[p]['memory_headroom_fraction']>=profiles[minimum]['memory_headroom_fraction'];no_regression=all(v<=1.1 for v in ratios.values());contention_gain=any(ratios[k]<=.8 for k in ['concurrency','normal_async','sustained_async']);eligible=memory_ok and no_regression and contention_gain
   comparison.append({'profile':p,'relative_max_latencies':ratios,'memory_headroom_not_worse':memory_ok,'no_over10percent_regression':no_regression,'at_least20percent_contention_improvement':contention_gain,'recommended_over_minimum':eligible})
   if eligible and recommended==minimum:recommended=p
 result={'schema_version':1,'status':'complete' if all(v['complete'] for v in complete.values()) else 'in progress','scope':lock['scope'],'baseline':lock['baseline'],'qualification_lock_sha256':sha(HERE/'qualification-lock.json'),'run_plan_sha256':sha(HERE/'run-plans.json'),'shipping':lock['shipping'],'observer':lock['observer'],'dataset':lock['dataset'],'domain_manifest_sha256':lock['domain_manifest_sha256'],'W1':lock['W1'],'gates':lock['gates'],'timing_protocol':lock['timing'],'producer_precheck':lock['background']['precheck'],'planned_groups':sum(map(len,plans.values())),'observed_groups':len(rows),'completion':complete,'all_planned_complete':all(v['complete'] for v in complete.values()),'profiles':profiles,'certified_profiles':certified,'minimum_certified_profile':minimum,'recommended_profile':recommended,'recommendation_comparison':comparison,'recommendation_method':'Prefer smallest fully certified reference; recommend a larger certified tier only with no>10percent observed worst-latency regression acrossW1/concurrency/normal/sustained, no worsememoryheadroom, and >=20percent improvement in at leastone contention category. Consider all measuredthrottling/stability/headroom; allocation size alone doesnot recommend. Otherwise recommended equals minimum.','scientific_invariance':science,'methodology_violations':violations,'interrupted_observations':interrupted,'largest_latency_inflation':max(inflation,key=lambda x:x['ratio']) if inflation else None,'overall':summary(rows),'heap_observations':heap,'production_invariants':lock['production_invariants'],'sleep_prevention':load(HERE/'sleep-prevention.json'),'baseline_checks':load(HERE/'baseline-checks.json'),'quality_checks':load(HERE/'checks.json') if (HERE/'checks.json').exists() else {},'evidence':evidence,'estimator_admission_paused':True,'Auto_descriptive_matching_implemented':False,'eight_cell_reaudit':'Separate operational and request-budget study may be justified only after a clean W1 reference qualifies; six-Cell cap unchanged.','version_recommendation':'No release or VERSION bump; certification docs/tooling only.','limitations':['Exact eight layouts and frozenRF/objective settings only; no arbitrary six-Cell layout or dataset claim.','Shipping Linuxarm64/cgroupv2 on shared AppleM4 developmentVM; CPU quota is not dedicated physicalcore reservation.','GC tracing logs heap atGCevents andMiB resolution; not continuousHeapAlloc peak. Observer memory/CPU are in a separatecgroup; its host contention and client-streaming costs remain in wall evidence.','Cgroup lifetimepeak includes extraAutoCLI startup process and pagecache; conservative peak is not a reservation.','Loopback uncompressed streaming is not aWAN/browser SLO.','No W2/W3 qualification or eight-Cell product test.','Finite repeats are not percentile/tail guarantees; no extrapolation toother architectures orruntimeversions.'],'freeze_decision':'Keep immutable contract/results and existing fixedpolicy; publish only fully qualified exact-scope references.'}
 result['required_interactive_requests']=required_requests(rows)
 result['memory_events']=resource_events(rows)
 result['qualification_completed_at']=execution.get('finished_at') if result['all_planned_complete'] else None
 result['recommendation_operational_evidence']={p:{'memory_headroom_fraction':profiles[p]['memory_headroom_fraction'],'throttled_period_fraction':profiles[p]['throttled_period_fraction'],'repeat_stability':profiles[p]['repeat_stability'],'minimum_deadline_headroom_seconds':profiles[p]['required_interactive_requests']['minimum_deadline_headroom_seconds']} for p in ['A','B','C']}
 (ROOT/'docs/w1-shipping-runtime-qualification.json').write_text(json.dumps(result,indent=2)+'\n');return result
if __name__=='__main__':
 r=analyze();print(r['status'],r['observed_groups'],'/',r['planned_groups'],r['certified_profiles'])
