#!/usr/bin/env python3
"""Finite sequential A/B/D calibration. Never touches existing containers."""
import argparse,datetime,hashlib,json,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');p.add_argument('--workdir',default='/tmp/atom-resource-geometry');p.add_argument('--image',default='atom:auto-profile-calibration');p.add_argument('--profiles',default='D,A,B');a=p.parse_args()
if not a.run:p.error('explicit --run required')
w=pathlib.Path(a.workdir).resolve();g=w/'geometry'
def call(args):return subprocess.check_output(args,text=True).strip()
vm=json.loads(call(['docker','info','--format','{{json .}}']))
if vm['NCPU']<4 or vm['MemTotal']<9*(1<<30):raise SystemExit('matrix needs at least 4 VM CPUs and 9 GiB; no fabricated profiles')
meta={'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'vm':{k:vm[k] for k in ['NCPU','MemTotal','Architecture','CgroupVersion']},'image':call(['docker','image','inspect',a.image,'--format','{{.Id}}']),'geometry_binary_sha256':hashlib.sha256((w/'geometry.test').read_bytes()).hexdigest(),'baseline':{'branch':call(['git','branch','--show-current']),'head':call(['git','rev-parse','HEAD']),'version':(ROOT/'VERSION').read_text().strip()},'external_profiles':{},'instrumentation':'disposable backend copy, atomic spatial counters; real Gin handlers/middleware via httptest; no TCP/browser measurement; Go sampler and response-recorder overhead included'}
(g/'environment.json').write_text(json.dumps(meta,indent=2)+'\n')
for label in a.profiles.split(','):
 if label not in ['A','B','D']:p.error('profiles must be A,B,D')
 name='atom-geometry-'+label.lower();cmd=['docker','create','--name',name]
 if label=='A':cmd+=['--cpus','2','--memory','4g']
 if label=='B':cmd+=['--cpus','4','--memory','8g']
 cmd+=['-v',str(w)+':/study','-v',str(ROOT/'data-pipeline')+':/study/data-pipeline:ro','-w','/study/backend-go','-e','ATOM_GEOMETRY_STUDY=1','-e','ATOM_GEOMETRY_DIR=/study/geometry','-e','ATOM_GEOMETRY_PROFILE='+label,'--entrypoint','/study/geometry.test',a.image,'-test.run','^TestGeometry(Study|Preflight)$','-test.v','-test.timeout','3h']
 # Existing names fail; cleanup only a container successfully created by this invocation.
 created=False
 try:
  call(cmd);created=True
  with (g/f'log-{label}.txt').open('w') as log:
   code=subprocess.run(['docker','start','-a',name],stdout=log,stderr=subprocess.STDOUT).returncode
  state=json.loads(call(['docker','inspect',name]))[0]
  meta['external_profiles'][label]={'host_config':{k:state['HostConfig'][k] for k in ['NanoCpus','CpuQuota','CpuPeriod','CpusetCpus','Memory','MemorySwap']},'state':state['State']};(g/'environment.json').write_text(json.dumps(meta,indent=2)+'\n')
  if code!=0 or state['State']['ExitCode']!=0:raise RuntimeError(f'{label} failed; inspect {g}/log-{label}.txt')
  print(label,'complete',flush=True)
 finally:
  if created:subprocess.run(['docker','rm','-f',name],check=True,stdout=subprocess.DEVNULL)
