#!/usr/bin/env python3
"""Sequential immutable batches; no published ports or production configuration edits."""
import argparse,datetime,json,subprocess
from protocol import HERE,ROOT,WORK,load,sha,verify,lines,assert_mixed_references,eligible

def call(args):return subprocess.check_output(args,text=True).strip()
def run(batch=None):
 lock=verify();plans=load(HERE/'run-plans.json');G=WORK/'geometry'
 vm=json.loads(call(['docker','info','--format','{{json .}}']))
 if vm['NCPU']<10 or vm['MemTotal']<11*(1<<30):raise ValueError('VM cannot safely reproduce locked C floor')
 envPath=G/'environment.json'
 env=load(envPath) if envPath.exists() else {'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'vm':{k:vm[k] for k in ['NCPU','MemTotal','Architecture','CgroupVersion']},'image':lock['image_id'],'binary_sha256':lock['binary_sha256'],'lock_sha256':sha(HERE/'certification-lock.json'),'batches':{},'other_running_containers':call(['docker','ps','--format','{{.Names}} {{.Image}}'])}
 if call(['docker','image','inspect','atom:auto-profile-calibration','--format','{{.Id}}'])!=lock['image_id']:raise ValueError('image changed')
 for label in ([batch] if batch else lock['batch_order']):
  verify()
  if load(G/f'plans-{label}.json')!=plans[label]:raise ValueError('runtime plan differs from frozen order')
  if label in env['batches'] or (G/f'log-{label}.txt').exists():raise ValueError('refuse repeat/replacement: '+label)
  profile=label.split('-')[0]
  references=None
  if '-mixed-' in label:
   references=assert_mixed_references(plans,{k:lines(G/f'runs-{k}.jsonl') for k in plans},profile)
  candidate=lock['profiles'][profile];name='atom-fixed-cert-'+label.lower();cmd=['docker','create','--name',name,'--network','none']
  if candidate['cpus'] is not None:cmd+=['--cpus',str(candidate['cpus']),'--memory',str(candidate['memory_gib'])+'g','--memory-swap',str(candidate['memory_gib'])+'g']
  cmd+=['-v',str(WORK)+':/study','-v',str(ROOT/'data-pipeline')+':/study/data-pipeline:ro','-w','/study/backend-go','-e','ATOM_GEOMETRY_STUDY=1','-e','ATOM_GEOMETRY_DIR=/study/geometry','-e','ATOM_GEOMETRY_PROFILE='+label,'-e','ATOM_CONTAINER_VERIFIED=1','-e','ATOM_LOCK_SHA='+env['lock_sha256'],'--entrypoint','/study/fixed.test','atom:auto-profile-calibration','-test.run','^Test(FixedStudy|FixedUnknownGeometry|GeometryPreflightPrimitive)$','-test.v','-test.timeout','6h']
  created=False
  try:
   call(cmd);created=True
   inspected=json.loads(call(['docker','inspect',name]))[0]
   config=inspected['HostConfig']
   if inspected['Image']!=lock['image_id'] or config['NetworkMode']!='none':raise ValueError('container provenance mismatch before RF')
   if profile!='D' and (config['NanoCpus']!=candidate['cpus']*10**9 or config['Memory']!=candidate['memory_gib']*(1<<30) or config['MemorySwap']!=config['Memory']):raise ValueError('container floor mismatch before RF')
   env['batches'][label]={'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'references_checked_before_launch':references}
   envPath.write_text(json.dumps(env,indent=2)+'\n')
   with (G/f'log-{label}.txt').open('x') as log:code=subprocess.run(['docker','start','-a',name],stdout=log,stderr=subprocess.STDOUT).returncode
   state=json.loads(call(['docker','inspect',name]))[0]
   autoPath=G/f'profile-{label}.json';auto=load(autoPath) if autoPath.exists() else None
   accuracy=auto is not None and (eligible(auto,candidate,lock['dataset'],{'environment':'container','source':'docker inspect'}) if profile!='D' else auto['cpu']['cgroup_quota_cores']['state']=='unlimited' and auto['memory']['cgroup_limit_bytes']['state']=='unlimited')
   env['batches'][label].update({'finished_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host_config':{k:state['HostConfig'][k] for k in ['NanoCpus','CpuQuota','CpuPeriod','Memory','MemorySwap','CpusetCpus']},'state':state['State'],'wrapper_exit':code,'auto_valid':accuracy})
   envPath.write_text(json.dumps(env,indent=2)+'\n')
   print(label,'completed',code,'Auto',accuracy,flush=True)
   if code or state['State']['ExitCode'] or not accuracy:raise RuntimeError('invalid batch; retain failures; no automatic rerun')
  finally:
   if created:subprocess.run(['docker','rm','-f',name],check=True,stdout=subprocess.DEVNULL)
  verify()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');p.add_argument('--batch');a=p.parse_args()
 if not a.run:p.error('--run required')
 run(a.batch)
