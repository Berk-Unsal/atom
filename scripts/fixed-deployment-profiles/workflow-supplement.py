#!/usr/bin/env python3
"""Preregister and measure complete Optimize+explanation, no changes to main evidence."""
import argparse,datetime,json,os,pathlib,shutil,subprocess
from protocol import HERE,ROOT,WORK,load,sha,verify,eligible,lines
S=pathlib.Path('/tmp/atom-resource-fixed-explanation');G=S/'geometry'
def call(args):return subprocess.check_output(args,text=True).strip()
def freeze():
 lock=verify()
 if (HERE/'workflow-supplement-lock.json').exists():raise ValueError('supplement already frozen')
 S.mkdir();G.mkdir();shutil.copytree(WORK/'backend-go',S/'backend-go');(S/'data-pipeline').symlink_to(ROOT/'data-pipeline',target_is_directory=True)
 source=S/'backend-go/geometry_study_test.go';s=source.read_text()
 start=s.index('\t\t// Explain uses an actual returned solution.');end=s.index('\n\t\tpoints :=',start)
 prerequisite=s[start:end]
 s=s[:start]+s[end:]
 prerequisite=prerequisite.replace('var explanation []byte','var explanation []byte\n var prerequisites []geometryResponse').replace('res := network(true, peer)','res := network(true, peer)\n prerequisites=append(prerequisites,res)')
 s=s.replace('\t\tswitch p.Operation {',prerequisite+'\n\t\tswitch p.Operation {')
 s=s.replace('rs = []geometryResponse{request("/api/explain-network-cell", explanation, peer, nil)}','rs = append(prerequisites,request("/api/explain-network-cell", explanation, peer, nil))')
 source.write_text(s)
 subprocess.run(['gofmt','-w',str(source)],check=True)
 subprocess.run(['go','test','-c','-o',str(S/'fixed.test')],cwd=S/'backend-go',env=os.environ|{'GOOS':'linux','GOARCH':'arm64','CGO_ENABLED':'0'},check=True)
 plans={};main=load(HERE/'run-plans.json')
 for profile in ['A','B','C']:
  label=profile+'-workflow-0';rows=[]
  for parent,cases in main.items():
   if parent.startswith(profile+'-single-'):
    rows.extend(case for case in cases if case['operation']=='explain')
  assert len(rows)==40
  plans[label]=rows;(G/f'plans-{label}.json').write_text(json.dumps(rows))
 for p in (WORK/'geometry').glob('*-W*.json'):shutil.copyfile(p,G/p.name)
 shutil.copyfile(WORK/'geometry'/'certification-lock.json',G/'certification-lock.json')
 supplement={'schema_version':1,'locked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'main_lock_sha256':sha(HERE/'certification-lock.json'),'reason':'Inherited isolated explanation measurement excludes prerequisite. Add complete Optimize+explanation workflow measurement, without changing main rows,gates,inputs or candidate selection.','gates':lock['gates'],'plans':plans,'batch_order':['C-workflow-0','A-workflow-0','B-workflow-0'],'binary_sha256':sha(S/'fixed.test'),'source_sha256':sha(HERE/'workflow-supplement.py'),'scope':'W1,same two domains/band,five repeats per band/frequency/profile;120 full workflows;realHTTP;retainedOptimize used as exactexplanation prerequisite;wall/CPU/RSS/heap include both;kernelpeak includesstartup','no_main_contract_mutation':True}
 with (HERE/'workflow-supplement-lock.json').open('x') as f:f.write(json.dumps(supplement,indent=2,sort_keys=True)+'\n')
 (HERE/'workflow-supplement-lock.sha256').write_text(sha(HERE/'workflow-supplement-lock.json')+'  workflow-supplement-lock.json\n')
 print('SUPPLEMENT LOCK',sha(HERE/'workflow-supplement-lock.json'),'120 workflows',flush=True)
def run():
 lock=verify();supp=load(HERE/'workflow-supplement-lock.json')
 if sha(HERE/'workflow-supplement-lock.json')!=(HERE/'workflow-supplement-lock.sha256').read_text().split()[0] or sha(S/'fixed.test')!=supp['binary_sha256'] or sha(HERE/'workflow-supplement.py')!=supp['source_sha256']:raise ValueError('supplement changed')
 if supp['main_lock_sha256']!=sha(HERE/'certification-lock.json'):raise ValueError('main lock changed')
 envPath=G/'environment.json';env=load(envPath) if envPath.exists() else {'lock_sha256':sha(HERE/'workflow-supplement-lock.json'),'batches':{}}
 for label in supp['batch_order']:
  if (G/f'log-{label}.txt').exists():raise ValueError('refuse supplement rerun')
  profile=label.split('-')[0];p=lock['profiles'][profile];name='atom-fixed-cert-'+label.lower()
  cmd=['docker','create','--name',name,'--network','none','--cpus',str(p['cpus']),'--memory',str(p['memory_gib'])+'g','--memory-swap',str(p['memory_gib'])+'g','-v',str(S)+':/study','-v',str(ROOT/'data-pipeline')+':/study/data-pipeline:ro','-w','/study/backend-go','-e','ATOM_GEOMETRY_STUDY=1','-e','ATOM_GEOMETRY_DIR=/study/geometry','-e','ATOM_GEOMETRY_PROFILE='+label,'-e','ATOM_CONTAINER_VERIFIED=1','-e','ATOM_LOCK_SHA='+supp['main_lock_sha256'],'--entrypoint','/study/fixed.test','atom:auto-profile-calibration','-test.run','^Test(FixedStudy|FixedUnknownGeometry)$','-test.v','-test.timeout','6h']
  created=False
  try:
   call(cmd);created=True
   before=json.loads(call(['docker','inspect',name]))[0]
   if before['Image']!=lock['image_id'] or before['HostConfig']['NanoCpus']!=p['cpus']*10**9 or before['HostConfig']['Memory']!=p['memory_gib']*(1<<30):raise ValueError('supplement profile mismatch beforeRF')
   with (G/f'log-{label}.txt').open('x') as log:code=subprocess.run(['docker','start','-a',name],stdout=log,stderr=subprocess.STDOUT).returncode
   inspected=json.loads(call(['docker','inspect',name]))[0]
   accuracy=eligible(load(G/f'profile-{label}.json'),p,lock['dataset'],{'environment':'container','source':'docker inspect'})
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
