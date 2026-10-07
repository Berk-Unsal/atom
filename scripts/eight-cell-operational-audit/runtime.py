"""Shipping container/observer lifecycle; no production checkout or server mutations."""
import datetime,json,pathlib,subprocess,time
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];WORK=pathlib.Path('/tmp/atom-eight-cell-operational-audit')
PROFILES={'A':{'cpus':2,'memory_gib':4},'B':{'cpus':4,'memory_gib':8},'C':{'cpus':8,'memory_gib':10}}
def load(p):return json.loads(p.read_text())
def run(*args,**kw):return subprocess.run(args,check=True,**kw)
def auto_validate(auto,profile,cardinality):
 prior=load(ROOT/'scripts/fixed-deployment-profiles/certification-lock.json')['dataset']
 known=lambda s,v:s['state']=='known' and s['value']==v and not s.get('unknown_sources')
 assert auto['runtime']['go_version']=='go1.26.6' and auto['runtime']['os']=='linux' and auto['runtime']['arch']=='arm64'
 assert auto['mode']=='auto' and auto['cgroup_version']=='v2' and auto['environment']=='unknown'
 assert known(auto['cpu']['cgroup_quota_cores'],profile['cpus']) and known(auto['cpu']['effective_observed_capacity_cores'],profile['cpus']) and known(auto['cpu']['gomaxprocs'],profile['cpus'])
 assert known(auto['memory']['cgroup_limit_bytes'],profile['memory_gib']*(1<<30)) and known(auto['memory']['effective_observed_limit_bytes'],profile['memory_gib']*(1<<30))
 assert auto['experiments']['configured_workers']==1 and auto['experiments']['queue_capacity']==16
 expected={'global_concurrency':2,'per_client_concurrency':1,'request_attempt_limit':20,'request_window_seconds':60,'request_deadline_seconds':60,'max_cells':cardinality}
 assert all(auto['rf_policy'][k]==v for k,v in expected.items())
 assert auto['dataset']['state']=='known' and all(auto['dataset'][k]==prior[k] for k in ['id','version','sha256'])
 assert [auto['dataset'][k] for k in ['indexed_footprint_count','total_polygon_vertices','inventory_cell_count']]==[161784,936651,451]
 assert auto['runtime']['gc_percent']['value']==100 and auto['runtime']['go_memory_limit_bytes']['state']=='unlimited'

def launch(label,profile,kind):
 folder=WORK/label;folder.mkdir(exist_ok=False);image=load(HERE/'binary-differential.json')['images'][kind]['image_id'];name='atom-8c-'+label.lower();limits=PROFILES[profile];at=datetime.datetime.now(datetime.timezone.utc).isoformat();mono=time.monotonic()
 cid=subprocess.check_output(['docker','run','-d','--name',name,'--cpus',str(limits['cpus']),'--memory',str(limits['memory_gib'])+'g','--memory-swap',str(limits['memory_gib'])+'g','-e','GODEBUG=gctrace=1',image],text=True).strip()
 log=(folder/'server.log').open('wb');follow=subprocess.Popen(['docker','logs','-f','--timestamps',cid],stdout=log,stderr=subprocess.STDOUT)
 try:
  inspection=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0];(folder/'docker-inspect.json').write_text(json.dumps(inspection,indent=2)+'\n')
  assert inspection['Image']==image and inspection['HostConfig']['NanoCpus']==limits['cpus']*1_000_000_000 and inspection['HostConfig']['Memory']==limits['memory_gib']*(1<<30) and inspection['HostConfig']['MemorySwap']==limits['memory_gib']*(1<<30)
  env=dict(v.split('=',1) for v in inspection['Config']['Env']);assert not any(k in env for k in ['GOMAXPROCS','GOGC','GOMEMLIMIT','RF_API_KEY','TRUSTED_PROXIES'])
  ready=False
  for _ in range(300):
   if subprocess.run(['docker','exec',cid,'wget','-q','--spider','http://127.0.0.1:8080/readyz'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:ready=True;break
   time.sleep(.1)
  assert ready,'shipping server readiness failed'
  (folder/'startup.json').write_text(json.dumps({'started_at':at,'ready_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'startup_ready_seconds':time.monotonic()-mono},indent=2)+'\n')
  with (folder/'auto.json').open('wb') as out,(folder/'auto.stderr.log').open('wb') as err:run('docker','exec',cid,'/app/server','--resource-profile',stdout=out,stderr=err)
  auto=load(folder/'auto.json');auto_validate(auto,limits,6 if kind=='standard' else 8)
  for _ in range(50):
   text=(folder/'server.log').read_text()
   if 'Auto resource profile' in text:break
   time.sleep(.05)
  assert f'gomaxprocs={limits["cpus"]}' in text and f'cpu_quota={limits["cpus"]}' in text and 'dataset_footprints=161784' in text and 'experiment_workers=1' in text and 'rf_global_slots=2' in text
  (folder/'pre-rf-verification.json').write_text(json.dumps({'verified_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'auto_valid':True,'external_constraints_valid':True,'shipping_startup_auto_valid':True,'container_id':cid,'image_id':image,'profile':profile},indent=2)+'\n')
  return cid,follow,log
 except BaseException:
  subprocess.run(['docker','rm','-f',cid],stdout=subprocess.DEVNULL);follow.wait();log.close();raise

def observe(label,cid,precheck=False,fixture=None,smoke=False):
 inspection=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0];logdir=str(pathlib.PurePosixPath(inspection['LogPath']).parent)
 image=load(ROOT/'scripts/w1-shipping-runtime-qualification/observer-image.json')['image_id'];cmd=['docker','run','--rm','--name','atom-8c-observer-'+label.lower(),'--user','0','--cap-add','SYS_PTRACE','--pid','container:'+cid,'--network','container:'+cid,'--cpus','2','--memory','1g','-v',str(HERE)+':/audit/repo:ro','-v',str(ROOT/'scripts/w1-shipping-runtime-qualification')+':/audit/prior:ro','-v',str(WORK)+':/audit/work','-e','W1_BATCH='+label,'-e','W1_PRIMARY_ID='+cid,'-v',logdir+':/audit/primary-logs:ro']
 if precheck:cmd+=['-e','W1_PRECHECK=1','-e','W1_FIXTURE='+fixture]
 if smoke:cmd+=['-e','W1_SMOKE=1']
 cmd += [image,'python','/audit/repo/client.py']
 with (WORK/label/'observer.log').open('x') as out:return subprocess.run(cmd,stdout=out,stderr=subprocess.STDOUT).returncode

def close(cid,follow,log):
 subprocess.run(['docker','stop','-t','5',cid],stdout=subprocess.DEVNULL,check=True);follow.wait(timeout=10);log.close();subprocess.run(['docker','rm',cid],stdout=subprocess.DEVNULL,check=True)
