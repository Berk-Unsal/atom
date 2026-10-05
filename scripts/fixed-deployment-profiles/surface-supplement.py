#!/usr/bin/env python3
"""Static-validation correction: add valid dense W3 Surface before its timings."""
import argparse,datetime,json,math,os,pathlib,shutil,subprocess
from protocol import HERE,ROOT,WORK,load,sha,verify,eligible
S=pathlib.Path('/tmp/atom-resource-fixed-surface');G=S/'geometry'
def call(args):return subprocess.check_output(args,text=True).strip()
def freeze():
 lock=verify()
 if (HERE/'surface-supplement-lock.json').exists():raise ValueError('supplement already frozen')
 if any(loadline.get('level')=='W3' for p in (WORK/'geometry').glob('runs-*.jsonl') for line in p.read_text().splitlines() for loadline in [json.loads(line)]):raise ValueError('W3 measurements already began; no retrospective input correction')
 assert (math.ceil(2*1500/5)+1)**2>100000 and (math.ceil(2*1500/10)+1)**2<=100000
 S.mkdir();G.mkdir();shutil.copytree(WORK/'backend-go',S/'backend-go');(S/'data-pipeline').symlink_to(ROOT/'data-pipeline',target_is_directory=True)
 source=S/'backend-go/geometry_study_test.go';s=source.read_text();assert 'simBody["cell_size_m"] = 5' in s;s=s.replace('simBody["cell_size_m"] = 5','simBody["cell_size_m"] = 10');source.write_text(s)
 subprocess.run(['gofmt','-w',str(source)],check=True)
 subprocess.run(['go','test','-c','-o',str(S/'fixed.test')],cwd=S/'backend-go',env=os.environ|{'GOOS':'linux','GOARCH':'arm64','CGO_ENABLED':'0'},check=True)
 plans={};main=load(HERE/'run-plans.json')
 for profile in ['A','B','C','D']:
  label=profile+'-surface-valid-0';rows=[case for case in main[profile+'-edge-0'] if case['operation']=='surface']
  assert len(rows)==(6 if profile=='D' else 12)
  plans[label]=rows;(G/f'plans-{label}.json').write_text(json.dumps(rows))
 for p in (WORK/'geometry').glob('*-W*.json'):shutil.copyfile(p,G/p.name)
 shutil.copyfile(WORK/'geometry'/'certification-lock.json',G/'certification-lock.json')
 supplement={'schema_version':1,'locked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'main_lock_sha256':sha(HERE/'certification-lock.json'),'reason':'Static API validation: original 5m/1500m fixture produces361201 gridcells and exceeds100000 cap. Preserve those42 plannedHTTP422 negativecontrols; add42 valid10m/1500m surfaces (90601 gridcells). Frozen before anyW3 RF timings; no numericalgatechange or replacement.','gates':lock['gates'],'plans':plans,'batch_order':['B-surface-valid-0','C-surface-valid-0','A-surface-valid-0','D-surface-valid-0'],'binary_sha256':sha(S/'fixed.test'),'source_sha256':sha(HERE/'surface-supplement.py'),'radius_m':1500,'cell_size_m':10,'grid_cells':90601,'no_main_contract_mutation':True}
 with (HERE/'surface-supplement-lock.json').open('x') as f:f.write(json.dumps(supplement,indent=2,sort_keys=True)+'\n')
 (HERE/'surface-supplement-lock.sha256').write_text(sha(HERE/'surface-supplement-lock.json')+'  surface-supplement-lock.json\n')
 print('SURFACE LOCK',sha(HERE/'surface-supplement-lock.json'),'42 valid edge probes',flush=True)
def run():
 lock=verify();supp=load(HERE/'surface-supplement-lock.json')
 if sha(HERE/'surface-supplement-lock.json')!=(HERE/'surface-supplement-lock.sha256').read_text().split()[0] or sha(S/'fixed.test')!=supp['binary_sha256'] or sha(HERE/'surface-supplement.py')!=supp['source_sha256']:raise ValueError('surface supplement changed')
 envPath=G/'environment.json';env=load(envPath) if envPath.exists() else {'lock_sha256':sha(HERE/'surface-supplement-lock.json'),'batches':{}}
 for label in supp['batch_order']:
  if (G/f'log-{label}.txt').exists():raise ValueError('refuse supplement rerun')
  profile=label.split('-')[0];p=lock['profiles'][profile];name='atom-fixed-cert-'+label.lower()
  cmd=['docker','create','--name',name,'--network','none']
  if profile!='D':cmd+=['--cpus',str(p['cpus']),'--memory',str(p['memory_gib'])+'g','--memory-swap',str(p['memory_gib'])+'g']
  cmd+=['-v',str(S)+':/study','-v',str(ROOT/'data-pipeline')+':/study/data-pipeline:ro','-w','/study/backend-go','-e','ATOM_GEOMETRY_STUDY=1','-e','ATOM_GEOMETRY_DIR=/study/geometry','-e','ATOM_GEOMETRY_PROFILE='+label,'-e','ATOM_CONTAINER_VERIFIED=1','-e','ATOM_LOCK_SHA='+supp['main_lock_sha256'],'--entrypoint','/study/fixed.test','atom:auto-profile-calibration','-test.run','^Test(FixedStudy|FixedUnknownGeometry)$','-test.v','-test.timeout','6h']
  created=False
  try:
   call(cmd);created=True
   before=json.loads(call(['docker','inspect',name]))[0]
   if before['Image']!=lock['image_id']:raise ValueError('image mismatch')
   if profile!='D' and (before['HostConfig']['NanoCpus']!=p['cpus']*10**9 or before['HostConfig']['Memory']!=p['memory_gib']*(1<<30)):raise ValueError('surface profile mismatch beforeRF')
   with (G/f'log-{label}.txt').open('x') as log:code=subprocess.run(['docker','start','-a',name],stdout=log,stderr=subprocess.STDOUT).returncode
   inspected=json.loads(call(['docker','inspect',name]))[0];auto=load(G/f'profile-{label}.json')
   accuracy=eligible(auto,p,lock['dataset'],{'environment':'container','source':'docker inspect'}) if profile!='D' else auto['cpu']['cgroup_quota_cores']['state']=='unlimited' and auto['memory']['cgroup_limit_bytes']['state']=='unlimited'
   env['batches'][label]={'state':inspected['State'],'host_config':{k:inspected['HostConfig'][k] for k in ['NanoCpus','Memory','MemorySwap']},'wrapper_exit':code,'auto_valid':accuracy}
   envPath.write_text(json.dumps(env,indent=2)+'\n');print(label,'complete',code,'Auto',accuracy,flush=True)
   if code or not accuracy:raise RuntimeError('invalid supplement; retain evidence')
  finally:
   if created:subprocess.run(['docker','rm','-f',name],check=True,stdout=subprocess.DEVNULL)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--freeze',action='store_true');p.add_argument('--run',action='store_true');a=p.parse_args()
 if a.freeze:freeze()
 elif a.run:run()
 else:p.error('--freeze or --run required')
