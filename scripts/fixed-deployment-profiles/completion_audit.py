#!/usr/bin/env python3
"""Independently reconcile completed ledgers and archived evidence; never qualify failures."""
import collections, datetime, gzip, hashlib, json, pathlib, re, subprocess
from analyze import directory, stamp
from protocol import HERE, ROOT, WORK, assert_mixed_references, lines, load, sha, verify
from supplement_input_audit import verify_supplement

REQUEST = pathlib.Path('/Users/berkunsal/.codex/attachments/301e9d9e-fd55-4bcf-a1c0-b7db9d6bacd6/Pasted text.txt')

def preserve(path, alias):
 target = HERE/'evidence'/(alias+'.gz')
 payload = gzip.compress(path.read_bytes(), mtime=0)
 if target.exists() and target.read_bytes()!=payload:
  raise ValueError('refuse replacement of evidence: '+str(target))
 if not target.exists():target.write_bytes(payload)
 return {'path':str(target.relative_to(ROOT)), 'sha256':sha(target), 'uncompressed_sha256':sha(path)}

def audit():
 lock = verify()
 plans = load(HERE/'run-plans.json')
 sections = [('main',lock,plans)]
 for kind in ['workflow','surface','science']:
  supplement=load(HERE/(kind+'-supplement-lock.json'))
  assert sha(HERE/(kind+'-supplement-lock.json'))==(HERE/(kind+'-supplement-lock.sha256')).read_text().split()[0]
  verify_supplement(kind,'after')
  sections.append((kind,supplement,supplement['plans']))
 result=load(ROOT/'docs/fixed-deployment-profile-certification.json')
 assert result['all_planned_complete'] and result['observed_groups']==result['planned_groups']==2704
 assert len(result['completion'])==47 and all(v['complete'] for v in result['completion'].values())
 assert result['certified_profile_ids']==[] and result['minimum_certified_profile'] is None and result['recommended_certified_profile'] is None
 assert result['scientific_invariance']['stable']
 rows_by_batch={}; count=0; errors=[]; extra=[]; freeze_order=[]
 for kind,contract,batches in sections:
  section_rows=[]
  for label,cases in batches.items():
   folder=directory(label); rows=lines(folder/f'runs-{label}.jsonl'); rows_by_batch[label]=rows; section_rows+=rows
   if len(rows)!=len(cases):errors.append(f'{label}: planned/observed count')
   if load(folder/f'plans-{label}.json')!=cases:errors.append(f'{label}: runtime plan differs')
   extra.append(preserve(folder/f'plans-{label}.json',f'completed-plan-{label}.json'))
   for i,(case,row) in enumerate(zip(cases,rows)):
    f=load(folder/(case['fixture']+'.json'))
    cells=1 if case['operation'] in ['simulate','surface','azimuth'] else 5 if case['operation']=='recommendation' else f['n']
    expected={'plan_index':i,'profile':label,'domain':f['domain'],'band':f['band'],'split':f['split'],'level':f['level'],'frequency_ghz':f['frequencyGHz'],'rays':f['rays'],'radius_m':f['radius'],'cells':cells,'repeat':case['repeat'],'operation':case['operation'],'lock_sha256':sha(HERE/'certification-lock.json')}
    mismatched=[k for k,v in expected.items() if row.get(k)!=v]
    if mismatched:errors.append(f'{label}[{i}]: '+','.join(mismatched))
    if row['response_bytes']!=sum(r['response_bytes'] for r in row['responses']):errors.append(f'{label}[{i}]: response-byte accounting')
    if any(r['status']!=0 and (len(r['sha256'])!=64 or len(r['request_sha256'])!=64) for r in row['responses']):errors.append(f'{label}[{i}]: missing HTTP identity')
    count+=1
  first=min(stamp(row['started_at']) for row in section_rows)
  frozen=stamp(contract['locked_at'])
  assert frozen<first, kind+' measurements preceded freeze'
  freeze_order.append({'contract':kind,'locked_at':contract['locked_at'],'first_measured_group':first.isoformat(),'freeze_precedes_measurement':True})
  folder=directory(next(iter(batches)))
  extra.append(preserve(folder/'environment.json',f'completed-environment-{kind}.json'))
 assert not errors, str(errors[:10])+f'; total errors={len(errors)}'
 assert count==2704
 for profile in ['A','B','C']:assert_mixed_references(plans,rows_by_batch,profile)
 for f in sorted((WORK/'geometry').glob('*-W*.json')):extra.append(preserve(f,'completed-fixture-'+f.name))
 assert len(lock['fixture_sha256'])==64
 extra.append(preserve(WORK/'geometry'/'supplement-input-audit.jsonl','completed-supplement-input-audit.jsonl'))
 extra.append(preserve(HERE/'checks.json','completed-original-checks.json'))
 checks=load(HERE/'checks.json')
 for name,record in checks.items():
  assert record['exit_code']==0,name
  extra.append(preserve(WORK/'geometry'/'checks'/(name+'.log'),'completed-check-'+name+'.log'))
 post=HERE/'post-audit-checks.json'
 if post.exists():
  for name,record in load(post).items():
   assert record['exit_code']==0,name
   extra.append(preserve(WORK/'geometry'/'checks'/(name+'.log'),'completed-check-'+name+'.log'))
  extra.append(preserve(post,'completed-post-audit-checks.json'))
 all_evidence=result['evidence']+result['baseline_evidence']['evidence']+extra
 for entry in all_evidence:
  p=ROOT/entry['path']
  assert sha(p)==entry['sha256'],str(p)
  assert hashlib.sha256(gzip.decompress(p.read_bytes())).hexdigest()==entry['uncompressed_sha256'],str(p)
 unchanged=['backend-go','frontend-react','core-lab-adapter','data-pipeline','Dockerfile','docker-compose.yml','VERSION','docs/deployment.md','scripts/auto-resource-geometry','scripts/auto-resource-estimator-validation']
 diff=subprocess.check_output(['git','diff','--name-only',lock['baseline']['head'],'--',*unchanged],cwd=ROOT,text=True)
 assert not diff,'production/prior artifact changes: '+diff
 assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==lock['baseline']['head']
 assert (ROOT/'VERSION').read_text().strip()==lock['baseline']['version']
 notes=[
  'Clean baseline and successful checks; original excluded E2E invocations retained.',
  'Main successor and each supplement frozen before their measurements; no gate relaxed.',
  'A/B/C bounded profiles and D control recreated; exact quotas and memory documented.',
  'Resource floors require tested runtime, dataset, workloads and policy assumptions.',
  'All 47 batch Auto records valid before RF; Docker inspection supplies known provenance.',
  'Exact Ankara 2026.07 pack and two file hashes; indexed counts recorded.',
  'Exact pack only; no general dataset complexity ceiling inferred.',
  'Eight domains, two per band; fitting excluded; validation reuse disclosed.',
  'W1/W2/W3 preregistered; no UI class selector added.',
  'All W1 operations and complete Optimize/explanation supplement completed.',
  'All moderate W2 operations completed, including bounded alternate search.',
  'Valid W3 probes completed; invalid 5 m controls preserved alongside valid 10 m supplement.',
  'Legacy, bounded multi-start and bounded Pareto archive searches measured unchanged.',
  'Observable completion, invariance, cancellation and headroom gates frozen.',
  '75% kernel hard-limit peak gate; startup/cache included; RSS not reservation.',
  'Throttling observed; no zero-throttle requirement or compute estimator.',
  'Streaming response bytes recorded per response and logical workflow.',
  'Real TCP/production Gin/middleware/serialization; streaming client.',
  'All 2704 planned groups completed without replacing failures.',
  'Seed 20261005 and balanced Latin profile order frozen.',
  'Warmed service plus 18 fresh first requests; startup cost separate.',
  'W1 and W2 single results, including interrupted and failed repeats, recorded.',
  'All three required distinct-client concurrency scenarios measured.',
  'Production concurrency retained; no general support claim for any candidate.',
  'Normal async actual overlap passed 72/72 with worker1/queue16.',
  'Sustained actual evidence passed 51/72; all 21 failed cases retained.',
  'Exact five-repeat mixed references required and verified before launch.',
  'Cancellation/release passed 36/36; same/other-client follow-ups verified.',
  '7/7/2/15 workflow attempts; 20/min policy and ClientIP unchanged.',
  '584 canonical request groups invariant; elapsed_ms-only correction audited.',
  'A NOT CERTIFIED; numerical W1 pass does not override protocol failures.',
  'B NOT CERTIFIED; numerical W1 pass does not override protocol failures.',
  'C NOT CERTIFIED at measured 8CPU/10GiB; interrupted W1 retained.',
  'D unbounded control measured, never certified.',
  'Latency, headroom, contention, volume and throttling compared without monotonicity assumption.',
  'No minimum reference certified.',
  'No recommended reference certified.',
  'No candidate certified for heavier W2; W3 best effort.',
  'Full requested matrix published; W2 contention explicitly NOT TESTED.',
  'Valid heavy inputs remain available outside any interactive guarantee.',
  'W3 60-second timeouts retained as workload-boundary observations.',
  'Descriptive Auto matching design only; no production matcher/admission.',
  'Known CPU, hard/effective memory, runtime, exact pack and fixed policy required.',
  'Auto-only UX retained; no CPU/RAM/profile/preset controls.',
  'Self-hosted/native/hosted implications documented; no packaging change.',
  'Six-Cell cap retained; no foundation yet for eight-Cell re-audit.',
  'Estimator fitting, retuning and admission remain paused.',
  'Historical unknown-zero prototype retained; audit-only unknown/null successor tested.',
  'Markdown/JSON/HTML completed with evidence, limitations and negative verdicts.',
  'No certified profile; deployment documentation correctly left unchanged.',
  'VERSION0.11.0 retained; no release, tag or publishing.',
  'All required quality commands successful; original and post-audit outputs preserved.'
 ]
 assert len(notes)==52
 request=REQUEST.read_text()
 titles=re.findall(r'^PHASE (\d+) — (.+)$',request,re.M)
 assert len(titles)==52 and [int(n) for n,_ in titles]==list(range(52))
 final=request.split('FINAL RESPONSE — REQUIRED')[1]
 required=re.findall(r'^(\d+)\. (.+)$',final,re.M)
 assert len(required)==65 and [int(n) for n,_ in required]==list(range(1,66))
 output={'schema_version':1,'audited_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'audit_result':'PASS — completed evidence is intact; negative certification verdicts retained','measurement_identity_groups':count,'batch_auto_snapshots':47,'archive_entries_verified':len(all_evidence),'freeze_order':freeze_order,'unchanged_paths':unchanged,'methodology_violations_retained':result['methodology_violations'],'phase_coverage':[{'phase':int(n),'title':title,'finding':notes[int(n)]} for n,title in titles],'required_final_report_items':[{'number':int(n),'label':label} for n,label in required],'supplementary_evidence':extra,'original_quality_checks':checks,'post_audit_quality_checks':load(post) if post.exists() else {}}
 (HERE/'completion-audit.json').write_text(json.dumps(output,indent=2)+'\n')
 print(f'Audit PASS: {count} plan/fixture identities; 47 batches; {len(all_evidence)} archive entries; 52 phases; 65 final items.')
 return output

if __name__=='__main__':audit()
