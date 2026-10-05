#!/usr/bin/env python3
"""Independent terminal audit of scope, provenance, every row and required deliverables."""
import collections,datetime,gzip,hashlib,json,pathlib,re,subprocess
from protocol import HERE,ROOT,WORK,load,sha,verify,numerical,overlap,background_failures,mixed_guard
from client import encode,canonical
from analyze import archive
from runtime import auto_validate
from precheck import verify_case,behavior
OBJECTIVE=pathlib.Path('/Users/berkunsal/.codex/attachments/c251bcbd-628e-40b1-a83f-205b961f5443/goal-objective.md')
def row_gate_failures(row,limit,background=None):
 """Reconcile the frozen gates without demanding that a negative observation pass."""
 reasons=[]
 if not numerical(row,limit):reasons.append('HTTP/stream/time/memory/control/slot gate')
 if row['operation'] in ['two-optimizers','optimize-evaluate','two-evaluates'] and not overlap(row['responses']):reasons.append('interactive requests did not overlap')
 if row['operation'].startswith(('async-','sustained-')):reasons+=background_failures(row,background) if background else ['missing background evidence']
 return reasons

def reconcile_verdict(profile,has_methodology_violation,has_interruption,science_stable):
 expected='INVALID / INSUFFICIENT' if not profile['complete'] or has_methodology_violation or has_interruption else 'NOT CERTIFIED W1' if profile['failure_cases'] or not science_stable else 'CERTIFIED W1'
 assert profile['verdict']==expected,(profile['verdict'],expected)
 return expected

def verify_container(inspection,identity,shipping,profile):
 assert inspection['Image']==shipping['image_id']
 limits=inspection['HostConfig'];assert limits['NanoCpus']==profile['cpus']*1_000_000_000
 assert limits['Memory']==limits['MemorySwap']==profile['memory_gib']*(1<<30)
 env=dict(v.split('=',1) for v in inspection['Config']['Env'])
 assert not any(k in env for k in ['GOMAXPROCS','GOGC','GOMEMLIMIT','RF_API_KEY','TRUSTED_PROXIES'])
 assert env['GODEBUG']=='gctrace=1' and inspection['Config']['User']=='atom'
 assert identity['primary_executable_sha256']==shipping['binary_sha256']
 assert identity['primary_cgroup']!=identity['observer_cgroup'] and './server' in identity['primary_cmdline']

def budget_observation(row):
 """Actual attempt headers, including the follow-up charged to the original client."""
 expected={'evaluate-maps':7,'optimize-maps':7,'explain':2,'cycle':15}.get(row['operation'])
 if expected is None:return None
 rs=row['responses'];same_client=len({r['client_ip'] for r in rs})==1
 headers=[r['remaining'] for r in rs];probe=row['slot_probes'][0]
 passed=len(rs)==expected and same_client and headers==[str(19-i) for i in range(expected)] and probe['client_ip']==rs[0]['client_ip'] and probe['remaining']==str(19-expected)
 return {'operation':row['operation'],'expected_attempts':expected,'observed_attempts':len(rs),'remaining':headers,'same_client_followup_remaining':probe['remaining'],'passed':passed}

def audit():
 lock=verify();r=load(ROOT/'docs/w1-shipping-runtime-qualification.json');plans=load(HERE/'run-plans.json');assert r['all_planned_complete'] and r['observed_groups']==r['planned_groups']==1677
 baseline_checks=load(HERE/'baseline-checks.json');assert len(baseline_checks)==9 and all(q['exit_code']==0 for q in baseline_checks.values())
 assert sha(HERE/'domain-manifest.json')==sha(ROOT/'scripts/fixed-deployment-profiles/domain-manifest.json')
 prior=load(ROOT/'scripts/fixed-deployment-profiles/certification-lock.json')
 for path in (HERE/'fixtures').glob('*.json'):assert sha(path)==prior['fixture_sha256'][path.name]
 assert lock['gates']['request_elapsed_max_seconds']==45 and lock['gates']['deadline_headroom_min_seconds']==15 and lock['gates']['memory_peak_max_fraction']==.75
 assert lock['controls']['surface']['expected_status']==400
 execution=load(HERE/'execution.json');assert list(execution['batches'])==lock['batch_order'] and all(q['exit_code']==0 for q in execution['batches'].values())
 assert len({q['container_id'] for q in execution['batches'].values()})==33
 producer=load(HERE/'producer-precheck.json');assert producer['all_complete'] and len(producer['cases'])==5
 for proof in lock['background']['precheck']:
  folder=WORK/proof['label'];assert verify_case(folder)==proof
  assert behavior(folder/'client.py')==behavior(HERE/'client.py')
  assert datetime.datetime.fromisoformat(load(folder/'precheck-result.json')['tail']['end'])<datetime.datetime.fromisoformat(lock['locked_at'])
  for name,digest in proof['source_sha256'].items():assert sha(folder/name)==digest
 assert len(plans)==33 and r['shipping']['go_version']=='go1.26.6';all_rows={};count=0;checks=[];evidence=[];budgets=[];independent_science=collections.defaultdict(lambda:{'hashes':set(),'profiles':set()})
 for label,cases in plans.items():
  folder=WORK/label;rows=[json.loads(line) for line in (folder/'runs.jsonl').read_text().splitlines()];all_rows[label]=rows;assert len(rows)==len(cases)
  auto_validate(load(folder/'auto.json'),lock['profiles'][label[0]])
  meta=load(folder/'pre-rf-verification.json');assert all(meta[k] for k in ['auto_valid','external_constraints_valid','shipping_startup_auto_valid'])
  assert meta['image_id']==lock['shipping']['image_id'];identity=load(folder/'process-identity.json')
  verify_container(load(folder/'docker-inspect.json'),identity,lock['shipping'],lock['profiles'][label[0]])
  assert ('-fresh-' in label)==(not (folder/'warmup.json').exists())
  startup=load(folder/'startup.json');assert datetime.datetime.fromisoformat(startup['started_at'])<datetime.datetime.fromisoformat(startup['ready_at'])<datetime.datetime.fromisoformat(meta['verified_at'])
  if '-fresh-' not in label:
   warmup=load(folder/'warmup.json');assert warmup['status']==200 and warmup['endpoint']=='/api/simulate' and warmup['stream_complete']
  for i,(case,row) in enumerate(zip(cases,rows)):
   fixture=load(HERE/'fixtures'/(case['fixture']+'.json'));assert fixture['level']=='W1' and (fixture['rays'],fixture['radius'],fixture['n'])==(120,400,6)
   assert all(row[k]==v for k,v in dict(case,plan_index=i,batch=label,profile=label[0],domain=fixture['domain'],band=fixture['band'],frequency_ghz=fixture['frequencyGHz'],qualification_lock_sha256=sha(HERE/'qualification-lock.json')).items())
   assert datetime.datetime.fromisoformat(meta['verified_at'])<datetime.datetime.fromisoformat(row['started_at'])
   assert datetime.datetime.fromisoformat(lock['locked_at'])<datetime.datetime.fromisoformat(row['started_at'])
   assert len(row['slot_probes'])==2 and len({q['client_ip'] for q in row['slot_probes']})==2
   if row['operation'] in ['two-optimizers','optimize-evaluate','two-evaluates']:assert len(row['responses'])==2 and len({q['client_ip'] for q in row['responses']})==2
   if row['operation']=='cancel':assert row['slot_probes'][0]['client_ip']==row['responses'][0]['client_ip']
   for response in row['responses']+row['slot_probes']:
    assert response['client_ip'].startswith('127.') and response['method']=='POST'
    assert abs(response['utc_seconds']-(datetime.datetime.fromisoformat(response['end']).timestamp()-datetime.datetime.fromisoformat(response['start']).timestamp()))<.00001
    assert response['elapsed_seconds']==max(response['utc_seconds'],response['monotonic_seconds'])
    assert response['clock_discontinuity']==(abs(response['utc_seconds']-response['monotonic_seconds'])>1)
    if response['endpoint'] in ['/api/evaluate-network','/api/optimize-network','/api/building-entry-analysis']:assert response['request_sha256']==hashlib.sha256(encode(fixture['network'])).hexdigest()
    if response['endpoint']=='/api/building-entry-analysis' and response['status']==200:
     body=WORK/response['science_file'];assert sha(body)==response['sha256'];assert canonical(body.read_bytes())==response['scientific_sha256']
    if response['status']==200 and response['stream_complete']:
     key=(response['endpoint'],response['request_sha256']);entry=independent_science[key]
     entry['hashes'].add(response['scientific_sha256'] if response['endpoint']=='/api/building-entry-analysis' else response['sha256']);entry['profiles'].add(row['profile'])
   data=None
   if row['operation'].startswith(('async-','sustained-')):
    data=load(WORK/row['extra']['background_file']);actual=background_failures(row,data)
    reported=next(x for x in r['profiles'][label[0]]['async_results'] if x['batch']==label and x['index']==i)
    assert actual==[x for x in reported['failure_reasons'] if x!='HTTP/stream/time/memory/control/slot gate']
   reasons=row_gate_failures(row,lock['profiles'][label[0]]['memory_gib']*(1<<30),data)
   reported=[z for z in r['profiles'][label[0]]['failure_cases'] if z['batch']==label and z['index']==i]
   assert ([z['reasons'] for z in reported]==[reasons]) if reasons else not reported
   budget=budget_observation(row)
   if budget:budgets.append(dict(budget,batch=label,index=i))
   checks.append({'batch':label,'index':i,'operation':row['operation'],'numerical_pass':numerical(row,lock['profiles'][label[0]]['memory_gib']*(1<<30)),'failure_reasons':reasons});count+=1
  for p in folder.iterdir():
   if p.is_file():evidence.append(archive(p,label+'-'+p.name))
 for p in ['A','B','C']:
  mixed_guard(plans,all_rows,p)
  guard=load(HERE/('mixed-guard-'+p+'.json'));assert guard['passed']
  mixed_started=min(datetime.datetime.fromisoformat(q['started_at']) for label,batch in all_rows.items() if label.startswith(p+'-mixed-') for q in batch)
  single_finished=max(datetime.datetime.fromisoformat(q['finished_at']) for label,batch in all_rows.items() if label.startswith(p+'-single-') for q in batch)
  assert single_finished<datetime.datetime.fromisoformat(guard['verified_at'])<mixed_started
  reconcile_verdict(r['profiles'][p],bool(r['methodology_violations']),any(e['profile']==p for e in r['interrupted_observations']),r['scientific_invariance']['stable'])
 assert r['scientific_invariance']['groups']==len(independent_science)
 assert r['scientific_invariance']['groups_compared_all_ABC']==sum(x['profiles']=={'A','B','C'} for x in independent_science.values())
 assert r['scientific_invariance']['stable']==(bool(independent_science) and all(len(x['hashes'])==1 for x in independent_science.values()))
 assert len(budgets)==480
 if not all(z['passed'] for z in budgets):raise ValueError('reported workflow budget invariance requires investigation; keep actual evidence')
 for p in ['A','B','C']:
  counts=collections.defaultdict(list)
  for label,batch in all_rows.items():
   if label.startswith(p+'-single-'):
    for q in batch:
     if q['operation'] in lock['W1']['operations']:counts[q['operation'],q['band'],q['frequency_ghz']].append(q)
  assert len(counts)==10*4*2
  for group in counts.values():
   assert sorted(q['repeat'] for q in group)==list(range(5))
   assert sorted(collections.Counter(q['domain'] for q in group).values())==[2,3]
  assert len([q for label,batch in all_rows.items() if label.startswith(p+'-fresh-') for q in batch])==6
  operations=collections.Counter(q['operation'] for label,batch in all_rows.items() if label.startswith(p+'-mixed-') for q in batch)
  assert operations==collections.Counter({name:12 for name in ['two-optimizers','optimize-evaluate','two-evaluates','async-optimize','async-evaluate','sustained-optimize','sustained-evaluate']})
  for label,batch in all_rows.items():
   if label.startswith(p+'-fresh-'):
    assert len(batch)==1 and batch[0]['operation']=='optimize' and batch[0]['frequency_ghz']==2.6 and batch[0]['band'] in ['sparse','dense']
 sleep=load(HERE/'sleep-prevention.json')
 assert sleep['mechanism']=='caffeinate -i' and datetime.datetime.fromisoformat(sleep['started_at'])<datetime.datetime.fromisoformat(lock['locked_at'])
 if sleep['ended_at']:
  assert datetime.datetime.fromisoformat(sleep['ended_at'])>datetime.datetime.fromisoformat(execution['finished_at'])
 else:assert 'caffeinate -i' in subprocess.check_output(['ps','-p',str(sleep['pid']),'-o','command='],text=True)
 assert r['production_invariants']==lock['production_invariants'] and not r['Auto_descriptive_matching_implemented'] and r['estimator_admission_paused']
 certified=[p for p in ['A','B','C'] if r['profiles'][p]['verdict']=='CERTIFIED W1'];assert certified==r['certified_profiles']
 assert r['minimum_certified_profile']==(certified[0] if certified else None)
 assert r['recommended_profile'] in certified if certified else r['recommended_profile'] is None
 assert r['Auto_descriptive_design']['implemented'] is False and r['Auto_descriptive_design']['unknown_never_satisfies'] is True
 # Original failed protocol iterations remain archived alongside the successful proofs.
 for pattern in ['precheck-C-*','smoke-*','producer-final-*','producer-v2-*','producer-v3-*']:
  for folder in WORK.glob(pattern):
   if folder.is_dir():
    for p in folder.iterdir():
     if p.is_file():evidence.append(archive(p,'audit-'+folder.name+'-'+p.name))
 for p in (WORK/'baseline-checks').glob('*.log'):evidence.append(archive(p,'audit-baseline-'+p.name))
 for p in (WORK/'precheck-source-versions').glob('*'):
  if p.is_file():
   assert p.name.split('-',1)[0]==sha(p);evidence.append(archive(p,'audit-source-version-'+p.name))
 for p in WORK.glob('*.log'):
  # A live pipeline/finish log is deliberately not archived until its process is terminal.
  if p.name not in ['pipeline.log','finish.log','copy-precheck-sources.log']:evidence.append(archive(p,'audit-'+p.name))
 for p in [WORK/'shipping-build-metadata.txt',WORK/'shipping-image-inspect.json']:
  evidence.append(archive(p,'audit-'+p.name))
 # The contract, fixtures and original metadata are already immutable checked-in inputs.
 # Archive terminal execution/proof metadata as well, so a temporary workspace is unnecessary.
 for name in ['execution.json','producer-precheck.json','producer-precheck-v1.json','baseline-checks.json','shipping-image.json','observer-image.json','precheck-correction.json','precheck-rotation-correction.json','checks.json']:
  evidence.append(archive(HERE/name,'audit-metadata-'+name))
 docs=load(HERE/'runtime-observation-documentation.json');assert docs['go_version']=='go1.26.6' and sha(HERE/docs['preserved_copy'])==docs['source_sha256']
 for name in ['runtime-observation-documentation.json',docs['preserved_copy'],docs['license_copy']]:evidence.append(archive(HERE/name,'audit-runtime-doc-'+name))
 assert 'finish.py exit 0' in (WORK/'pipeline.log').read_text(),'pipeline must be terminal before archiving its output'
 for name in ['pipeline.log','finish.log']:evidence.append(archive(WORK/name,'audit-'+name))
 for entry in evidence+r['evidence']:
  p=ROOT/entry['path'];assert sha(p)==entry['sha256'];assert hashlib.sha256(gzip.decompress(p.read_bytes())).hexdigest()==entry['uncompressed_sha256']
 quality=load(HERE/'checks.json');assert all(v['exit_code']==0 for v in quality.values())
 required_checks={'backend_tests','backend_race','backend_vet','frontend_tests','frontend_lint','frontend_build','rf_budget_e2e','rf_deadline_e2e','auto_resource_profile_tests','qualification_protocol_tests','prior_study_preservation_tests','docs_build','docs_validation','version','diff','final_docs_build','final_docs_validation','final_diff'}
 assert set(quality)==required_checks
 source_names=subprocess.check_output(['git','diff','--name-only',lock['baseline']['head'],'--','backend-go','frontend-react/src','data-pipeline','Dockerfile','VERSION','core-lab-adapter'],text=True,cwd=ROOT).strip();assert not source_names
 untracked_source=subprocess.check_output(['git','ls-files','--others','--exclude-standard','--','backend-go','frontend-react/src','data-pipeline','Dockerfile','VERSION','core-lab-adapter'],text=True,cwd=ROOT).strip();assert not untracked_source
 assert (ROOT/'VERSION').read_text().strip()==lock['baseline']['version'];assert count==1677
 assert subprocess.check_output(['git','rev-parse','HEAD'],text=True,cwd=ROOT).strip()==lock['baseline']['head']
 request=OBJECTIVE.read_text();titles=re.findall(r'^PHASE (\d+) — (.+)$',request,re.M);assert len(titles)==40 and [int(n) for n,_ in titles]==list(range(40))
 final=request.split('FINAL RESPONSE — REQUIRED')[1];items=re.findall(r'^(\d+)\. (.+)$',final,re.M);assert len(items)==66 and [int(n) for n,_ in items]==list(range(1,67))
 paths={0:'baseline.json,baseline-checks.json',1:'qualification-lock.json',2:'shipping-image.json,build_metadata,eachprocess-identity.json',3:'eachDockerinspection/Auto',4:'dataset/Auto/hashes',5:'W1fixtures/lock',6:'domain-manifest.json',7:'surface-controls',8:'gates/numerical',9:'cgroupmemory',10:'timing_protocol/interrupted_observations/sleep-prevention',11:'client.py/actualTCPledgers',12:'run-plans/repeats',13:'run_plan_sha256/seed',14:'warmup.json',15:'fresh/startup.json',16:'profiles.W1_single',17:'profiles.concurrency',18:'mixed-guardABC.json',19:'normal_async/async_results',20:'background/producer_precheck',21:'perrequestnativeintervalchecks',22:'fiveproducer-v3proofs',23:'sustained_async/async_results',24:'async*.json',25:'cancellation/slotprobes',26:'budget/remainingheaders',27:'scientific_invariance',28:'BuildingEntrybody/scientific_sha256',29:'profiles.A.verdict',30:'profiles.B.verdict',31:'profiles.C.verdict',32:'minimum_certified_profile',33:'recommended_profile/recommendation_comparison',34:'W1-onlyCrole',35:'Auto_descriptive_design',36:'reportexactscope',37:'input/sourcehashes/production_invariants',38:'VERSION/versioncheck',39:'checks.json/logs'}
 output={'schema_version':1,'audited_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'objective_sha256':sha(OBJECTIVE),'result':'Completed measurements/evidence reconciled; every negative finding retained','groups_verified':count,'batches_verified':len(plans),'preserved_historical_artifacts':len(lock['baseline']['preserved_sha256']),'qualified_profiles':r['certified_profiles'],'phase_coverage':[{'phase':int(n),'title':title,'status':'completed and reconciled; negative qualification results retained','evidence':paths[int(n)]} for n,title in titles],'final_report_items':[{'number':int(n),'label':label} for n,label in items],'per_group_numerical_audit':checks,'workflow_budget_observations':budgets,'additional_archived_evidence':evidence,'quality':quality}
 (HERE/'completion-audit.json').write_text(json.dumps(output,indent=2)+'\n');print('AUDIT PASS',count,'groups',len(plans),'batches',len(evidence),'additionalarchiveentries,40phases,66items')
 return output
if __name__=='__main__':audit()
