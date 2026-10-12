#!/usr/bin/env python3
"""Finite, explicit container calibration; preserves existing containers and fixed policy."""
import argparse,datetime,json,pathlib,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');p.add_argument('--image',default='atom:auto-profile-calibration');p.add_argument('--workdir',default='/tmp/atom-auto-profile');a=p.parse_args()
if not a.run:p.error('explicit --run required')
w=pathlib.Path(a.workdir);w.mkdir(parents=True,exist_ok=True)
def call(args,**kw):return subprocess.check_output(args,text=True,**kw).strip()
info=json.loads(call(['docker','info','--format','{{json .}}']))
if info['NCPU']<8 or info['MemTotal']<11*(1<<30):raise SystemExit('8 CPU / 10 GiB profile requires at least 8 VM CPUs and 11 GiB; choose a documented smaller matrix on this host')
subprocess.run(['node',str(ROOT/'scripts/network-capacity-audit/fixtures.mjs'),str(w/'fixtures')],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['go','build','-o',str(w/'probe'),str(ROOT/'scripts/auto-resource-profile/probe.go')],cwd=ROOT/'backend-go',env=__import__('os').environ|{'GOOS':'linux','GOARCH':info['Architecture'].replace('aarch64','arm64'),'CGO_ENABLED':'0'},check=True)
result={'schema_version':1,'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'certification':'DEVELOPMENT VM; NOT PRODUCTION CERTIFICATION','vm':{k:info[k] for k in ['NCPU','MemTotal','Architecture','CgroupVersion']},'image':call(['docker','image','inspect',a.image,'--format','{{.Id}}']),'profiles':[]}
for label,cpu,memory in [('A-2CPU-4GiB',2,4),('B-4CPU-8GiB',4,8),('C-8CPU-10GiB',8,10),('default',None,None)]:
 name='atom-auto-profile-'+label.lower();args=['docker','run','-d','--name',name]
 if cpu:args+=['--cpus',str(cpu),'--memory',f'{memory}g']
 args+=[a.image]
 # No --rm or name reuse: an existing name fails without changing that container.
 call(args)
 try:
  for _ in range(120):
   ready=subprocess.run(['docker','exec',name,'wget','-q','--spider','http://127.0.0.1:8080/readyz'],capture_output=True)
   if ready.returncode==0:break
   time.sleep(.25)
  else:raise RuntimeError('startup failed')
  profile=json.loads(call(['docker','exec',name,'./server','--resource-profile']))
  inspect=json.loads(call(['docker','inspect',name]))[0]['HostConfig']
  observed=profile['cpu']['cgroup_quota_cores'];limit=profile['memory']['cgroup_limit_bytes']
  if cpu:assert observed['value']==cpu and limit['value']==memory*(1<<30),(label,observed,limit)
  else:assert observed['state']=='unlimited' and limit['state']=='unlimited',(observed,limit)
  assert profile['rf_policy']['global_concurrency']==2 and profile['rf_policy']['per_client_concurrency']==1 and profile['rf_policy']['request_attempt_limit']==20 and profile['rf_policy']['request_deadline_seconds']==60 and profile['rf_policy']['max_cells']==6
  assert profile['experiments']['configured_workers']==1 and profile['experiments']['queue_capacity']==16
  entry={'label':label,'requested_cpu':cpu,'requested_memory_gib':memory,'auto_detection_matches':True,'profile':profile,'external_container_constraints':{k:inspect[k] for k in ['NanoCpus','CpuQuota','CpuPeriod','CpusetCpus','Memory','MemorySwap']},'workloads':[]}
  subprocess.run(['docker','cp',str(w/'probe'),name+':/tmp/probe'],check=True,stdout=subprocess.DEVNULL)
  for freq in [2.6,28]:
   subprocess.run(['docker','cp',str(w/'fixtures'/f'6-{freq}.json'),name+':/tmp/fixture.json'],check=True,stdout=subprocess.DEVNULL)
   raw=call(['docker','exec',name,'/tmp/probe','/tmp/fixture.json'],timeout=1500)
   data=json.loads(raw);entry['workloads'].append({'frequency_ghz':freq,**data});(w/f'{label}-{freq}.json').write_text(json.dumps(data,indent=2))
   print(label,freq,'complete',flush=True)
  logs=call(['docker','logs',name],stderr=subprocess.STDOUT);(w/f'{label}.log').write_text(logs)
  summaries=[line for line in logs.splitlines() if 'Auto resource profile' in line]
  assert len(summaries)==1 and profile['diagnostic_fingerprint'] in summaries[0],summaries
  entry['startup_profile_matches_diagnostic']=True
  entry['final_memory_events']=call(['docker','exec',name,'cat','/sys/fs/cgroup/memory.events'])
  entry['final_container_state']=json.loads(call(['docker','inspect',name]))[0]['State']
  result['profiles'].append(entry);(w/'matrix.json').write_text(json.dumps(result,indent=2))
 finally:
  subprocess.run(['docker','rm','-f',name],check=True,stdout=subprocess.DEVNULL)
print('completed',w/'matrix.json',flush=True)
