"""Real TCP workflows in the server's Linux network/PID namespace. No RF stubs."""
import concurrent.futures,copy,datetime,hashlib,http.client,json,os,pathlib,re,socket,threading,time
WORK=pathlib.Path('/audit/work');OUT=WORK/os.environ['POLICY_LABEL'];CG=pathlib.Path('/proc/1/root/sys/fs/cgroup')
OUT.mkdir(exist_ok=True)
serial=0;lock=threading.Lock();rows=[]
def ip():
 global serial
 with lock:serial+=1;v=serial
 return f'127.33.{v//250%250}.{v%250+1}'
def encode(v):return json.dumps(v,separators=(',',':'),ensure_ascii=False).encode()
def counters():
 status=pathlib.Path('/proc/1/status').read_text()
 return {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rss_bytes':int(re.search(r'^VmRSS:\s+(\d+)',status,re.M).group(1))*1024,'cgroup_current_bytes':int((CG/'memory.current').read_text()),'cgroup_peak_bytes':int((CG/'memory.peak').read_text()),'events':{k:int(v) for k,v in (x.split() for x in (CG/'memory.events').read_text().splitlines())}}
def request(path,body=None,peer=None,headers=None,method='POST'):
 peer=peer or ip();data=encode(body) if body is not None else None
 c=http.client.HTTPConnection('127.0.0.1',8080,timeout=70,source_address=(peer,0));start=time.monotonic();utc=datetime.datetime.now(datetime.timezone.utc);before=counters()
 c.request(method,path,data,{'Content-Type':'application/json',**(headers or {})});res=c.getresponse();h={k.lower():v for k,v in res.getheaders()};digest=hashlib.sha256();buffer=bytearray()
 while True:
  chunk=res.read(65536)
  if not chunk:break
  digest.update(chunk);buffer.extend(chunk)
 c.close();end=datetime.datetime.now(datetime.timezone.utc);elapsed=max(time.monotonic()-start,(end-utc).total_seconds());after=counters()
 operational={k:v for k,v in h.items() if k.startswith(('ratelimit-','rf-','retry-after')) and k!='rf-workflow-id'}
 if 'rf-workflow-id' in h:operational['workflow_hash']=hashlib.sha256(h['rf-workflow-id'].encode()).hexdigest()
 row={'endpoint':path,'method':method,'client_hash':hashlib.sha256(peer.encode()).hexdigest()[:16],'request_sha256':hashlib.sha256(data or b'').hexdigest(),'status':res.status,'response_bytes':len(buffer),'response_sha256':digest.hexdigest(),'elapsed_seconds':elapsed,'deadline_headroom_seconds':60-elapsed,'headers':operational,'before':before,'after':after}
 with lock:
  rows.append(row)
  with (OUT/'requests.jsonl').open('a') as log:log.write(json.dumps(row,separators=(',',':'))+'\n')
 return row,bytes(buffer),h

def action(f,path,peer,verified,check):
 row,body,h=request(path,f['network'],peer,{'RF-Workflow':'network-maps-v1'} if verified else None);assert row['status']==200,(path,row['status'],body[:200]);check(row)
 result=json.loads(body);angles={x['id']:x['optimal_azimuth'] for x in result['optimized_towers']};requests=[row]
 if verified:assert re.fullmatch('[a-f0-9]{32}',h.get('rf-workflow-id','')) and h['rf-workflow-remaining']==str(f['n']) and h['rf-budget-policy']=='bounded-followups-v1'
 for i,source in enumerate(f['simulations']):
  child=copy.deepcopy(source)
  if path=='/api/optimize-network':child['azimuth']=angles[f['network']['towers'][i]['id']]
  ch={'RF-Workflow-ID':h['rf-workflow-id'],'RF-Workflow-Index':str(i)} if verified else None
  row,body,_=request('/api/simulate',child,peer,ch);assert row['status']==200,(i,row['status'],body[:200]);check(row);requests.append(row)
 return requests

def science_index():
 p=WORK/'frozen-science.json';return json.loads(p.read_text()) if p.exists() else {}
def main():
 (OUT/'process-identity.json').write_text(json.dumps({'exe_sha256':hashlib.sha256(pathlib.Path('/proc/1/exe').read_bytes()).hexdigest(),'primary_cmdline':pathlib.Path('/proc/1/cmdline').read_bytes().decode().replace('\x00',' '),'primary_cgroup':pathlib.Path('/proc/1/cgroup').read_text(),'observer_cgroup':pathlib.Path('/proc/self/cgroup').read_text()},indent=2)+'\n')
 mode=os.environ['POLICY_MODE'];n=int(os.environ['POLICY_CELLS']);fixtures=sorted(p for p in (WORK/'fixtures').glob(f'*-{n}C-W1.json') if not p.name.startswith('historical-continuity'));assert len(fixtures)==16
 baseline=science_index();matched=0;missing=[];groups=[]
 def check(row):
  nonlocal matched
  if row['status']!=200:return
  k=row['endpoint']+' '+row['request_sha256'];known=baseline.get(k)
  if mode=='baseline':baseline[k]=row['response_sha256']
  elif known:assert known==row['response_sha256'],('science',k,known,row['response_sha256']);matched+=1
  else:missing.append(k)
 for file in fixtures:
  f=json.loads(file.read_text());start=len(rows);peer=ip()
  if mode=='baseline':
   action(f,'/api/evaluate-network',peer,False,check)
   action(f,'/api/optimize-network',ip(),False,check)
   row,_,_=request('/api/interference',f['interference'],ip());assert row['status']==200;check(row)
  else:
   action(f,'/api/evaluate-network',peer,True,check)
   row,_,_=request('/api/interference',f['interference'],peer);assert row['status']==200;check(row)
   action(f,'/api/evaluate-network',peer,True,check)
   action(f,'/api/optimize-network',peer,True,check)
   expected=3*n+4;flow=rows[start:];assert len(flow)==expected and all(r['status']==200 for r in flow)
   ordinary=14 if n==6 else 20;assert flow[-1]['headers']['ratelimit-remaining']==str(20-ordinary) and flow[-1]['headers']['rf-followup-remaining']=='0'
   if n==8:
    denied,_,_=request('/api/interference',f['interference'],peer);assert denied['status']==429 and denied['headers']['ratelimit-remaining']=='0' and int(denied['headers']['retry-after'])>=1
  # Single-Cell scientific invariance against the frozen shipping binary.
  child=copy.deepcopy(f['simulations'][0]);peer=ip();headers={'RF-Workflow':'azimuth-sector-v1'} if mode!='baseline' else None
  row,body,h=request('/api/optimize-azimuth',child,peer,headers);assert row['status']==200;check(row);child['azimuth']=json.loads(body)['optimal_azimuth']
  headers={'RF-Workflow-ID':h['rf-workflow-id'],'RF-Workflow-Index':'0'} if mode!='baseline' else None
  row,_,_=request('/api/analyze-sector',child,peer,headers);assert row['status']==200;check(row)
  # Ordinary new-server mode must produce the same JSON too.
  if mode!='baseline':
   action(f,'/api/evaluate-network',ip(),False,check);action(f,'/api/optimize-network',ip(),False,check)
   for path,body in [('/api/optimize-azimuth',f['simulations'][0]),('/api/analyze-sector',child)]:
    row,_,_=request(path,body,ip());assert row['status']==200;check(row)
  groups.append({'fixture':file.name,'fixture_sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'status':'PASS','calls':len(rows)-start})
  print(file.name,'PASS',flush=True)
 if mode=='baseline':(WORK/'frozen-science.json').write_text(json.dumps(baseline,indent=2)+'\n')
 else:assert not missing,('missing frozen science',missing[:3])
 if mode!='baseline':
  security_cases(json.loads(fixtures[0].read_text()))
  critical_cases(json.loads(fixtures[0].read_text()))
 summary={'mode':mode,'cells':n,'discovered':len(fixtures),'executed':len(groups),'passed':len(groups),'skipped':0,'groups':groups,'calls':len(rows),'scientific_matches':matched,'scientific_missing':missing,'worst_success_seconds':max(r['elapsed_seconds'] for r in rows if r['status']==200),'min_deadline_headroom_seconds':min(r['deadline_headroom_seconds'] for r in rows if r['status']==200),'peak_cgroup_bytes':max(r['after']['cgroup_peak_bytes'] for r in rows),'max_rss_bytes':max(r['after']['rss_bytes'] for r in rows),'final_counters':counters()}
 assert summary['worst_success_seconds']<=45 and summary['min_deadline_headroom_seconds']>=15 and summary['peak_cgroup_bytes']<=3<<30
 assert all(summary['final_counters']['events'][k]==0 for k in ['oom','oom_kill','max'])
 (OUT/'requests.json').write_text(json.dumps(rows,indent=2)+'\n');(OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
 print('SUMMARY',json.dumps(summary),flush=True)

def security_cases(f):
 # Independent Simulate is still ordinary20; attempt21 denies.
 peer=ip()
 for i in range(21):
  row,_,_=request('/api/simulate',f['simulations'][0],peer);assert row['status']==(200 if i<20 else 429)
 # Live replay, foreign owner, body mutation, cleanup and missing IDs.
 peer=ip();root,body,h=request('/api/evaluate-network',f['network'],peer,{'RF-Workflow':'network-maps-v1'});assert root['status']==200;token=h['rf-workflow-id']
 headers={'RF-Workflow-ID':token,'RF-Workflow-Index':'0'}
 row,_,_=request('/api/simulate',f['simulations'][0],ip(),headers);assert row['status']==403
 row,_,_=request('/api/simulate',f['simulations'][0],peer,headers);assert row['status']==200
 row,_,_=request('/api/simulate',f['simulations'][0],peer,headers);assert row['status']==409
 bad=copy.deepcopy(f['simulations'][1]);bad['rays']+=1;row,_,_=request('/api/simulate',bad,peer,{'RF-Workflow-ID':token,'RF-Workflow-Index':'1'});assert row['status']==400
 row,_,_=request('/api/simulate',f['simulations'][2],peer,{'RF-Workflow-ID':token,'RF-Workflow-Index':'2'});assert row['status']==410
 row,_,_=request('/api/simulate',f['simulations'][0],peer,{'RF-Workflow-ID':'a'*32,'RF-Workflow-Index':'0'});assert row['status']==410
 peer=ip();row,_,h=request('/api/evaluate-network',f['network'],peer,{'RF-Workflow':'network-maps-v1'});token=h['rf-workflow-id']
 row,_,_=request('/api/rf-workflows',None,ip(),{'RF-Workflow-ID':token},'DELETE');assert row['status']==403
 row,_,_=request('/api/rf-workflows',None,peer,{'RF-Workflow-ID':token},'DELETE');assert row['status']==204
 row,_,_=request('/api/rf-workflows',None,peer,{'RF-Workflow-ID':token},'DELETE');assert row['status']==404
 # Two logical tabs sharing a socket peer share20+8; distinct peers do not.
 peer=ip();action(f,'/api/evaluate-network',peer,True,lambda r:None);action(f,'/api/evaluate-network',peer,True,lambda r:None)
 assert rows[-1]['headers']['ratelimit-remaining']==('14' if f['n']==6 else '10')
 for peer in [ip(),ip()]:
  action(f,'/api/evaluate-network',peer,True,lambda r:None);assert rows[-1]['headers']['ratelimit-remaining']=='19'
 # Production network caps, using valid endpoint-specific request schemas.
 if f['n']==6:
  source=json.loads(next((WORK/'fixtures').glob('*-8C-W1.json')).read_text())
  for count in [6,7,8]:
   network=copy.deepcopy(source['network']);network['towers']=network['towers'][:count]
   for path in ['/api/evaluate-network','/api/optimize-network']:
    row,_,_=request(path,network,ip());assert row['status']==(200 if count==6 else 400),(path,count,row['status'])
   interference=copy.deepcopy(source['interference']);interference['towers']=interference['towers'][:count]
   row,_,_=request('/api/interference',interference,ip());assert row['status']==(200 if count==6 else 400)
   entry={k:v for k,v in network.items() if k not in ['optimization','search_policy','max_search_passes','max_unique_evaluations','max_expanded_states','max_search_rounds']}
   row,_,_=request('/api/building-entry-analysis',entry,ip());assert row['status']==(200 if count==6 else 400)


def critical_cases(f):
 log=pathlib.Path('/audit/primary-logs')/(os.environ['POLICY_PRIMARY_ID']+'-json.log')
 def offset():return log.stat().st_size
 def lines_since(at):
  with log.open() as stream:stream.seek(at);return stream.read()
 def wait_event(at,event,workflow_hash=None):
  deadline=time.monotonic()+5
  while time.monotonic()<deadline:
   for raw in lines_since(at).splitlines():
    try:line=json.loads(raw)['log']
    except (ValueError,KeyError):continue
    if event in line and (workflow_hash is None or workflow_hash in line):return line
   time.sleep(.002)
  raise AssertionError(('missing server event',event))
 def slow(path,body,peer,headers,complete=False):
  data=encode(body);sock=socket.create_connection(('127.0.0.1',8080),timeout=5,source_address=(peer,0))
  raw=(f'POST {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {len(data)}\r\n'+''.join(f'{k}: {v}\r\n' for k,v in headers.items())+'\r\n').encode()
  sock.sendall(raw+(data if complete else data[:1]));return sock,data
 receipts=[]
 for _ in range(3):
  peer=ip();r,_,h=request('/api/evaluate-network',f['network'],peer,{'RF-Workflow':'network-maps-v1'});assert r['status']==200;receipts.append((peer,h['rf-workflow-id']))
 sockets=[]
 try:
  for peer,token in receipts[:2]:
   at=offset();sock,data=slow('/api/simulate',f['simulations'][0],peer,{'RF-Workflow-ID':token,'RF-Workflow-Index':'0'});sockets.append((sock,data));wait_event(at,'event=claim',hashlib.sha256(token.encode()).hexdigest()[:16])
  peer,token=receipts[0]
  row,_,_=request('/api/simulate',f['simulations'][0],peer,{'RF-Workflow-ID':token,'RF-Workflow-Index':'0'});assert row['status']==409
  row,_,_=request('/api/interference',f['interference'],peer);assert row['status']==429 and row['headers']['retry-after']=='1'
  peer,token=receipts[2]
  row,_,_=request('/api/simulate',f['simulations'][0],peer,{'RF-Workflow-ID':token,'RF-Workflow-Index':'0'});assert row['status']==429 and row['headers']['retry-after']=='1'
  peer,token=receipts[0]
  row,_,_=request('/api/simulate',f['simulations'][1],peer,{'RF-Workflow-ID':token,'RF-Workflow-Index':'1'});assert row['status']==429
  for sock,data in sockets:
   sock.sendall(data[1:]);res=http.client.HTTPResponse(sock);res.begin();assert res.status==200;res.read()
 finally:
  for sock,_ in sockets:sock.close()
 # A canceled claimed child keeps its spent unit and retires unused siblings.
 peer=ip();r,_,h=request('/api/evaluate-network',f['network'],peer,{'RF-Workflow':'network-maps-v1'});token=h['rf-workflow-id'];at=offset()
 sock,_=slow('/api/simulate',f['simulations'][0],peer,{'RF-Workflow-ID':token,'RF-Workflow-Index':'0'});wait_event(at,'event=claim',hashlib.sha256(token.encode()).hexdigest()[:16]);sock.close();wait_event(at,'event=retire_failure',hashlib.sha256(token.encode()).hexdigest()[:16])
 row,_,_=request('/api/simulate',f['simulations'][1],peer,{'RF-Workflow-ID':token,'RF-Workflow-Index':'1'});assert row['status']==410
 assert row['headers']['rf-followup-remaining']=='7'
 # Root cancellation after prebooking, before issuance, and subsequent slot release.
 peer=ip();at=offset();sock,_=slow('/api/optimize-network',f['network'],peer,{'RF-Workflow':'network-maps-v1'},True)
 line=wait_event(at,'event=reserved');wfhash=re.search(r'workflow_hash=([a-f0-9]+)',line).group(1)
 assert not any('event=issued' in raw and wfhash in raw for raw in lines_since(at).splitlines())
 sock.close();wait_event(at,wfhash)
 deadline=time.monotonic()+5
 while time.monotonic()<deadline:
  text=lines_since(at)
  if ('event=pending_cancel' in text or 'event=retire_failure' in text) and wfhash in text:break
  time.sleep(.002)
 else:raise AssertionError('root cancellation cleanup unobserved')
 time.sleep(.02)
 row,_,h=request('/api/evaluate-network',f['network'],peer,{'RF-Workflow':'network-maps-v1'});assert row['status']==200 and row['headers']['ratelimit-remaining']=='18'
 row,_,_=request('/api/rf-workflows',None,peer,{'RF-Workflow-ID':h['rf-workflow-id']},'DELETE');assert row['status']==204 and row['headers']['rf-followup-remaining']=='8'
 (OUT/'critical-cases.json').write_text(json.dumps({'passed':['two distinct valid children/global2','same-IP child/ordinary busy1','same slot replay409','global busy child charged/retired','second same-IP child busy/retired','claimed child canceled/charged/retired','pending root cancellation and slot release'],'skipped':0},indent=2)+'\n')

if __name__=='__main__':main()
