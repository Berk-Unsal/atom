#!/usr/bin/env python3
"""Preregister and measure Building Entry scientific identity, no changes to main evidence."""
import argparse,datetime,json,os,pathlib,shutil,subprocess
from protocol import HERE,ROOT,WORK,load,sha,verify,eligible,lines
S=pathlib.Path('/tmp/atom-resource-fixed-science');G=S/'geometry'
def call(args):return subprocess.check_output(args,text=True).strip()
def freeze():
 lock=verify()
 if (HERE/'science-supplement-lock.json').exists():raise ValueError('supplement already frozen')
 S.mkdir();G.mkdir();shutil.copytree(WORK/'backend-go',S/'backend-go');(S/'data-pipeline').symlink_to(ROOT/'data-pipeline',target_is_directory=True)
 source=S/'backend-go/geometry_study_test.go';s=source.read_text()
 s=s.replace('Hash           string    `json:"sha256"`','Hash           string    `json:"sha256"`\n ScientificHash string `json:"scientific_sha256,omitempty"`')
 s=s.replace('endpoint == "/api/optimize-network" || strings.Contains(endpoint, "/execution")','endpoint == "/api/optimize-network" || endpoint == "/api/building-entry-analysis" || strings.Contains(endpoint, "/execution")')
 s=s.replace('result.Body = small.Bytes()','result.Body = small.Bytes()\n if endpoint == "/api/building-entry-analysis" && result.Status == 200 { result.ScientificHash, e = fixedScientificHash(result.Body); if e != nil { t.Fatal(e) } }')
 s+="\n"+(HERE/'science-canonical.go.txt').read_text()
 source.write_text(s)
 subprocess.run(['gofmt','-w',str(source)],check=True)
 subprocess.run(['go','test','-c','-o',str(S/'fixed.test')],cwd=S/'backend-go',env=os.environ|{'GOOS':'linux','GOARCH':'arm64','CGO_ENABLED':'0'},check=True)
 plans={};main=load(HERE/'run-plans.json')
 for profile in ['A','B','C']:
  label=profile+'-science-0';rows=[]
  for parent,cases in main.items():
   if parent.startswith(profile+'-single-') or parent==profile+'-edge-0':
    rows.extend(case for case in cases if case['operation']=='building-entry')
  assert len(rows)==52
  plans[label]=rows;(G/f'plans-{label}.json').write_text(json.dumps(rows))
 for p in (WORK/'geometry').glob('*-W*.json'):shutil.copyfile(p,G/p.name)
 shutil.copyfile(WORK/'geometry'/'certification-lock.json',G/'certification-lock.json')
 supplement={'schema_version':1,'locked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'main_lock_sha256':sha(HERE/'certification-lock.json'),'reason':'Raw Building Entry responses contain volatile diagnostics.elapsed_ms. Preserve every primary raw hash. Add science-only complete response comparisons removing only that exact field; RF values, fingerprints and array order retained. Supplemental latency/memory are excluded from primary performance scoring.','gates':lock['gates'],'plans':plans,'batch_order':['B-science-0','A-science-0','C-science-0'],'binary_sha256':sha(S/'fixed.test'),'source_sha256':sha(HERE/'science-supplement.py'),'canonical_source_sha256':sha(HERE/'science-canonical.go.txt'),'scope':'W1 and W3 Building Entry, all original ABC fixtures/repeats;156 real HTTP requests','excluded_json_paths':['diagnostics.elapsed_ms'],'no_main_contract_mutation':True}

 with (HERE/'science-supplement-lock.json').open('x') as f:f.write(json.dumps(supplement,indent=2,sort_keys=True)+'\n')
 (HERE/'science-supplement-lock.sha256').write_text(sha(HERE/'science-supplement-lock.json')+'  science-supplement-lock.json\n')
 print('SUPPLEMENT LOCK',sha(HERE/'science-supplement-lock.json'),'156 science-only requests',flush=True)
def run():
 lock=verify();supp=load(HERE/'science-supplement-lock.json')
 if sha(HERE/'science-supplement-lock.json')!=(HERE/'science-supplement-lock.sha256').read_text().split()[0] or sha(S/'fixed.test')!=supp['binary_sha256'] or sha(HERE/'science-supplement.py')!=supp['source_sha256']:raise ValueError('supplement changed')
 if sha(HERE/'science-canonical.go.txt')!=supp['canonical_source_sha256']:raise ValueError('canonical source changed')
 if supp['main_lock_sha256']!=sha(HERE/'certification-lock.json'):raise ValueError('main lock changed')
 envPath=G/'environment.json';env=load(envPath) if envPath.exists() else {'lock_sha256':sha(HERE/'science-supplement-lock.json'),'batches':{}}
 for label in supp['batch_order']:
  if (G/f'log-{label}.txt').exists():raise ValueError('refuse supplement rerun')
  profile=label.split('-')[0];p=lock['profiles'][profile];name='atom-fixed-cert-'+label.lower()
  cmd=['docker','create','--name',name,'--network','none','--cpus',str(p['cpus']),'--memory',str(p['memory_gib'])+'g','--memory-swap',str(p['memory_gib'])+'g','-v',str(S)+':/study','-v',str(ROOT/'data-pipeline')+':/study/data-pipeline:ro','-w','/study/backend-go','-e','ATOM_GEOMETRY_STUDY=1','-e','ATOM_GEOMETRY_DIR=/study/geometry','-e','ATOM_GEOMETRY_PROFILE='+label,'-e','ATOM_CONTAINER_VERIFIED=1','-e','ATOM_LOCK_SHA='+supp['main_lock_sha256'],'--entrypoint','/study/fixed.test','atom:auto-profile-calibration','-test.run','^Test(FixedStudy|FixedUnknownGeometry|FixedScientificHash)$','-test.v','-test.timeout','6h']
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
