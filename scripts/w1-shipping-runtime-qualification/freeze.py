#!/usr/bin/env python3
"""Freeze W1-only successor after producer proof, before any scoring request."""
import datetime,json,pathlib,random,subprocess
from protocol import HERE,ROOT,WORK,load,sha,preserved,baseline_requirements
from precheck import behavior,verify_case,CASES

def write(name,value):
 p=HERE/(name+'.json')
 with p.open('x') as out:json.dump(value,out,indent=2,sort_keys=True);out.write('\n')
 with (HERE/(name+'.sha256')).open('x') as out:out.write(sha(p)+'  '+p.name+'\n')
def freeze():
 if (HERE/'qualification-lock.json').exists():raise ValueError('already frozen; no overwrite')
 if list(WORK.glob('?/runs.jsonl')) or any((p/'runs.jsonl').exists() for p in WORK.glob('?-*')):raise ValueError('qualification evidence already exists')
 preserved();checks=load(HERE/'baseline-checks.json');assert len(checks)==9 and all(r['exit_code']==0 for r in checks.values())
 pre=load(HERE/'producer-precheck.json');assert pre['all_complete'] and len(pre['cases'])==5
 prechecks=[]
 for profile,fixture in CASES:
  folder=WORK/('producer-v3-'+profile+'-'+fixture.removesuffix('-W1.json'));proof=verify_case(folder)
  assert proof['producer_behavior_sha256']==behavior(HERE/'client.py'),'producer/transport changed since precheck'
  for name,digest in proof['source_sha256'].items():assert sha(folder/name)==digest,'precheck source copy mismatch'
  prechecks.append(proof)
 manifest=load(ROOT/'scripts/fixed-deployment-profiles/certification-lock.json');dataset=manifest['dataset']
 for filename,digest in dataset['sha256'].items():assert sha(ROOT/'data-pipeline'/filename)==digest
 assert sha(HERE/'domain-manifest.json')==sha(ROOT/'scripts/fixed-deployment-profiles/domain-manifest.json')
 selected=load(HERE/'domain-manifest.json')['selected'];bands=['sparse','medium','dense','very-dense'];by={b:[d for d in selected if d['band']==b] for b in bands};assert all(len(v)==2 for v in by.values())
 ops=manifest['workloads']['W1']['operations'];plans={};order=[];seed=20261005
 def case(d,freq,op,repeat):return {'fixture':f"{d['id']}-{freq}-W1",'operation':op,'repeat':repeat}
 for segment,profiles in enumerate([['A','B','C'],['B','C','A'],['C','A','B']]):
  for p in profiles:
   rows=[]
   for band in bands:
    for freq in [2.6,28]:
     for repeat in [[0,1],[2,3],[4]][segment]:
      rows.extend(case(by[band][repeat%2],freq,op,repeat) for op in ops)
      if band in ['sparse','dense']:rows.extend(case(by[band][0],freq,op,repeat) for op in ['evaluate','optimize'])
   random.Random(seed+segment*1000+ord(p)).shuffle(rows);label=f'{p}-single-{segment}';plans[label]=rows;order.append(label)
 for p in ['B','C','A']:
  rows=[case(by[b][0],f,op,r) for b in ['sparse','dense'] for f in [2.6,28] for r in range(3) for op in ['two-optimizers','optimize-evaluate','two-evaluates','async-optimize','async-evaluate','sustained-optimize','sustained-evaluate']]
  random.Random(seed+2000+ord(p)).shuffle(rows);label=p+'-mixed-0';plans[label]=rows;order.append(label)
 for p in ['C','A','B']:
  rows=[case(by[b][0],f,'cancel',r) for b in ['sparse','dense'] for f in [2.6,28] for r in range(3)]
  rows.extend(case(d,f,'surface-control',0) for d in selected for f in [2.6,28]);rows.append(case(by['sparse'][0],2.6,'budget',0))
  random.Random(seed+3000+ord(p)).shuffle(rows);label=p+'-controls-0';plans[label]=rows;order.append(label)
 for r in range(3):
  for b in ['sparse','dense']:
   for p in [['A','B','C'],['B','C','A'],['C','A','B']][r]:
    label=f'{p}-fresh-{b}-{r}';plans[label]=[case(by[b][0],2.6,'optimize',r)];order.append(label)
 write('run-plans',plans)
 files=subprocess.check_output(['git','ls-files','backend-go','frontend-react/src','data-pipeline/manifest.json','Dockerfile','VERSION'],text=True).splitlines()
 files += [str(p.relative_to(ROOT)) for p in HERE.iterdir() if p.name in ['client.py','runtime.py','protocol.py','freeze.py','run.py','precheck.py']]
 inputs={name:sha(ROOT/name) for name in files if (ROOT/name).is_file()};inputs.update({'data-pipeline/'+f:d for f,d in dataset['sha256'].items()})
 lock={'schema_version':1,'locked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseline':load(HERE/'baseline.json'),'shipping':load(HERE/'shipping-image.json')|{'binary_sha256':sha(WORK/'shipping-server'),'build_metadata':(WORK/'shipping-build-metadata.txt').read_text(),'go_version':'go1.26.6','GOOS':'linux','GOARCH':'arm64','CGO_ENABLED':'0','observation_flag':'GODEBUG=gctrace=1; log-only heap diagnostics; no GC/scheduler tuning'},'observer':load(HERE/'observer-image.json'),'dataset':dataset,'profiles':{'A':{'cpus':2,'memory_gib':4},'B':{'cpus':4,'memory_gib':8},'C':{'cpus':8,'memory_gib':10}},'scope':'Exact prior W1 only; no W2/W3 qualification','W1':manifest['workloads']['W1'],'frequencies_ghz':[2.6,28],'interference_bandwidth_mhz':{'2.6':20,'28':100},'domain_manifest_sha256':sha(HERE/'domain-manifest.json'),'domains':[d['id'] for d in selected],'repeats':{'critical_per_band_frequency_profile':5,'paired_domains':'3/2 alternating','mixed_per_domain_frequency_profile':3,'fresh_per_profile_domain':3},'batch_order':order,'run_plan_sha256':sha(HERE/'run-plans.json'),'seed':seed,'mixed_reference_requirements':[list(k) for k in sorted(baseline_requirements(plans))],'gates':{'request_elapsed_max_seconds':45,'deadline_headroom_min_seconds':15,'memory_peak_max_fraction':.75,'oom_allowed':0,'oom_kill_allowed':0,'memory_max_allowed':0,'HTTP':'all required interactive responses200 and complete streams; surface negative controls400,21st budget attempt429,canceled request0 exceptions only','concurrency':'two distinct actualClientIP requests with overlapping intervals and complete successful responses','slots':'every group has two concurrent Evaluate follow-ups; both must200,overlap and meet numerical gates; canceled-client remaining18','async':'each request launch must have an uncached running incomplete job with completed work and at least half remaining; an actual native job interval must contain request start and overlap request; no failed/cached jobs/submissions','sustained':'retain >=95percent activeAPI samples during first30seconds; force final request to begin at least30seconds after first, with actual work; producer continues through response completion','cancellation':'cancelOptimize100ms,actualGincompletion observed<=2seconds afterclientend,followups both200 and overlap,canceledclientattempts2','scientific':'exact endpoint/request groups acrossABC; Building Entry complete JSON canonicalization excludesONLYdiagnostics.elapsed_ms preserving all number tokens and array order','incomplete':'any missing evidence invalidates positive qualification; no replacement of performance failures'},'timing':{'keep':'monotonic and UTC intervals for each request and complete measured group (after counter timestamp, before probes)','scoring':'longer elapsed interval','clock_discontinuity_seconds':1,'handling':'any difference>1second ->INVALID OBSERVATION; preserve original and continue lockedplan; affectedprofileINVALID/INSUFFICIENT; no reruns'},'controls':{'surface':{'cell_size_m':5,'rays':120,'radius_m':400,'expected_status':400,'expected_body_sha256':'d07a3fb2f912c180fdb5f8b5f5a081e1b0368585e9e14dd6e01ba3b6f3d80d25'},'budget':{'same_client_successful_attempts':20,'denied_attempt':21,'expected_denial':429}},'background':{'workers':1,'queue':16,'normal_runs':16,'sustained_runs_per_job':64,'target_pending_jobs':8,'maximum_submissions':1024,'sample_seconds':.05,'producer_lifetime':'until every interactive response completes, including final tail','interactive_rounds_max':12,'gap_seconds':3,'final_request':'always additional at/after30seconds','drain':'cancel outstanding jobs then await uncached one-run sentinel completion; proves stock worker passed every preceding job','precheck':prechecks,'precheck_maximum_window_seconds':180},'warmup':'one valid Simulate per nonfreshservice; samepolicyallprofiles','fresh':'newshippingprocess firstOptimize,sparse/dense2.6,three repeats; startup cost separate','memory_observation':'external50ms processRSS/cgroupcurrent plus kernel lifetimepeak including extraAutoCLI startup; GC-event heap diagnostics atMiB resolution from unchangedshippingruntime; observer separatecgroup','production_invariants':manifest['production_invariants'],'sleep_prevention':load(HERE/'sleep-prevention.json'),'input_sha256':inputs,'fixture_sha256':{str(p.relative_to(HERE)):sha(p) for p in sorted((HERE/'fixtures').glob('*.json'))},'prospective_corrections':['Go1.26.6 actualproductionbinary','HTTP400 invalid5mcontrol','bounded1024 producer eightpending active throughfinalresponse','preflight producerproof','GC diagnostics and externalLinuxlog witnesses for untouchedshippingserver'],'no_gate_changes_after_execution':True,'no_early_stopping':True,'no_adaptive_admission':True}
 write('qualification-lock',lock);print('LOCK',sha(HERE/'qualification-lock.json'),'plan',sha(HERE/'run-plans.json'),'groups',sum(map(len,plans.values())),flush=True)
if __name__=='__main__':freeze()
