#!/usr/bin/env python3
"""Sequential bounded profile batches. Hash checks precede every process."""
import argparse,datetime,hashlib,json,pathlib,subprocess
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];W=pathlib.Path('/tmp/atom-resource-locked-validation');G=W/'geometry'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def verify():
 for name in ['validation-lock','domain-manifest','run-plans']:
  assert sha(HERE/(name+'.json'))==(HERE/(name+'.sha256')).read_text().split()[0],name+' mutation'
 assert sha(ROOT/'docs/auto-resource-geometry-calibration.json')==json.loads((HERE/'validation-lock.json').read_text())['source_sha256']
def call(args):return subprocess.check_output(args,text=True).strip()
p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');p.add_argument('--batch');a=p.parse_args()
if not a.run:p.error('--run required')
verify();plans=json.loads((HERE/'run-plans.json').read_text());lock=json.loads((HERE/'validation-lock.json').read_text())
vm=json.loads(call(['docker','info','--format','{{json .}}']));assert vm['NCPU']>=4 and vm['MemTotal']>=9*(1<<30)
metaPath=G/'environment.json'
if metaPath.exists():meta=json.loads(metaPath.read_text())
else:meta={'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'vm':{k:vm[k] for k in ['NCPU','MemTotal','Architecture','CgroupVersion']},'image':call(['docker','image','inspect','atom:auto-profile-calibration','--format','{{.Id}}']),'binary_sha256':sha(W/'locked.test'),'batches':{},'lock_sha256':sha(HERE/'validation-lock.json'),'domain_sha256':sha(HERE/'domain-manifest.json'),'plan_sha256':sha(HERE/'run-plans.json')}
metaPath.write_text(json.dumps(meta,indent=2)+'\n')
selected=[a.batch] if a.batch else list(plans)
for label in selected:
 verify();assert sha(W/'locked.test')==meta['binary_sha256'],'binary changed after execution'
 profile=label.split('-')[0];name='atom-locked-'+label.lower();cmd=['docker','create','--name',name]
 if profile=='A':cmd+=['--cpus','2','--memory','4g']
 if profile=='B':cmd+=['--cpus','4','--memory','8g']
 cmd+=['-v',str(W)+':/study','-v',str(ROOT/'data-pipeline')+':/study/data-pipeline:ro','-w','/study/backend-go','-e','ATOM_GEOMETRY_STUDY=1','-e','ATOM_GEOMETRY_DIR=/study/geometry','-e','ATOM_GEOMETRY_PROFILE='+label,'-e','ATOM_LOCK_SHA='+meta['lock_sha256'],'-e','ATOM_DOMAIN_SHA='+meta['domain_sha256']]
 if 'recorder' in label:cmd+=['-e','ATOM_RECORDER_CONTROL=1']
 cmd+=['--entrypoint','/study/locked.test','atom:auto-profile-calibration','-test.run','^Test(LockedStudy|GeometryPreflight|GeometryPreflightPrimitive|LockedPredictionPrimitive)$' if label==profile else '^Test(LockedStudy|LockedPredictionPrimitive)$','-test.v','-test.timeout','6h']
 created=False
 try:
  call(cmd);created=True
  with (G/f'log-{label}.txt').open('x') as log:code=subprocess.run(['docker','start','-a',name],stdout=log,stderr=subprocess.STDOUT).returncode
  state=json.loads(call(['docker','inspect',name]))[0]
  meta['batches'][label]={'host_config':{k:state['HostConfig'][k] for k in ['NanoCpus','CpuQuota','CpuPeriod','Memory','MemorySwap']},'state':state['State'],'wrapper_exit':code};metaPath.write_text(json.dumps(meta,indent=2)+'\n')
  print(label,'completed',code,state['State']['ExitCode'],flush=True)
  if code or state['State']['ExitCode']:raise RuntimeError('batch failed; retain all evidence, do not silently restart')
 finally:
  if created:subprocess.run(['docker','rm','-f',name],check=True,stdout=subprocess.DEVNULL)
 verify()
