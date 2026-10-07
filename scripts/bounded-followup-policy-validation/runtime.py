"""Profile A shipping-container validation; historical containers/evidence untouched."""
import sys,datetime,hashlib,json,pathlib,subprocess,time
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];WORK=pathlib.Path('/tmp/atom-bounded-followup-policy')
def load(p):return json.loads(p.read_text())
def run(*a,**kw):return subprocess.run(a,check=True,**kw)
def validate(label,cells,mode,image):
 folder=WORK/label;folder.mkdir(exist_ok=False);name='atom-bounded-'+label.lower()
 cid=subprocess.check_output(['docker','run','-d','--name',name,'--cpus','2','--memory','4g','--memory-swap','4g','-e','GODEBUG=gctrace=1',image],text=True).strip()
 log=(folder/'server.log').open('wb');follow=subprocess.Popen(['docker','logs','-f','--timestamps',cid],stdout=log,stderr=subprocess.STDOUT)
 try:
  inspect=load_json_command('docker','inspect',cid)[0];(folder/'docker-inspect.json').write_text(json.dumps(inspect,indent=2)+'\n');assert inspect['Image']==image and inspect['HostConfig']['NanoCpus']==2000000000 and inspect['HostConfig']['Memory']==4<<30
  for _ in range(300):
   if subprocess.run(['docker','exec',cid,'wget','-q','--spider','http://127.0.0.1:8080/readyz'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
   time.sleep(.1)
  else:raise RuntimeError('readiness failure')
  with (folder/'auto.json').open('wb') as out,(folder/'auto.stderr.log').open('wb') as err:run('docker','exec',cid,'/app/server','--resource-profile',stdout=out,stderr=err)
  sys.path.insert(0,str(ROOT/'scripts/eight-cell-operational-successor'));import runtime as prior_runtime
  auto=load(folder/'auto.json');prior_runtime.auto_validate(auto,{'cpus':2,'memory_gib':4},cells);assert auto['runtime']['go_version']=='go1.26.6' and auto['runtime']['os']=='linux' and auto['runtime']['arch']=='arm64' and auto['cgroup_version']=='v2'
  assert auto['cpu']['cgroup_quota_cores']['value']==2 and auto['memory']['cgroup_limit_bytes']['value']==4<<30
  assert auto['rf_policy']['max_cells']==cells and auto['rf_policy']['global_concurrency']==2 and auto['rf_policy']['per_client_concurrency']==1 and auto['rf_policy']['request_attempt_limit']==20 and auto['rf_policy']['request_deadline_seconds']==60
  assert auto['experiments']['configured_workers']==1 and auto['experiments']['queue_capacity']==16
  prior=load(ROOT/'scripts/fixed-deployment-profiles/certification-lock.json')['dataset'];assert all(auto['dataset'][k]==prior[k] for k in ['id','version','sha256'])
  observer=load(ROOT/'scripts/w1-shipping-runtime-qualification/observer-image.json')['image_id']
  cmd=['docker','run','--rm','--name','atom-bounded-observer-'+label.lower(),'--user','0','--cap-add','SYS_PTRACE','--pid','container:'+cid,'--network','container:'+cid,'--cpus','2','--memory','1g','-v',str(HERE)+':/audit/repo:ro','-v',str(WORK)+':/audit/work','-v',str(pathlib.PurePosixPath(inspect['LogPath']).parent)+':/audit/primary-logs:ro','-e','POLICY_PRIMARY_ID='+cid,'-e','POLICY_LABEL='+label,'-e','POLICY_MODE='+mode,'-e','POLICY_CELLS='+str(cells),observer,'python','/audit/repo/'+('extra_validation.py' if mode=='extra' else 'observer.py')]
  with (folder/'observer.log').open('x') as out:run(*cmd,stdout=out,stderr=subprocess.STDOUT)
 finally:
  subprocess.run(['docker','stop','-t','5',cid],stdout=subprocess.DEVNULL);follow.wait(timeout=10);log.close();subprocess.run(['docker','rm',cid],stdout=subprocess.DEVNULL)
def load_json_command(*a):return json.loads(subprocess.check_output(a,text=True))
def main():
 if '--extra-only' in sys.argv:
  image=load(HERE/'binary-differential.json')['images']['standard']['image_id'];validate('extra-normal',6,'extra',image);return
 old=load(ROOT/'scripts/eight-cell-operational-successor/binary-differential.json');revision=len(list(WORK.glob('baseline-6*')))+1
 for cells,kind in ([] if '--policy-only' in sys.argv else [(6,'standard'),(8,'audit')]):
  image=old['images'][kind]['image_id'];assert load_json_command('docker','image','inspect',image)[0]['Id']==image
  validate('baseline-'+str(cells)+'-r'+str(revision),cells,'baseline',image)
 for cells,kind in [(6,'standard'),(8,'audit')]:
  new=load(HERE/'binary-differential.json');validate('policy-'+str(cells)+'-r'+str(revision),cells,'policy',new['images'][kind]['image_id'])
if __name__=='__main__':main()
