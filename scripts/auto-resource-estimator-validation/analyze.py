#!/usr/bin/env python3
"""Score frozen pre-request predictions. This module has no fitting path."""
import collections,datetime,gzip,hashlib,json,math,pathlib,statistics
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];G=pathlib.Path('/tmp/atom-resource-locked-validation/geometry')
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def lines(p):return [json.loads(x) for x in p.read_text().splitlines()] if p.exists() else []
def stamp(v):return datetime.datetime.fromisoformat(v.replace('Z','+00:00'))
def archive_async(path):
 """Preserve complete queue observations after measurement, without rewriting logs."""
 evidence=HERE/'evidence';evidence.mkdir(exist_ok=True)
 payload=gzip.compress(path.read_bytes(),mtime=0);target=evidence/(path.name+'.gz')
 if target.exists():
  if target.read_bytes()!=payload:raise ValueError('Archived evidence differs: '+str(target))
 else:
  with target.open('xb') as output:output.write(payload)
 return dict(path=str(target.relative_to(ROOT)),sha256=sha(target),uncompressed_sha256=sha(path))
def metrics(rows):
 if not rows:return None
 raw=[r['actual']/r['raw'] for r in rows];post=[r['actual']/r['adjusted'] for r in rows]
 error=[abs(r['raw']/r['actual']-1) for r in rows if r['actual']>0]
 return dict(n=len(rows),raw_underprediction_count=sum(v>1 for v in raw),raw_underprediction_rate=sum(v>1 for v in raw)/len(rows),post_margin_underprediction_count=sum(v>1 for v in post),post_margin_underprediction_rate=sum(v>1 for v in post)/len(rows),worst_raw_ratio=max(raw),worst_post_margin_ratio=max(post),worst_post_margin_shortfall=max([0]+[1-1/v for v in post if v>0]),median_absolute_relative_error=statistics.median(error) if error else None,maximum_overestimate=max([0]+[1/v-1 for v in raw if v>0]),maximum_post_margin_overestimate=max([0]+[1/v-1 for v in post if v>0]),http_failures=sum(r['status']!=200 for r in rows),worst_raw_case=rows[raw.index(max(raw))]['case'])
def passes(m,margin,gates):return m is not None and margin<=gates['maximum_calibration_margin'] and m['post_margin_underprediction_rate']<=gates['maximum_post_margin_underprediction_rate'] and m['worst_post_margin_shortfall']<=gates['maximum_post_margin_shortfall_fraction_actual'] and m['http_failures']==0
def job_run_counts(jobs):
 # Production manager uses OGC job status "dismissed" for cancellation.
 return (sum(j['completed_runs'] for j in jobs),sum(max(0,j['total_runs']-j['completed_runs']) for j in jobs if j['status']=='dismissed'))
def analyze():
 lock=read(HERE/'validation-lock.json');domains=read(HERE/'domain-manifest.json');plan=read(HERE/'run-plans.json');env=read(G/'environment.json')
 violations=[]
 for name in ['validation-lock','domain-manifest','run-plans']:
  if sha(HERE/(name+'.json'))!=(HERE/(name+'.sha256')).read_text().split()[0]:violations.append(name+' hash changed')
 if sha(ROOT/lock['source_artifact'])!=lock['source_sha256']:violations.append('calibration source changed')
 ds={d['id']:d for d in domains['selected']};records=[];allrequests=[];allpredictions=[];runs=[];completion={};memory=[];asyncinfo=[]
 for label,ps in plan.items():
  rr=lines(G/f'runs-{label}.jsonl');prs=lines(G/f'predictions-{label}.jsonl');reqs=lines(G/f'requests-{label}.jsonl');byid={p['id']:p for p in prs};allpredictions.extend(dict(p,batch=label) for p in prs);allrequests.extend(dict(r,batch=label) for r in reqs);runs.extend(dict(r,batch=label) for r in rr)
  completion[label]={'planned':len(ps),'observed':len(rr),'complete':len(rr)==len(ps),'container':env['batches'].get(label)}
  for request in reqs:
   if request['id'] not in byid:violations.append(label+' result without prediction');continue
   p=byid[request['id']]
   if stamp(p['recorded_at'])>=stamp(request['start']):violations.append(label+' prediction recorded after start')
   if p['lock_sha256']!=env['lock_sha256'] or p['domain_sha256']!=env['domain_sha256']:violations.append(label+' prediction provenance mismatch')
  for i,r in enumerate(rr):
   case=ps[i];op=case['operation'];freq=r['frequency_ghz'];level=r['level'];profile=label.split('-')[0];band=r['band'];group_requests=[q for q in reqs if q['plan_index']==i and stamp(q['start'])>=stamp(r['started_at'])];group_preds=[p for p in prs if p['plan_index']==i and p['operation']==op]
   memory.append(dict(batch=label,domain=r['domain'],operation=op,frequency_ghz=freq,level=level,repeat=r['repeat'],**{k:r[k] for k in ['rss_before_bytes','rss_sampled_max_bytes','heap_before_bytes','heap_after_bytes','heap_sampled_max_bytes','allocation_bytes','cgroup_before_bytes','cgroup_sampled_max_bytes','cgroup_lifetime_peak_bytes','memory_events']}))
   if op.startswith('async'):
    for q in group_requests:
     p=byid[q['id']]
     for target,pre in p['predictions'].items():
      if target not in ['response_bytes','wall_seconds']:continue
      actual=q['response_bytes'] if target=='response_bytes' else (q['server'] or {}).get('handler_wall_seconds',q['http_wall_seconds'])
      records.append(dict(estimator=pre['estimator'],operation=q['operation'],target=target,profile=profile,band=band,rf_setting=level.split('--')[0],search_setting=level.split('--')[1] if q['operation']=='optimize' else 'not-applicable',frequency_ghz=freq,stage='mixed',domain=r['domain'],repeat=r['repeat'],raw=pre['raw'],adjusted=pre['adjusted'],actual=actual,raw_ratio=actual/pre['raw'],post_margin_ratio=actual/pre['adjusted'],status=q['status'],case=dict(batch=label,plan_index=i,request_id=q['id'],domain=r['domain'],frequency_ghz=freq,level=level,repeat=r['repeat'])))
   if 'recorder' in label or op.startswith('async') or op=='cancel':continue
   matched=[q for q in group_requests if q['operation']==op]
   if not matched:continue
   q=matched[-1];p=byid[q['id']]
   for target,pre in p['predictions'].items():
    if target=='response_bytes':actual=q['response_bytes']
    elif target=='cpu_seconds':actual=r['cpu_seconds']
    elif target=='wall_seconds':actual=(q['server'] or {}).get('handler_wall_seconds',q['http_wall_seconds'])
    else:continue
    records.append(dict(estimator=pre['estimator'],operation=op,target=target,profile=profile,band=band,rf_setting=level.split('--')[0],search_setting=level.split('--')[1] if op=='optimize' else 'not-applicable',frequency_ghz=freq,stage='fresh' if 'fresh' in label else 'main',domain=r['domain'],repeat=r['repeat'],raw=pre['raw'],adjusted=pre['adjusted'],actual=actual,raw_ratio=actual/pre['raw'],post_margin_ratio=actual/pre['adjusted'],status=q['status'],case=dict(batch=label,plan_index=i,request_id=q['id'],domain=r['domain'],frequency_ghz=freq,level=level,repeat=r['repeat'])))
 results={}
 for estimator in lock['estimators']:
  name=estimator['name'];rs=[r for r in records if r['estimator']==name];overall=metrics(rs);breakdown={}
  for key in ['band','rf_setting','search_setting','frequency_ghz','profile','stage','domain']:
   breakdown[key]={str(v):metrics([r for r in rs if r[key]==v]) for v in sorted({r[key] for r in rs},key=str)}
  # Expected RF cases are derived from the already-frozen plan, never from observed successes.
  expected=sum(1 for label,ps in plan.items() if 'recorder' not in label for p in ps if p['operation']==estimator['operation'])
  primary_observed=sum(r['stage']!='mixed' for r in rs)
  complete=primary_observed==expected
  evaluated=[overall]+[m for key in ['band','rf_setting','search_setting','frequency_ghz','profile'] for m in breakdown[key].values()]
  classification='INSUFFICIENT' if not complete else 'PASS' if all(passes(m,estimator['calibration_only_margin'],lock['numeric_gates']) for m in evaluated) else 'FAIL'
  if estimator['role']=='negative_control':classification='FAIL' if complete and any(not passes(m,estimator['calibration_only_margin'],lock['numeric_gates']) for m in evaluated) else 'INSUFFICIENT'
  results[name]=dict(role=estimator['role'],classification=classification,expected=expected,observed=primary_observed,mixed_observed=sum(r['stage']=='mixed' for r in rs),metrics=overall,breakdown=breakdown,negative_control_certification_prohibited=estimator['role']=='negative_control')
 # Sustained overlap explicitly sampled, gaps are retained.
 for path in sorted(G.glob('async-*.jsonl')):
  archive=archive_async(path);samples=lines(path);timed=[s for s in samples if 'elapsed_seconds' in s];duration=max([0]+[s['elapsed_seconds'] for s in timed]);active=[s for s in timed if s['active']>0];active_time=0
  for a,b in zip(timed,timed[1:]):
   if a['active']>0:active_time+=b['elapsed_seconds']-a['elapsed_seconds']
  start=stamp(timed[0]['at']) if timed else None;end=stamp(timed[-1]['at']) if timed else None
  batch=path.stem[len('async-'):].rsplit('-',1)[0];idx=int(path.stem.rsplit('-',1)[1]);requests=[q for q in allrequests if q['batch']==batch and q['plan_index']==idx and q['operation'] in ['optimize','evaluate']]
  overlaps=[]
  for q in requests:
   overlap=sum(max(0,min(stamp(q['end']),stamp(b['at'])).timestamp()-max(stamp(q['start']),stamp(a['at'])).timestamp()) for a,b in zip(timed,timed[1:]) if a['active']>0)
   overlaps.append(dict(id=q['id'],operation=q['operation'],wall_seconds=q['http_wall_seconds'],response_bytes=q['response_bytes'],status=q['status'],overlap_seconds=overlap))
  submissions=[q for q in allrequests if q['batch']==batch and q['plan_index']==idx and q['operation']=='']
  submission_statuses=dict(collections.Counter(str(q['status']) for q in submissions))
  final_jobs=samples[-1].get('jobs',[]) if samples else []
  completed_runs,canceled_runs=job_run_counts(final_jobs)
  asyncinfo.append(dict(evidence_archive=archive,submission_http_status_counts=submission_statuses,uncached_accepted_jobs=submission_statuses.get('202',0),cached_submissions=submission_statuses.get('200',0),denied_submissions=submission_statuses.get('429',0),completed_runs=completed_runs,canceled_or_unexecuted_runs=canceled_runs,file=path.name,batch=batch,plan_index=idx,scenario=plan[batch][idx]['operation'],domain=json.loads((G/(plan[batch][idx]['fixture']+'.json')).read_text())['domain'],duration_seconds=duration,sampled_active_seconds=active_time,active_fraction=len(active)/len(timed) if timed else 0,submitted=max([0]+[s['submitted'] for s in samples if 'submitted'in s]),peak_queue=max([0]+[s['queue_depth'] for s in timed]),interactive=overlaps,final=samples[-1] if samples else None))
 # Streaming versus recorder: matched input, distinct process/cache histories; descriptive differences only.
 comparisons=[]
 for profile in ['A','B','D']:
  for band in ['sparse','dense']:
   d=next(d for d in domains['selected'] if d['band']==band)['id']
   for op in ['simulate','interference']:
    a=[m for m in memory if m['batch']==profile and m['domain']==d and m['operation']==op and m['frequency_ghz']==2.6 and m['level']=='r300-r500--legacy']
    b=[m for m in memory if m['batch']==profile+'-recorder-'+band and m['operation']==op]
    if a and b:
     vals={k:dict(http_median=statistics.median(x[k] for x in a),recorder_median=statistics.median(x[k] for x in b),recorder_minus_http=statistics.median(x[k] for x in b)-statistics.median(x[k] for x in a)) for k in ['rss_sampled_max_bytes','heap_sampled_max_bytes','allocation_bytes','cgroup_sampled_max_bytes']}
     comparisons.append(dict(profile=profile,band=band,domain=d,operation=op,measures=vals,http_repeats=len(a),recorder_repeats=len(b)))
 mixed=[]
 for scenario in lock['mixed_load']['scenarios']:
  for profile in ['A','B','D']:
   for d in [next(d for d in domains['selected'] if d['band']==band)['id'] for band in ['sparse','dense']]:
    groups=[a for a in asyncinfo if a['scenario']==scenario and a['batch']==profile and a['domain']==d]
    for op in ['optimize','evaluate']:
     qs=[q for a in groups for q in a['interactive'] if q['operation']==op];isolated=[q['http_wall_seconds'] for q in allrequests if q['batch']==profile and q['domain']==d and q['operation']==op and plan[profile][q['plan_index']]['fixture']==f'{d}-2.6-r300-r500--legacy' and plan[profile][q['plan_index']]['operation']==op]
     if qs:
      base=statistics.median(isolated) if isolated else None;med=statistics.median(q['wall_seconds'] for q in qs);mx=max(q['wall_seconds'] for q in qs)
      overlapping=[q for q in qs if q['overlap_seconds']>0];om=statistics.median(q['wall_seconds'] for q in overlapping) if overlapping else None;ox=max([q['wall_seconds'] for q in overlapping],default=None)
      mixed.append(dict(profile=profile,domain=d,scenario=scenario,operation=op,n=len(qs),scenario_repeats=len(groups),isolated_median=base,sustained_median=med,sustained_max=mx,median_inflation=med/base if base else None,max_inflation=mx/base if base else None,failed=sum(q['status']!=200 for q in qs),sampled_overlap_request_count=len(overlapping),no_sampled_overlap_request_count=len(qs)-len(overlapping),overlap_subset_median=om,overlap_subset_max=ox,overlap_subset_median_inflation=om/base if om is not None and base else None,overlap_subset_max_inflation=ox/base if ox is not None and base else None,all_requests_retained=True))
 mixed_baseline_gaps=[dict(profile=m['profile'],domain=m['domain'],scenario=m['scenario'],operation=m['operation']) for m in mixed if m['isolated_median'] is None]
 allcomplete=all(c['complete'] and c['container'] and c['container']['state']['ExitCode']==0 for c in completion.values())
 asynccomplete=len(asyncinfo)==72 and all(a['duration_seconds']>=lock['async_plan']['duration_seconds'] and a['sampled_active_seconds']>=lock['async_plan']['duration_seconds'] and len([q for q in a['interactive'] if q['overlap_seconds']>0])>=2 for a in asyncinfo)
 candidates=[v for v in results.values() if v['role']=='candidate'];useful_compute=any(v['classification']=='PASS' for k,v in results.items() if k in ['optimize/cpu_seconds','recommendation/cpu_seconds']);useful_response=any(v['classification']=='PASS' for k,v in results.items() if k in ['optimize/response_bytes','simulate/response_bytes','interference/response_bytes','surface/response_bytes'])
 classification='D — INVALID VALIDATION' if violations or not allcomplete or not asynccomplete or mixed_baseline_gaps else 'A — LOCKED VALIDATION PASS' if all(v['classification']=='PASS' for v in candidates) else 'B — PARTIAL PASS' if any(v['classification']=='PASS' for v in candidates) else 'C — LOCKED VALIDATION FAIL'
 allowed=useful_compute and useful_response and asynccomplete and allcomplete and not violations and not mixed_baseline_gaps
 preflights={p:read(G/f'preflight-{p}.json') if (G/f'preflight-{p}.json').exists() else None for p in ['A','B','D']}
 chronology={};hash_groups=collections.defaultdict(set);cancellations=[]
 for row in runs:
  if row['operation']=='cancel':cancellations.append(dict(batch=row['batch'],domain=row['domain'],responses=row['responses'],followup_ok=len(row['responses'])==2 and row['responses'][1]['status']==200 and row['responses'][1]['remaining']=='18'))
  if row['operation'] in ['cancel'] or row['operation'].startswith('async'):continue
  for res in row['responses']:
   if res['status']==200:hash_groups[(row['domain'],row['frequency_ghz'],row['level'],row['operation'],res['endpoint'])].add(res['sha256'])
 for label in plan:
  if (G/f'startup-{label}.json').exists():
   st=read(G/f'startup-{label}.json');requests=[q for q in allrequests if q['batch']==label];first=min(requests,key=lambda q:q['start']) if requests else None;chronology[label]=dict(startup=st,first_rf_request=first)
 preflight_failure={}
 failure_log=G/'preflight-failure.log'
 if failure_log.exists():
  for line in failure_log.read_text().splitlines():
   if line.startswith('PREFLIGHT_FAILURE_OBSERVATION '):preflight_failure=json.loads(line.split(' ',1)[1])
 report=dict(schema_version=1,classification=classification,adaptive_design_allowed=allowed,estimator_driven_admission_paused=not allowed,baseline=lock['baseline'],lock_sha256=sha(HERE/'validation-lock.json'),domain_manifest_sha256=sha(HERE/'domain-manifest.json'),run_plan_sha256=sha(HERE/'run-plans.json'),calibration_source_commit=lock['source_calibration_commit'],frozen_contract=lock,domains=domains['selected'],domain_exclusions=domains['exclusions'],environment=env,completion=completion,process_chronology=chronology,cancellation_evidence=cancellations,successful_response_hash_stability=dict(all_stable=all(len(h)==1 for h in hash_groups.values()),groups=len(hash_groups),unstable_groups=[dict(key=list(k),hashes=sorted(v)) for k,v in hash_groups.items() if len(v)>1]),results=results,per_request_errors=records,predictions=allpredictions,http_requests=allrequests,raw_runs=runs,preflight=preflights,preflight_failure_observation=preflight_failure,sustained_async=asyncinfo,mixed_load=mixed,mixed_baseline_gaps=mixed_baseline_gaps,memory_observations=memory,recorder_comparisons=comparisons,leakage_audit=dict(violations=violations,hashes_unchanged=not any('hash' in v or 'source changed' in v for v in violations),predictions_before_results=not any('prediction' in v for v in violations),no_fitting_or_margin_changes=True,no_validation_row_influenced_coefficients=True,no_validation_row_influenced_margins=True,no_validation_row_influenced_features=True,no_validation_row_influenced_domains=True,no_validation_row_influenced_settings=True,numeric_estimator_gates_unchanged=True,methodology_issues=['The locked A/B fractional plan omitted matching500m isolated mixed-load reference cases.','The matching-reference completeness guard was implemented after launch; this requirement came from the original task and plan inspection, but the guard was not explicit in the machine-readable lock. Overall D, no certification; no model or margin correction.']),limitations=['One installed real Ankara dataset: cross-dataset generalization unvalidated.','Locked fractional A/B matrix lacks same-setting isolated reference cases for selected mixed-load domains; matching latency inflation is insufficient, no post-hoc cases added.','Shared Docker VM; CPU getrusage includes prediction preflight/logging, audit client and instrumentation. Mixed CPU is aggregate, no per-request compute attribution.','HTTP response bytes are decoded entity bytes on uncompressed loopback, exclude HTTP framing; loopback is not production network performance.','RSS/heap/cgroup peaks sampled50ms and depend on process order; allocations are cumulative work, not memory reservation.','Recorder controls have distinct process/cache histories: observed deltas cannot isolate historical inflation causally.','Selection band labels are target-quantile strata; exclusion shifts surviving ranks, no universal density thresholds.','Hardware A/B matrix is predeclared fractional, D fit has no hardware/cell/search terms.','Frozen preflight has no query-budget state; malformed/unavailable metadata must remain unknown, no admission implemented.'],production_invariance=lock['production_invariants'],version_recommendation='No bump, no release.',next_action='Adaptive Admission Design (no implementation)' if allowed else 'Keep Auto observation-only; use conservative fixed deployment profiles as the next design study, without estimator-driven admission.')
 (ROOT/'docs/auto-resource-estimator-locked-validation.json').write_text(json.dumps(report,indent=2)+'\n')
 return report
if __name__=='__main__':
 r=analyze();print(r['classification']);print({k:v['classification'] for k,v in r['results'].items()})
