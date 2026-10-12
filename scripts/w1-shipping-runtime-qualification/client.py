#!/usr/bin/env python3
"""External HTTP/cgroup observer. Never imported into or linked with the shipping server."""
import concurrent.futures, copy, datetime, hashlib, http.client, json, math, os, pathlib, re, socket, threading, time
ROOT=pathlib.Path('/audit/repo'); WORK=pathlib.Path('/audit/work'); CG=pathlib.Path('/proc/1/root/sys/fs/cgroup')

def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def stamp(v):return datetime.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()
def encode(v):return json.dumps(v,separators=(',',':'),ensure_ascii=False).encode()
def save(p,v):
 with p.open('x') as out:json.dump(v,out,indent=2);out.write('\n')
class NumericToken(str):pass

def canonical(body):
 value=json.loads(body,parse_int=NumericToken,parse_float=NumericToken)
 if not isinstance(value,dict) or not isinstance(value.get('diagnostics'),dict) or 'elapsed_ms' not in value['diagnostics']:raise ValueError('missing exact volatile field')
 del value['diagnostics']['elapsed_ms']
 def emit(v):
  if isinstance(v,NumericToken):return str(v)
  if isinstance(v,dict):return '{'+','.join(json.dumps(k,ensure_ascii=False)+':'+emit(v[k]) for k in sorted(v))+'}'
  if isinstance(v,list):return '['+','.join(emit(x) for x in v)+']'
  return json.dumps(v,ensure_ascii=False,separators=(',',':'))
 return hashlib.sha256(emit(value).encode()).hexdigest()

def counters():
 status=(pathlib.Path('/proc/1/status')).read_text(); stats=(pathlib.Path('/proc/1/stat')).read_text().rsplit(')',1)[1].split()
 pairs=lambda p:{k:int(v) for k,v in (line.split() for line in (CG/p).read_text().splitlines())}
 rss=int(re.search(r'^VmRSS:\s+(\d+)',status,re.M).group(1))*1024
 return {'at':utc(),'rss_bytes':rss,'cgroup_current_bytes':int((CG/'memory.current').read_text()),'cgroup_peak_bytes':int((CG/'memory.peak').read_text()),'memory_events':pairs('memory.events'),'cpu':pairs('cpu.stat'),'process_cpu_seconds':(int(stats[11])+int(stats[12]))/os.sysconf('SC_CLK_TCK')}

class Transport:
 def __init__(self,label):self.label=label;self.serial=0;self.mu=threading.Lock();self.serverlog=pathlib.Path('/audit/primary-logs')/(os.environ['W1_PRIMARY_ID']+'-json.log')
 def ip(self,pool=10):
  with self.mu:self.serial+=1;v=self.serial
  return f'127.{pool}.{v//250%250}.{v%250+1}'
 def request(self,endpoint,body=None,ip=None,method='POST',cancel=False,small=False,science_file=None,completion=True):
  ip=ip or self.ip();data=body if isinstance(body,bytes) else encode(body) if body is not None else None
  conn=http.client.HTTPConnection('127.0.0.1',8080,timeout=75,source_address=(ip,0));start=time.monotonic();at=utc();offset=0;inode=None
  if completion:
   try:info=self.serverlog.stat();offset=info.st_size;inode=info.st_ino
   except FileNotFoundError:pass
  result={'endpoint':endpoint,'client_ip':ip,'method':method,'start':at,'request_sha256':hashlib.sha256(data or b'').hexdigest(),'status':0,'response_bytes':0,'sha256':'','stream_complete':False,'remaining':None}
  timer=None;h=hashlib.sha256();buffer=bytearray();out=None
  def abort():
   try:
    if conn.sock:conn.sock.shutdown(socket.SHUT_RDWR)
   except OSError:pass
  try:
   conn.connect()
   if cancel:timer=threading.Timer(.1,abort);timer.start()
   conn.request(method,endpoint,data,{'Content-Type':'application/json'});response=conn.getresponse();result['status']=response.status;result['remaining']=response.getheader('RateLimit-Remaining')
   if science_file:out=science_file.open('xb')
   while True:
    chunk=response.read(65536)
    if not chunk:break
    h.update(chunk);result['response_bytes']+=len(chunk)
    if small:buffer.extend(chunk)
    if out:out.write(chunk)
   result['sha256']=h.hexdigest();result['stream_complete']=True
  except Exception as e:result['error']=type(e).__name__+': '+str(e);result['status']=0
  finally:
   if timer:timer.cancel()
   if out:out.close()
   conn.close()
  end=time.monotonic();result['end']=utc();result['monotonic_seconds']=end-start;result['utc_seconds']=stamp(result['end'])-stamp(at);result['elapsed_seconds']=max(result['monotonic_seconds'],result['utc_seconds']);result['clock_discontinuity']=abs(result['utc_seconds']-result['monotonic_seconds'])>1
  if completion:
   deadline=time.monotonic()+5;match=None
   pattern=re.compile(r'\[GIN\].*?\|\s*(\d+)\s*\|.*?\|\s*'+re.escape(ip)+r'\s*\|\s*'+method+r'\s+"'+re.escape(endpoint)+r'"')
   while time.monotonic()<deadline:
    for logfile in [self.serverlog,*self.serverlog.parent.glob(self.serverlog.name+'.*')]:
     if logfile.suffix=='.gz':continue
     try:
      info=logfile.stat()
      if info.st_ino!=inode and logfile!=self.serverlog:continue
      seek=offset if info.st_ino==inode and info.st_size>=offset else 0
      with logfile.open() as log:log.seek(seek);text=log.read()
     except FileNotFoundError:continue  # Atomic logger rename is not a server failure.
     for raw in text.splitlines():
      try:
       entry=json.loads(raw);line=entry['time']+' '+entry['log']
       if stamp(entry['time'])<stamp(at):continue
      except (ValueError,KeyError):continue
      if pattern.search(line):match=line;break
     if match:break
    if match:break
    time.sleep(.005)
   result['server_completion_observed']=match is not None;result['release_observation_seconds']=time.monotonic()-end;result['server_completion_log']=match
  if science_file and result['status']==200 and result['stream_complete']:
   result['scientific_sha256']=canonical(science_file.read_bytes());result['science_file']=str(science_file.relative_to(WORK))
  return result,bytes(buffer)
 def api(self,path,body=None,method='GET'):
  r,b=self.request(path,body,self.ip(220),method=method,small=True,completion=False)
  return r,json.loads(b) if b else {}

class Background:
 def __init__(self,tr,base,index,sustained,folder):
  self.tr=tr;self.base=copy.deepcopy(base);self.index=index;self.sustained=sustained;self.folder=folder;self.jobs={};self.pending=[];self.snapshots=[];self.submissions=[];self.samples=[];self.stop=threading.Event();self.mu=threading.RLock();self.submitted=0;self.started=time.monotonic();self.errors=[]
 def submit(self,runs=None,barrier=False):
  n=self.submitted;self.submitted+=1;count=runs or (64 if self.sustained else 16)
  base=copy.deepcopy(self.base);base['calibration_offset_db']=self.index/10000+n/1000000
  angles=[k*360/count+self.index/100000+n/10000000 for k in range(count)]
  request={'name':'w1-shipping-producer-'+str(self.index)+'-'+str(n),'base':base,'matrix':{'azimuths_deg':angles}}
  response,snapshot=self.tr.api('/api/processes/batch-experiment/execution',request,method='POST');self.submissions.append({'at':utc(),'barrier':barrier,'response':response,'snapshot':snapshot})
  if response['status']!=202 or snapshot.get('cache_hit') or not snapshot.get('job_id'):
   self.errors.append('uncached submission failed');return None
  self.jobs[snapshot['job_id']]=snapshot;self.pending.append(snapshot['job_id']);return snapshot['job_id']
 def poll(self):
  for job_id in self.pending[:]:
   response,snapshot=self.tr.api('/api/jobs/'+job_id)
   if response['status']!=200:self.errors.append('job snapshot unavailable: '+job_id);continue
   record={k:v for k,v in snapshot.items() if k!='result'}
   if record!=self.jobs[job_id]:self.snapshots.append({'observed_at':utc(),**record})
   self.jobs[job_id]=record
   if record['status'] not in ['accepted','running']:self.pending.remove(job_id)
  running=[j for j in self.jobs.values() if j['status']=='running' and not j['cache_hit'] and j['completed_runs']<j['total_runs']]
  self.samples.append({'at':utc(),'elapsed_seconds':time.monotonic()-self.started,'active':bool(running),'queued_observed':sum(j['status']=='accepted' for j in self.jobs.values()),'running_jobs':[j['job_id'] for j in running],'submitted':self.submitted})
  return running
 def loop(self):
  while not self.stop.is_set():
   with self.mu:
    self.poll()
    if self.sustained:
     while len(self.pending)<8 and self.submitted<1024:
      if self.submit() is None:break
     if self.submitted>=1024 and len(self.pending)<8:self.errors.append('producer cap exhausted')
   self.stop.wait(.05)
 def begin(self):
  with self.mu:
   for _ in range(8 if self.sustained else 1):self.submit()
  self.thread=threading.Thread(target=self.loop,daemon=True);self.thread.start();return self.active()
 def active(self):
  deadline=time.monotonic()+5
  while time.monotonic()<deadline:
   with self.mu:
    running=self.poll()
    ready=[j for j in running if 1<=j['completed_runs']<=j['total_runs']//2]
    if ready:return {'observed_at':utc(),'job':copy.deepcopy(ready[0])}
   time.sleep(.025 if running and all(j['completed_runs']>j['total_runs']//2 for j in running) else .002)
  raise RuntimeError('no actual running uncached background job before interactive launch')
 def finish(self):
  self.stop.set();self.thread.join();drain=time.monotonic()
  with self.mu:
   self.poll()
   for job_id in self.pending[:]:
    response,snapshot=self.tr.api('/api/jobs/'+job_id,method='DELETE');self.snapshots.append({'observed_at':utc(),'cancellation_response':response,**{k:v for k,v in snapshot.items() if k!='result'}});self.jobs[job_id]={k:v for k,v in snapshot.items() if k!='result'}
   self.pending=[]
   sentinel=self.submit(runs=1,barrier=True)
   deadline=time.monotonic()+60
   while sentinel and self.jobs[sentinel]['status'] in ['accepted','running'] and time.monotonic()<deadline:self.poll();time.sleep(.01)
   drained=bool(sentinel) and self.jobs[sentinel]['status']=='succeeded' and not self.jobs[sentinel]['cache_hit']
   output={'sustained':self.sustained,'started_at':self.samples[0]['at'] if self.samples else None,'finished_at':utc(),'duration_seconds':time.monotonic()-self.started,'drain_seconds':time.monotonic()-drain,'drain_barrier_pass':drained,'submitted':self.submitted,'errors':self.errors,'samples':self.samples,'snapshots':self.snapshots,'submissions':self.submissions,'final_jobs':list(self.jobs.values())}
   save(self.folder,output);return output

def workload(tr,f,op,peer,peer2,folder,index):
 network=lambda opt,ip:tr.request('/api/optimize-network' if opt else '/api/evaluate-network',f['network'],ip,small=opt)
 def maps(first,opt):
  responses=[first[0]];az={t['id']:t['optimal_azimuth'] for t in json.loads(first[1]).get('optimized_towers',[])} if opt and first[0]['status']==200 else {}
  for i,original in enumerate(f['simulations']):
   body=copy.deepcopy(original)
   if opt and f['network']['towers'][i]['id'] in az:body['azimuth']=az[f['network']['towers'][i]['id']]
   responses.append(tr.request('/api/simulate',body,peer)[0])
  return responses
 if op=='budget':return [tr.request('/api/simulate',f['simulations'][0],peer)[0] for _ in range(21)],{}
 if op=='simulate':return [tr.request('/api/simulate',f['simulations'][0],peer)[0]],{}
 if op in ['evaluate','optimize']:return [network(op=='optimize',peer)[0]],{}
 if op in ['evaluate-maps','optimize-maps']:return maps(network(op=='optimize-maps',peer),op=='optimize-maps'),{}
 if op=='interference':return [tr.request('/api/interference',f['interference'],peer)[0]],{}
 if op=='cycle':return maps(network(False,peer),False)+[tr.request('/api/interference',f['interference'],peer)[0]]+maps(network(False,peer),False),{}
 if op=='explain':
  first,body=network(True,peer)
  if first['status']!=200:return [first],{'error':'Optimize prerequisite failed'}
  value=json.loads(body);solutions=value['pareto_frontier'];recommended=value['optimization']['recommended_solution_id'];solution=next((s for s in solutions if s['id']==recommended),solutions[0])
  explanation={'run_id':value['optimization_run_id'],'solution_id':solution['id'],'cell_id':f['network']['towers'][0]['id'],'baseline':value['baseline'],'solution':solution,'optimization':f['network']['optimization'],'optimization_domain':value['optimization_domain']}
  return [first,tr.request('/api/explain-network-cell',explanation,peer)[0]],{}
 if op=='azimuth':return [tr.request('/api/optimize-azimuth',f['simulations'][0],peer)[0]],{}
 if op in ['surface','surface-control']:
  body=copy.deepcopy(f['simulations'][0]);body['cell_size_m']=25 if op=='surface' else 5
  return [tr.request('/api/coverage-surface',body,peer)[0]],{}
 if op=='building-entry':return [tr.request('/api/building-entry-analysis',f['network'],peer,science_file=folder/f'body-{index}-building-entry.json')[0]],{}
 if op=='recommendation':
  body={k:copy.deepcopy(v) for k,v in f['network'].items() if k in ['towers','rays','radius_m','frequency_ghz','tx_power_dbm','beam_width','calibration_offset_db']};body['towers']=body['towers'][:5];body['network_tech']='4g' if f['frequencyGHz']==2.6 else '5g'
  points=f['network']['towers'];padlat=20/111320
  lo=min(t['tower_lon']-20/(111320*math.cos(t['tower_lat']*math.pi/180)) for t in points);hi=max(t['tower_lon']+20/(111320*math.cos(t['tower_lat']*math.pi/180)) for t in points);a=min(t['tower_lat']-padlat for t in points);b=max(t['tower_lat']+padlat for t in points)
  body['search_polygon']=[[lo,a],[hi,a],[hi,b],[lo,b]]
  return [tr.request('/api/recommend-sites',body,peer)[0]],{}
 if op in ['two-optimizers','optimize-evaluate','two-evaluates']:
  barrier=threading.Barrier(2)
  def run(opt,ip):barrier.wait();return network(opt,ip)[0]
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   a=pool.submit(run,op!='two-evaluates',peer);b=pool.submit(run,op=='two-optimizers',peer2);return [a.result(),b.result()],{}
 if op.startswith(('async-','sustained-')):
  sustained=op.startswith('sustained-');bg=Background(tr,f['simulations'][0],index,sustained,folder/f'async-{index}.json');responses=[];launches=[]
  try:
   bg.begin();start=time.monotonic()
   for _ in range(12 if sustained else 1):
    launches.append(bg.active());responses.append(network(op.endswith('optimize'),peer)[0])
    if not sustained or time.monotonic()-start>=30:break
    time.sleep(3)
   if sustained:
    remaining=30-(time.time()-stamp(responses[0]['start']))  # Final tail relative to actual first request start
    if remaining>0:time.sleep(remaining)
    launches.append(bg.active());responses.append(network(op.endswith('optimize'),peer)[0])
  finally:evidence=bg.finish()
  return responses,{'launches':launches,'background_file':str(bg.folder.relative_to(WORK)),'background_errors':evidence['errors'],'drain_pass':evidence['drain_barrier_pass']}
 if op=='cancel':return [tr.request('/api/optimize-network',f['network'],peer,cancel=True)[0]],{}
 raise ValueError('unknown W1 operation '+op)

def probes(tr,f,peer,peer2):
 gate=threading.Barrier(2)
 def run(ip):gate.wait();return tr.request('/api/evaluate-network',f['network'],ip)[0]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  a=pool.submit(run,peer);b=pool.submit(run,peer2);return [a.result(),b.result()]

def batch(label,precheck=False):
 folder=WORK/label;folder.mkdir(exist_ok=True);tr=Transport(label)
 identity={'observed_at':utc(),'primary_executable_sha256':hashlib.sha256(pathlib.Path('/proc/1/exe').read_bytes()).hexdigest(),'primary_cmdline':pathlib.Path('/proc/1/cmdline').read_bytes().decode().replace('\x00',' '),'primary_cgroup':pathlib.Path('/proc/1/cgroup').read_text(),'observer_cgroup':pathlib.Path('/proc/self/cgroup').read_text(),'initial_counters':counters()}
 save(folder/'process-identity.json',identity)

 if precheck:
  fixture=json.loads((ROOT/'fixtures'/os.environ['W1_FIXTURE']).read_text());bg=Background(tr,fixture['simulations'][0],9000,True,folder/'producer-precheck.json');launches=[]
  try:
   bg.begin();start=time.monotonic()
   while time.monotonic()-start<180:launches.append(bg.active());time.sleep(.05)
   # The precheck deliberately witnesses a final call after the whole duration.
   witness=bg.active();tail=tr.request('/api/evaluate-network',fixture['network'],tr.ip())[0]
  finally:evidence=bg.finish()
  save(folder/'precheck-result.json',{'non_scoring':True,'availability_seconds':180,'launch_witnesses':len(launches),'tail':tail,'tail_witness':witness,'evidence_file':'producer-precheck.json','pass':not evidence['errors'] and evidence['drain_barrier_pass'] and tail['status']==200})
  return
 plan=json.loads((ROOT/'run-plans.json').read_text())[label]
 fresh='-fresh-' in label
 if not fresh:
  fixture=json.loads((ROOT/'fixtures'/(plan[0]['fixture']+'.json')).read_text());warm=tr.request('/api/simulate',fixture['simulations'][0],tr.ip())[0];save(folder/'warmup.json',warm)
  if warm['status']!=200:raise RuntimeError('warmup failed')
 with (folder/'runs.jsonl').open('x') as ledger:
  for index,case in enumerate(plan):
   f=json.loads((ROOT/'fixtures'/(case['fixture']+'.json')).read_text());before=counters();samples=[before];done=threading.Event()
   def sample():
    while not done.wait(.05):samples.append(counters())
   thread=threading.Thread(target=sample,daemon=True);thread.start();peer=tr.ip();peer2=tr.ip();start=time.monotonic();at=utc()
   try:responses,extra=workload(tr,f,case['operation'],peer,peer2,folder,index)
   finally:done.set();thread.join()
   after=counters();samples.append(after);duration=time.monotonic()-start
   # Retain slot-release probes separately from primary workflow timing.
   followups=probes(tr,f,tr.ip() if case['operation']=='budget' else peer,tr.ip() if case['operation']=='budget' else peer2);post=counters()
   record={'qualification_lock_sha256':hashlib.sha256((ROOT/'qualification-lock.json').read_bytes()).hexdigest(),'profile':label.split('-')[0],'batch':label,'plan_index':index,'fixture':case['fixture'],'operation':case['operation'],'repeat':case['repeat'],'domain':f['domain'],'band':f['band'],'frequency_ghz':f['frequencyGHz'],'started_at':at,'finished_at':utc(),'group_monotonic_seconds':duration,'responses':responses,'slot_probes':followups,'before':before,'after':after,'after_probes':post,'rss_sampled_max_bytes':max(s['rss_bytes'] for s in samples),'cgroup_sampled_max_bytes':max(s['cgroup_current_bytes'] for s in samples),'cgroup_lifetime_peak_bytes':post['cgroup_peak_bytes'],'extra':extra}
   ledger.write(json.dumps(record,separators=(',',':'))+'\n');ledger.flush();print(label,index,case['operation'],[r['status'] for r in responses],flush=True)
   # Complete the locked plan even when a measurement fails.
def smoke(label):
 folder=WORK/label;tr=Transport(label);f=json.loads((ROOT/'fixtures'/'sparse-certification-1-2.6-W1.json').read_text());records=[]
 for index,op in enumerate(['simulate','evaluate-maps','interference','cycle','optimize-maps','explain','azimuth','surface','surface-control','building-entry','recommendation','two-optimizers','optimize-evaluate','two-evaluates','cancel','budget','async-optimize','async-evaluate','sustained-evaluate']):
  peer=tr.ip();peer2=tr.ip();responses,extra=workload(tr,f,op,peer,peer2,folder,index);record={'non_scoring':True,'operation':op,'responses':responses,'slot_probes':probes(tr,f,tr.ip() if op=='budget' else peer,tr.ip() if op=='budget' else peer2),'extra':extra};records.append(record);print(op,[r['status'] for r in responses],flush=True)
 save(folder/'smoke-result.json',records)
if __name__=='__main__':
 if os.environ.get('W1_SMOKE')=='1':smoke(os.environ['W1_BATCH'])
 else:batch(os.environ['W1_BATCH'],os.environ.get('W1_PRECHECK')=='1')

